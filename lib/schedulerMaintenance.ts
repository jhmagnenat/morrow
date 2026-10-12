import {createHash} from 'node:crypto';
import {openDb} from '@/lib/db';
import {getFsrsWeights} from '@/lib/qualityDb';
import {scopedCourseId} from '@/lib/courseScope';
import {fitScheduler,type ReviewObservation,type SchedulerFit} from '@/lib/fsrsOptimizer';

declare global {var __schedulerFits:Map<string,Promise<SchedulerFit|undefined>>|undefined;}
function observations():ReviewObservation[]{
  const db=openDb(),events:ReviewObservation[]=[];
  const cards=db.prepare('SELECT card_type,card_id FROM review_state ORDER BY last_reviewed_at DESC LIMIT 100').all();
  for(const card of cards){
    const epoch=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`review-epoch:${card.card_type}:${card.card_id}`);
    const after=epoch?JSON.parse(String(epoch.value)).at:'';
    const history=db.prepare("SELECT grade,reviewed_at FROM review_log WHERE card_type=? AND card_id=? AND reviewed_at>? ORDER BY reviewed_at,rowid LIMIT 6001").all(card.card_type,card.card_id,after);
    // Sample whole histories, never initialize a mature card mid-history.
    if(history.length+events.length>6000)continue;
    for(const e of history)events.push({card:`${card.card_type}:${card.card_id}`,grade:String(e.grade) as ReviewObservation['grade'],reviewedAt:String(e.reviewed_at)});
  }
  return events;
}
const fingerprint=(events:ReviewObservation[])=>createHash('sha256').update(JSON.stringify(events)).digest('hex');
export function schedulerDiagnostics(){
  const db=openDb(),row=db.prepare("SELECT value FROM quality_settings WHERE key='scheduler-fit'").get();
  return {algorithm:'FSRS-6',weights:getFsrsWeights(),reviewCount:Number(db.prepare('SELECT COUNT(*) n FROM review_log').get()?.n??0),lastFit:row?JSON.parse(String(row.value)):null,minimum:{cards:5,trainingRecalls:100,trainingFailures:10,validationRecalls:30,validationFailures:3},optimizer:'bounded coordinate search; chronological held-out validation'};
}
export function optimizeScheduler(force=false):Promise<SchedulerFit|undefined>{
  const course=scopedCourseId(),tasks=globalThis.__schedulerFits??=new Map();
  const running=tasks.get(course);if(running)return running;
  const task=fit(force).finally(()=>tasks.delete(course));tasks.set(course,task);return task;
}
async function fit(force:boolean){
  const db=openDb(),diagnostics=schedulerDiagnostics();
  if(!force&&(diagnostics.reviewCount<200||diagnostics.reviewCount-Number(diagnostics.lastFit?.reviewCount??0)<200))return;
  const events=observations(),history=fingerprint(events),weights=getFsrsWeights(),baseline=JSON.stringify(weights);
  const result=await fitScheduler(events,weights);
  if(fingerprint(observations())!==history||JSON.stringify(getFsrsWeights())!==baseline)return {...result,accepted:false,reason:'Review history or scheduler changed during fitting; result not applied'};
  db.exec('BEGIN IMMEDIATE');
  try{
    const checkedAt=new Date().toISOString();
    if(result.accepted)db.prepare("INSERT INTO quality_settings VALUES('scheduler-profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({version:1,weights:result.weights,checkedAt,history}));
    db.prepare("INSERT INTO quality_settings VALUES('scheduler-fit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({...result,checkedAt,reviewCount:diagnostics.reviewCount,history}));
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
