import {FSRS_BOUNDS,FSRS_WEIGHTS,retrievability,scheduleFsrs,validFsrsWeights,type FsrsGrade,type FsrsMemory} from '@/lib/fsrs';

export interface ReviewObservation {card:string;grade:FsrsGrade;reviewedAt:string;}
export interface PredictionMetrics {count:number;failures:number;logLoss:number;brier:number;}
export interface SchedulerFit {accepted:boolean;reason:string;weights:number[];training:PredictionMetrics;validationBefore:PredictionMetrics;validationAfter:PredictionMetrics;observations:number;cards:number;}
const grades=['again','hard','good','easy'];

// All predictions are made BEFORE seeing the current outcome. Split by global
// time, and keep each card's preceding history to avoid future-data leakage.
export function evaluateScheduler(events:ReviewObservation[],weights:readonly number[]=FSRS_WEIGHTS,cutoff=Infinity){
  const states=new Map<string,FsrsMemory>(),train={count:0,failures:0,logLoss:0,brier:0},validation={...train};
  for(const event of events){
    const time=Date.parse(event.reviewedAt),previous=states.get(event.card);
    if(previous){
      const elapsed=Math.floor((time-Date.parse(previous.lastReview))/86400000);
      if(elapsed>=1){
        const p=Math.max(.000001,Math.min(.999999,retrievability(previous.stability,elapsed,weights))),y=event.grade==='again'?0:1;
        const metric=time<=cutoff?train:validation;
        metric.count++;metric.failures+=1-y;metric.logLoss+=-y*Math.log(p)-(1-y)*Math.log(1-p);metric.brier+=(p-y)**2;
      }
    }
    states.set(event.card,scheduleFsrs(previous,event.grade,new Date(time),.9,weights).memory);
  }
  for(const metric of [train,validation])if(metric.count){metric.logLoss/=metric.count;metric.brier/=metric.count;}
  return {train,validation};
}

export async function fitScheduler(input:ReviewObservation[],baseline:readonly number[]=FSRS_WEIGHTS):Promise<SchedulerFit>{
  if(!validFsrsWeights(baseline))throw Error('Invalid baseline FSRS parameters');
  if(input.length>6000)throw Error('Fit accepts at most 6000 review events');
  const events=input.filter(e=>e.card&&grades.includes(e.grade)&&Number.isFinite(Date.parse(e.reviewedAt))).sort((a,b)=>Date.parse(a.reviewedAt)-Date.parse(b.reviewedAt));
  const cards=new Set(events.map(e=>e.card)).size;
  const cutoff=events.length?Date.parse(events[Math.max(0,Math.floor(events.length*.8)-1)].reviewedAt):0;
  const before=evaluateScheduler(events,baseline,cutoff);
  const result=(accepted:boolean,reason:string,weights:readonly number[],metrics=before):SchedulerFit=>({accepted,reason,weights:[...weights],training:metrics.train,validationBefore:before.validation,validationAfter:metrics.validation,observations:events.length,cards});
  if(cards<5||before.train.count<100||before.train.failures<10||before.validation.count<30||before.validation.failures<3)return result(false,'Insufficient independent long-term recall observations; defaults retained',baseline);
  const baselinePenalty=(weights:readonly number[])=>weights.reduce((n,w,i)=>n+((w-baseline[i])/Math.max(.1,baseline[i]))**2,0)*.0005;
  let weights=[...baseline],loss=before.train.logLoss;
  // Bounded coordinate search over all 21 published parameters. Regularize
  // toward the current profile and accept only on the untouched validation set.
  for(const fraction of [.25,.12,.06])for(let index=0;index<21;index++){
    let best=weights,bestLoss=loss;
    for(const direction of [-1,1]){
      const candidate=[...weights],step=Math.max(.001,Math.abs(weights[index])*fraction);
      candidate[index]=Math.max(FSRS_BOUNDS[index][0],Math.min(FSRS_BOUNDS[index][1],candidate[index]+direction*step));
      const metrics=evaluateScheduler(events,candidate,cutoff),candidateLoss=metrics.train.logLoss+baselinePenalty(candidate);
      if(candidateLoss<bestLoss-1e-6){best=candidate;bestLoss=candidateLoss;}
    }
    weights=best;loss=bestLoss;
    await new Promise<void>(resolve=>setImmediate(resolve));
  }
  const after=evaluateScheduler(events,weights,cutoff);
  if(after.validation.logLoss>before.validation.logLoss-.002||after.validation.brier>before.validation.brier)return result(false,'No held-out improvement; current parameters retained',baseline,after);
  return result(true,'Lower held-out log loss without worse Brier score',weights,after);
}
