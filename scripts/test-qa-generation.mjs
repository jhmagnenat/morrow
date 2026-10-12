import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'qaGeneration'],{llm:`export class LlmNotConfiguredError extends Error{} export class LlmProviderError extends Error{} export function currentProviderLabel(){return 'fixture';} export async function structuredCompletion(...args){return globalThis.__qaComplete(...args);}`});
const db=await env.load('db'),quality=await env.load('qualityDb'),qa=await env.load('qaGeneration');
const source='Pricing determines the premium charged for a risk. Underwriting decides whether to accept the risk and on what terms.';
const doc=db.insertDocument({title:'Insurance course',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
const notion=db.insertNotion({label:'Pricing',domain:'Insurance',definition:'Pricing determines the premium charged for a risk.',sources:[{documentId:doc.id,page:1}],status:'validated'});
let scenario='normal',calls=0,pause,release;
globalThis.__qaComplete=async(system,prompt,tool)=>{
  calls++;const input=JSON.parse(prompt);
  assert(!system.includes('CV'));assert.equal(input.notion.label,'Pricing');
  if(tool==='generate_qa'){
    if(pause){pause=false;await new Promise(resolve=>release=resolve);}
    return {cards:[{question:scenario==='normal'?'What is the difference between pricing and underwriting?':`For pricing, what does ${scenario} mean?`,answer:scenario==='arithmetic'?'3 × 4 = 15.':source,kind:'comparison',objective:`Pricing distinction ${scenario}`,sourceIds:scenario==='forged'?['foreign:99']:[`${doc.id}:1`]}]};
  }
  assert.equal(tool,'audit_qa');
  if(scenario==='race')db.openDb().prepare('UPDATE passages SET text=? WHERE document_id=?').run('Source changed during generation.',doc.id);
  if(scenario==='missing')return {decisions:[]};
  return {decisions:[{index:0,supported:scenario!=='rejected',answersQuestion:true,atomic:true,duplicateOf:'',reason:scenario==='rejected'?'This answer is not supported.':'Full answer supported by original passage.'}]};
};
try{
  const result=await qa.generateQaQuestions(notion.id);assert.equal(result.ready,1);
  const saved=quality.getStudyCards()[0];assert.equal(saved.evidence[0].quote,source);assert.equal(saved.notionId,notion.id);assert(saved.id.startsWith('qa-'));
  db.gradeCard('notion',saved.id,'good');const state=db.getReviewState('notion',saved.id);
  assert.equal((await qa.generateQaQuestions(notion.id)).duplicates,1);assert.deepEqual(db.getReviewState('notion',saved.id),state,'Regeneration never resets reviewed scheduling');
  for(scenario of ['rejected','missing','forged','arithmetic']){const result=await qa.generateQaQuestions(notion.id);assert.equal(result.ready,0);assert.equal(result.draft,1);}
  scenario='single-flight';pause=true;const a=qa.generateQaQuestions(notion.id),b=qa.generateQaQuestions(notion.id);assert.equal(a,b,'Concurrent requests share one generation');release();assert.equal((await a).ready,1);
  scenario='race';const before=quality.getStudyCards().length;await assert.rejects(()=>qa.generateQaQuestions(notion.id),/sources changed/);assert.equal(quality.getStudyCards().length,before,'Stale source generation commits nothing');
  const manual=db.insertNotion({label:'No source',domain:'Insurance',definition:'Manual note.',sources:[],status:'validated'}),beforeCalls=calls;
  await assert.rejects(()=>qa.generateQaQuestions(manual.id),/No source text/);assert.equal(calls,beforeCalls,'Missing sources skip all model calls');
  assert.throws(()=>qa.generateQaQuestions(notion.id,6),/one and five/);
  const route=await env.route('app/api/qa/generate/route.ts','qa-route');assert.equal((await route.POST(new Request('http://localhost/api/qa/generate',{method:'POST',body:'{"count":9}'}))).status,400);
  console.log('PASS: novel source-grounded course Q&A, exact evidence, duplicate/history protection, unsupported/missing/forged/arithmetic drafts, single-flight, source-race rollback and source-less call prevention. Simulated model only.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
