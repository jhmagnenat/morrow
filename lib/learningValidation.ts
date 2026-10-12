// Project-specific rubric, not a universal measure of learning quality.
// Missing observations stay pending; agent reviews are not independent reviews.
export interface LearningValidation {
  scope:string;
  content?:{cases:number;reviewed:number;ratings:number[];criticalErrors:number;provenanceIssues:number;independent:boolean};
  understanding?:{questions:number;correct:number;unaided:boolean;independentlyScored:boolean};
  delayedTransfer?:{questions:number;correct:number;unaided:boolean;independentlyScored:boolean;days:number;newProblems:boolean};
  coldGenerations?:Array<{complete:boolean;readyCards:number;elapsedMs:number}>;
}
export function assessLearningValidation(input:LearningValidation){
  if(!input.scope?.trim())throw Error('An explicit evaluated scope is required');
  const integer=(n:number)=>Number.isInteger(n)&&n>=0;
  if(input.content){const c=input.content;if(!integer(c.cases)||!integer(c.reviewed)||c.reviewed>c.cases||!integer(c.criticalErrors)||!integer(c.provenanceIssues)||!Array.isArray(c.ratings)||c.ratings.some(r=>!Number.isInteger(r)||r<0||r>4))throw Error('Invalid content observations');}
  for(const result of [input.understanding,input.delayedTransfer])if(result&&(!integer(result.questions)||!integer(result.correct)||result.correct>result.questions))throw Error('Invalid learner observations');
  if(input.delayedTransfer&&(!Number.isFinite(input.delayedTransfer.days)||input.delayedTransfer.days<0))throw Error('Invalid delay');
  for(const run of input.coldGenerations??[])if(!integer(run.readyCards)||!Number.isFinite(run.elapsedMs)||run.elapsedMs<0)throw Error('Invalid generation observations');
  const c=input.content,u=input.understanding,d=input.delayedTransfer,runs=input.coldGenerations;
  const check=(id:string,observed:boolean,passed:boolean,requirement:string)=>({id,status:!observed?'pending':passed?'passed':'failed',requirement});
  const checks=[
    check('content',Boolean(c&&c.independent&&c.cases>=30&&c.reviewed===c.cases&&c.ratings.length===c.cases*7),Boolean(c&&c.ratings.every(r=>r===4)&&c.criticalErrors===0&&c.provenanceIssues===0),'At least 30 cases, all independently reviewed on seven dimensions, all ratings 4/4, no critical error or unresolved provenance.'),
    check('understanding',Boolean(u&&u.questions>=12&&u.unaided&&u.independentlyScored),Boolean(u&&u.correct===u.questions),'At least 12 independently scored questions answered without notes; all correct.'),
    check('delayedTransfer',Boolean(d&&d.questions>=12&&d.unaided&&d.independentlyScored&&d.days>=7&&d.newProblems),Boolean(d&&d.correct===d.questions),'At least 12 new problems after seven days, answered without notes and independently scored; all correct.'),
    check('generation30s',Boolean(runs&&runs.length>=3),Boolean(runs&&runs.every(r=>r.complete&&r.readyCards>0&&r.elapsedMs<=30000)),'At least three cold full-scope imports, complete with usable cards, each within 30 seconds.'),
  ];
  return {scope:input.scope,checks,score:checks.every(c=>c.status==='passed')?10:null,claimAllowed:checks.every(c=>c.status==='passed'),limitations:['A score applies only to this declared rubric and evaluated scope.','These observations do not prove superiority to another tool or future error-free learning.','Minimum possible generation cost requires separate comparable measurements.']};
}
