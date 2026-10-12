// FSRS-6 memory equations and published default weights, implemented locally.
// https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
// Scheduling policy: deterministic intervals, 1m/10m learning, 10m relearning.
// Parameters can be fitted locally with held-out validation; no fuzzing.
export const FSRS_WEIGHTS = [0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542] as const;
export type FsrsGrade = 'again'|'hard'|'good'|'easy';
export interface FsrsMemory {version:6;stability:number;difficulty:number;reps:number;lapses:number;state:'learning'|'review'|'relearning';step:number;lastReview:string;parameterKey?:string;}
// Published FSRS-6 parameter bounds, with short-term learning enabled.
export const FSRS_BOUNDS:readonly (readonly [number,number])[]=[[.001,100],[.001,100],[.001,100],[.001,100],[1,10],[.001,4],[.001,4],[.001,.75],[0,4.5],[0,.8],[.001,3.5],[.001,5],[.001,.25],[.001,.9],[0,4],[0,1],[1,6],[0,2],[0,2],[.01,.8],[.1,.8]];
export function validFsrsWeights(value:unknown):value is number[]{return Array.isArray(value)&&value.length===21&&value.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>=FSRS_BOUNDS[i][0]&&v<=FSRS_BOUNDS[i][1]);}
export const fsrsParameterKey=(weights:readonly number[]=FSRS_WEIGHTS)=>weights.map(w=>w.toFixed(8)).join(',');
const clip=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const initialDifficulty=(g:number,w:readonly number[])=>clip(w[4]-Math.exp(w[5]*(g-1))+1,1,10);
export function retrievability(stability:number,elapsedDays:number,w:readonly number[]=FSRS_WEIGHTS){return Math.pow(1+(Math.pow(0.9,-1/w[20])-1)*Math.max(0,elapsedDays)/stability,-w[20]);}
export function fsrsInterval(stability:number,retention=0.9,w:readonly number[]=FSRS_WEIGHTS){
  if(!Number.isFinite(retention)||retention<0.7||retention>0.99)throw Error('Retention must be between 0.70 and 0.99');
  return clip(Math.round(stability*(Math.pow(retention,-1/w[20])-1)/(Math.pow(0.9,-1/w[20])-1)),1,36500);
}
export function validFsrsMemory(value:unknown):value is FsrsMemory {
 const m=value as FsrsMemory;
 return !!m&&m.version===6&&Number.isFinite(m.stability)&&m.stability>=0.001&&m.stability<=36500&&Number.isFinite(m.difficulty)&&m.difficulty>=1&&m.difficulty<=10&&Number.isInteger(m.reps)&&m.reps>=1&&Number.isInteger(m.lapses)&&m.lapses>=0&&['learning','review','relearning'].includes(m.state)&&Number.isInteger(m.step)&&m.step>=0&&m.step<=1&&typeof m.lastReview==='string'&&Number.isFinite(Date.parse(m.lastReview))&&(m.parameterKey===undefined||typeof m.parameterKey==='string'&&m.parameterKey.length<=500);
}
export function scheduleFsrs(previous:FsrsMemory|undefined,grade:FsrsGrade,now=new Date(),retention=0.9,weights:readonly number[]=FSRS_WEIGHTS){
 if(!Number.isFinite(now.getTime()))throw Error('Invalid review time');
 const g=['again','hard','good','easy'].indexOf(grade)+1;if(!g)throw Error('Invalid review grade');
 if(previous&&!validFsrsMemory(previous))throw Error('Invalid FSRS memory');
 if(!validFsrsWeights(weights))throw Error('Invalid FSRS parameters');
 const w=weights;
 let stability:number,difficulty:number;
 if(!previous){stability=Math.max(.1,w[g-1]);difficulty=initialDifficulty(g,w);}
 else {
  const elapsed=Math.max(0,Math.floor((now.getTime()-Date.parse(previous.lastReview))/86400000));
  const {stability:s,difficulty:d}=previous;
  const r=retrievability(s,elapsed,w);
  if(elapsed===0){const growth=Math.exp(w[17]*(g-3+w[18]))*Math.pow(s,-w[19]);stability=s*(g>=2?Math.max(1,growth):growth);}
  else if(g===1){const forgotten=w[11]*Math.pow(d,-w[12])*(Math.pow(s+1,w[13])-1)*Math.exp(w[14]*(1-r));stability=Math.min(forgotten,s/Math.exp(w[17]*w[18]));}
  else {stability=s*(1+Math.exp(w[8])*(11-d)*Math.pow(s,-w[9])*(Math.exp(w[10]*(1-r))-1)*(g===2?w[15]:1)*(g===4?w[16]:1));}
  difficulty=clip(w[7]*initialDifficulty(4,w)+(1-w[7])*(d-w[6]*(g-3)*(10-d)/9),1,10);
 }
 stability=clip(stability,0.001,36500);
 let intervalDays=fsrsInterval(stability,retention,w),state:FsrsMemory['state']='review',step=0;
 const learning=!previous||previous.state!=='review';
 if(g===1){state=previous?.state==='review'||previous?.state==='relearning'?'relearning':'learning';intervalDays=state==='learning'?1/1440:10/1440;}
 else if(g===2&&learning){state=previous?.state??'learning';step=previous?.step??0;intervalDays=state==='relearning'?15/1440:step===0?6/1440:10/1440;}
 else if(g===3&&(!previous||previous.state==='learning'&&previous.step===0)){state='learning';step=1;intervalDays=10/1440;}
 const memory:FsrsMemory={version:6,stability,difficulty,reps:(previous?.reps??0)+1,lapses:(previous?.lapses??0)+(g===1&&previous?.state==='review'?1:0),state,step,lastReview:now.toISOString(),parameterKey:fsrsParameterKey(w)};
 return {memory,intervalDays,dueAt:new Date(now.getTime()+intervalDays*86400000).toISOString()};
}
export function replayFsrs(events:Array<{grade:FsrsGrade;reviewedAt:string}>,retention=0.9,weights:readonly number[]=FSRS_WEIGHTS){
 let memory:FsrsMemory|undefined;
 for(const event of [...events].sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)))memory=scheduleFsrs(memory,event.grade,new Date(event.reviewedAt),retention,weights).memory;
 return memory;
}
