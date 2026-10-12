import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),f=await env.load('fsrs'),optimizer=await env.load('fsrsOptimizer'),recovery=await env.load('recovery'),backup=await env.load('backup'),pdf=await env.load('pdfStorage'),scope=await env.load('courseScope'),courses=await env.load('courses');
try{
  assert.equal((await optimizer.fitScheduler([])).accepted,false);
  assert.throws(()=>f.scheduleFsrs(undefined,'good',new Date(),.9,[1]),/parameters/);
  let seed=157;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const target=[...f.FSRS_WEIGHTS];target[2]*=.4;target[3]*=.4;target[8]*=.5;
  const events=[];
  // Synthetic recall is drawn before each review. This validates fitting,
  // not a claim of measured learning improvements in human students.
  for(let card=0;card<50;card++){
    let state,time=Date.parse('2024-01-01T12:00:00Z')+card*86400000;
    for(let review=0;review<60;review++){
      if(state)time+=(3+Math.floor(random()*75))*86400000;
      const p=state?f.retrievability(state.stability,Math.floor((time-Date.parse(state.lastReview))/86400000),target):1;
      const grade=random()<p?'good':'again';events.push({card:String(card),grade,reviewedAt:new Date(time).toISOString()});
      state=f.scheduleFsrs(state,grade,new Date(time),.9,target).memory;
    }
  }
  const fitted=await optimizer.fitScheduler(events);
  assert(fitted.accepted,fitted.reason);assert(f.validFsrsWeights(fitted.weights));
  assert(fitted.validationAfter.logLoss<=fitted.validationBefore.logLoss-.002);
  assert(fitted.validationAfter.brier<=fitted.validationBefore.brier);
  assert.deepEqual((await optimizer.fitScheduler([...events].reverse())).weights,fitted.weights);
  const notion=db.insertNotion({label:'Recovery fixture',domain:'Testing',definition:'Original course content',sources:[],status:'draft'});
  db.gradeCard('notion',notion.id,'easy');
  const original=db.getReviewState('notion',notion.id),due=db.exportSnapshot().reviewState[0].dueAt;
  db.openDb().prepare("INSERT INTO quality_settings VALUES('scheduler-profile',?)").run(JSON.stringify({weights:fitted.weights}));
  assert.notEqual(db.getReviewState('notion',notion.id).fsrs.parameterKey,original.fsrs.parameterKey);
  assert.equal(db.exportSnapshot().reviewState[0].dueAt,due,'Fitting does not rewrite due dates');
  db.resetCardProgress('notion',notion.id);db.gradeCard('notion',notion.id,'easy');
  db.openDb().prepare("UPDATE quality_settings SET value=? WHERE key='scheduler-profile'").run(JSON.stringify({weights:[...f.FSRS_WEIGHTS]}));
  assert.equal(db.getReviewState('notion',notion.id).fsrs.reps,1,'Parameter changes cannot resurrect pre-reset reviews');
  const document=db.insertDocument({title:'Original PDF',kind:'course',pageCount:1});
  const bytes=Buffer.from('%PDF-1.4\nrecovery fixture');pdf.savePdfFile(document.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const point=recovery.createRecoveryPoint('before-reset'),second=recovery.createRecoveryPoint('before-reset');
  const directory=path.join(process.env.MORROW_DATA_DIR,'recovery',scope.scopedCourseId());
  assert.equal(fs.readdirSync(path.join(directory,'blobs')).length,1,'Repeated checkpoints deduplicate PDFs');
  assert.equal(recovery.createRecoveryPoint('periodic-review',true).id,second.id);
  const restored=recovery.recoverySnapshot(point.id);assert.equal(restored.documents[0].pdfBase64,bytes.toString('base64'));
  assert.equal(restored.reviewLog.length,2);assert(restored.quality.quality_settings.some(s=>s.key.startsWith('review-epoch:')));
  const other=courses.createCourse('Independent course');
  scope.withCourse(other.id,()=>assert.throws(()=>recovery.recoverySnapshot(point.id),/not found/));
  const orphanPoint=scope.withCourse(other.id,()=>{
    db.insertNotion({label:'Deleted course',domain:'Testing',definition:'Recovered from a deleted course',sources:[],status:'draft'});
    return recovery.createRecoveryPoint('before-delete-course');
  });
  assert.throws(()=>recovery.recoverySnapshot('../../anything'),/identifier/);
  fs.writeFileSync(path.join(directory,'blobs',`${point.pdfs[0]}.pdf`),'corrupted');
  assert.throws(()=>recovery.recoverySnapshot(point.id),/checksum/);assert.equal(db.exportSnapshot().notions.length,1);
  fs.writeFileSync(path.join(directory,'blobs',`${point.pdfs[0]}.pdf`),bytes);
  db.resetAllData();pdf.deleteAllPdfFiles();backup.restoreWithPdfs(restored);
  assert.equal(db.exportSnapshot().notions[0].definition,'Original course content');assert.deepEqual(pdf.readPdfFile(document.id),bytes);
  const resetRoute=await env.route('app/api/reset/route.ts','reset-route');
  assert.equal((await resetRoute.POST(new Request('http://localhost/api/reset',{method:'POST'}))).status,200);
  assert.equal(db.exportSnapshot().notions.length,0);
  const automatic=recovery.listRecoveryPoints().find(p=>p.reason==='before-reset');assert(automatic);
  backup.restoreWithPdfs(recovery.recoverySnapshot(automatic.id));assert.equal(db.exportSnapshot().notions.length,1);
  const recoverRoute=await env.route('app/api/recovery/route.ts','recovery-route');
  courses.deleteCourse(other.id);
  const response=await recoverRoute.POST(new Request('http://localhost/api/recovery',{method:'POST',body:JSON.stringify({id:orphanPoint.id,sourceCourseId:other.id})}));
  assert.equal(response.status,200);
  assert.equal(db.exportSnapshot().notions[0].definition,'Recovered from a deleted course');
  backup.restoreWithPdfs(restored);
  const scheduler=await env.load('schedulerMaintenance');
  assert.equal((await scheduler.optimizeScheduler(true)).accepted,false);
  const latest=recovery.createRecoveryPoint('integrity');
  const metadata=path.join(directory,`${latest.id}.json`),bad=JSON.parse(fs.readFileSync(metadata,'utf8'));bad.digest='0'.repeat(64);fs.writeFileSync(metadata,JSON.stringify(bad));
  assert.throws(()=>recovery.recoverySnapshot(latest.id),/checksum/);
  fs.writeFileSync(path.join(process.env.MORROW_DATA_DIR,'courses.json'),'{broken');
  assert.equal(courses.listCourses().length,1,'Registry corruption recovers the last published copy');
  console.log('PASS: held-out FSRS fitting, default fallback, parameter replay, reset watermark, PDF deduplication, recovery roundtrip, integrity checks, course isolation and registry recovery. No model calls.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
