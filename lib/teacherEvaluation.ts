export interface HumanEvaluation {
  runId:string;
  cards:Array<{id:string;decision:'keep'|'edit'|'reject';factualError:boolean;notes:string}>;
  lesson:{correctness:number;context:number;clarity:number;majorErrors:number;notes:string};
  objectives:Array<{id:string;covered:boolean}>;
  correctionMinutes:number;
}
export function evaluateTeacherRun(run:{runId:string;status:string;cardIds:string[];objectiveIds:string[];costUsd:number},review:HumanEvaluation){
  const score=(n:number)=>Number.isInteger(n)&&n>=0&&n<=10;
  const unique=(items:string[])=>new Set(items).size===items.length;
  if(review.runId!==run.runId||!unique(review.cards.map(c=>c.id))||review.cards.length!==run.cardIds.length||review.cards.some(c=>!run.cardIds.includes(c.id)||!['keep','edit','reject'].includes(c.decision)||typeof c.factualError!=='boolean'))throw Error('Human review must cover every card exactly once from this run.');
  if(!review.lesson||![review.lesson.correctness,review.lesson.context,review.lesson.clarity].every(score)||!Number.isInteger(review.lesson.majorErrors)||review.lesson.majorErrors<0||!Number.isFinite(review.correctionMinutes)||review.correctionMinutes<0)throw Error('Complete the lesson scores, error count and correction time.');
  if(!unique(review.objectives.map(o=>o.id))||review.objectives.length!==run.objectiveIds.length||review.objectives.some(o=>!run.objectiveIds.includes(o.id)||typeof o.covered!=='boolean'))throw Error('Review every expected objective exactly once.');
  const kept=review.cards.filter(c=>c.decision==='keep').length,errors=review.cards.filter(c=>c.factualError).length;
  const keptRatio=run.cardIds.length?kept/run.cardIds.length:0,coverage=run.objectiveIds.length?review.objectives.filter(o=>o.covered).length/run.objectiveIds.length:null;
  const passed=run.status==='complete'&&run.cardIds.length>0&&errors===0&&review.lesson.majorErrors===0&&review.lesson.correctness>=9&&review.lesson.context>=8&&review.lesson.clarity>=8&&keptRatio>=0.8&&coverage!==null&&coverage>=0.8;
  return {passed,decision:passed?'eligible-for-one-full-course':'revise-before-more-paid-runs',kept,total:run.cardIds.length,keptRatio,factualErrors:errors,coverage,costPerKeptCard:kept?run.costUsd/kept:null,correctionMinutes:review.correctionMinutes,lesson:review.lesson};
}
