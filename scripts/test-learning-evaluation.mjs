import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'learningEvaluation']);process.chdir(env.workspace);
const db=await env.load('db'),evaluation=await env.load('learningEvaluation');
try{
  for(let i=0;i<5;i++)db.insertNotion({label:`Concept ${i}`,domain:'Testing',definition:'An explanation without a supplied source.',sources:[],status:'draft'});
  const snapshot=db.exportSnapshot(),report=evaluation.buildLearningEvaluation(snapshot,'default',3);
  assert.equal(report.cases.length,3);assert.deepEqual(evaluation.buildLearningEvaluation({...snapshot,notions:[...snapshot.notions].reverse()},'default',3).cases.map(c=>c.id),report.cases.map(c=>c.id));
  assert.equal(evaluation.scoreLearningEvaluation(report).passRate,null);assert.equal(evaluation.scoreLearningEvaluation(report).coverage,0);
  report.cases[0].ratings=Object.fromEntries(evaluation.EVALUATION_DIMENSIONS.map(d=>[d,4]));report.cases[0].criticalErrors=0;
  const scored=evaluation.scoreLearningEvaluation(report);assert.equal(scored.reviewed,1);assert.equal(scored.passed,0,'A high rating cannot hide missing provenance');assert.equal(scored.coverage,1/3);
  report.cases[0].provenanceIssues=[];report.cases[0].criticalErrors=1;assert.equal(evaluation.scoreLearningEvaluation(report).passed,0,'Critical errors override high averages');
  report.cases[0].criticalErrors=0;assert.equal(evaluation.scoreLearningEvaluation(report).passed,1);
  report.cases[0].ratings.mechanism=5;assert.throws(()=>evaluation.scoreLearningEvaluation(report),/Rating/);
  console.log('PASS: reproducible source-based evaluation samples, no invented quality score, incomplete-review coverage, critical-error/provenance gates and rubric validation. No model calls.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
