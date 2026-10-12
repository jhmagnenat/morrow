import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const env=await isolatedModules([...DATABASE_MODULES,'pdf'],{
  llm:`export function isLlmConfigured(){return true;}export function currentProviderLabel(){return 'architecture-fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  generateSlides:`const locks=new Set();export function generationLocks(){return locks;}export async function generateSlides(id,options){return globalThis.__legacy(id,options);}`,
  sectionGeneration:`export const CORE_PIPELINE_VERSION='architecture-fixture';export async function generateLearningSection(id,options){return globalThis.__section(id,options);}`,
  directCardGeneration:`export async function generateDirectCards(id,options){return globalThis.__section(id,options);}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),scope=await env.load('courseScope'),courses=await env.load('courses');
const {chunkPagesIntoPassages}=await env.load('pdf');
const passages=chunkPagesIntoPassages([{page:1,text:'Family\tRisk\tFeature\nLife\tDeath\tLong duration\n\nConditions: unchanged estimate.\nSettlement: cash and liability decrease.'}]);
assert.equal(passages.map(p=>p.text).join('\n\n'),'Family Risk Feature\nLife Death Long duration\n\nConditions: unchanged estimate.\nSettlement: cash and liability decrease.','Row, paragraph and condition boundaries survive chunking');

const {sameCardObjective,canonicalCardContent}=await env.load('contentQuality');
for(const [left,right] of [['x+1','x-1'],['x\u00b2','x2'],['x\u22641','x\u22651'],["f(x)","f\u2032(x)"],['5%','5'],['CO','Co']]){
  const existing={id:'existing',question:`Evaluate ${left}`,objective:`Evaluate ${left}`,kind:'application'};
  assert(!sameCardObjective(existing,{question:`Evaluate ${right}`,objective:`Evaluate ${right}`,kind:'application'}),`Distinct symbols remain distinct: ${left} / ${right}`);
  assert.notEqual(canonicalCardContent(left),canonicalCardContent(right),'New card identifiers preserve mathematical distinctions');
}
assert.equal(canonicalCardContent('  Evaluate   x+1  '),canonicalCardContent('Evaluate x+1'),'Harmless whitespace remains normalized');

const telemetry=await env.load('llmTelemetry');
const stats={requests:0,inputTokens:0,outputTokens:0,elapsedMs:0,failures:0};
await telemetry.withLlmTelemetry(stats,async()=>{
  await telemetry.observeLlm(async()=>({privateContent:'Never log the prompt or response body.',model:'fixture-resolved-model'}),response=>({input:20,output:10,model:response.model}),{tool:'source-check',model:'fixture-requested-model'});
  await assert.rejects(telemetry.observeLlm(async()=>{throw Error('Provider failed');},undefined,{tool:'failed-check',model:'fixture-requested-model'}),/Provider failed/);
});
assert.equal(stats.requests,2);assert.equal(stats.inputTokens,20);assert.equal(stats.failures,1);
assert.equal(stats.callTraces[0].providerModel,'fixture-resolved-model','Trace distinguishes the requested alias from the model actually returned');
assert.deepEqual(stats.callTraces.map(c=>c.status),['succeeded','failed']);
assert(!JSON.stringify(stats).includes('Never log'),'Profiling never persists generated content or source text');

const audit=await env.load('accuracyAudit');
const source={id:'S1',text:'The original source supports an explicitly scoped factual statement.'};
const fields=Array.from({length:25},(_,i)=>({key:`fact-${i}`,text:'An explicitly scoped factual statement.',kind:'fact',sourceIds:['S1']}));
let active=0,maxActive=0,requests=0,release,firstWave;
let wave=new Promise(resolve=>firstWave=resolve),gate=new Promise(resolve=>release=resolve);
globalThis.__accuracyComplete=async(_system,prompt)=>{
  active++;requests++;maxActive=Math.max(maxActive,active);
  if(requests===2)firstWave();
  await gate;
  const input=JSON.parse(prompt);active--;
  return {decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'',claims:[{text:f.text,verdict:f.key==='fact-24'?'unsupported':'supported',evidence:[{sourceId:'S1',quote:source.text}],reasoning:'Explicit test verdict, not a real quality rating.'}]}))};
};
try{
  process.env.MORROW_ACCURACY_CONCURRENCY='2';
  const checking=audit.auditAccuracy(fields,[source],{subject:'Parallel source checks'});
  await wave;assert.equal(active,2,'Independent batches start before either completes');release();
  const issues=await checking;
  assert.equal(maxActive,2,'Concurrency is bounded');assert.equal(requests,3,'Each source batch is checked exactly once');
  assert.deepEqual([...issues.keys()],['fact-24'],'Parallel scheduling preserves a negative factual verdict');
  await audit.auditAccuracy(fields,[source],{subject:'Parallel source checks'});assert.equal(requests,3,'Positive and negative verdicts remain cached');

  let started=0,finishRemaining,secondStarted;
  const startedBoth=new Promise(resolve=>secondStarted=resolve),remaining=new Promise(resolve=>finishRemaining=resolve);
  globalThis.__accuracyComplete=async()=>{
    started++;const index=started;if(index===2)secondStarted();
    if(index===1){await startedBoth;throw Error('Provider test failure');}
    await remaining;return {decisions:[]};
  };
  let terminated=false;
  const failing=audit.auditAccuracy(fields,[source],{subject:'Drain failed concurrent review'});
  failing.catch(()=>{terminated=true;});
  await startedBoth;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(terminated,false,'A failed review waits for its already active request before returning');
  finishRemaining();await assert.rejects(failing,/Provider test failure/);assert.equal(started,2,'A failed worker stops dispatching new paid requests');

  const dispatch=await env.load('generationDispatch');
  let progressiveCalls=0,legacyCalls=0;
  const result={notions:[],links:[],cardsCreated:0,readyCards:0,warnings:[],processed:0,usage:{requests:0,inputTokens:0,outputTokens:0,elapsedMs:0,failures:0}};
  globalThis.__section=async(_id,options)=>{progressiveCalls++;return {...result,pages:options.pages};};
  globalThis.__legacy=async(_id,options)=>{legacyCalls++;return {...result,pages:options.pages};};
  await scope.withCourse(courses.createCourse('Shared generation dispatch').id,async()=>{
    const doc=db.insertDocument({title:'Dispatch fixture',kind:'course',pageCount:4});
    db.insertPassages([1,2,3,4].map(page=>({documentId:doc.id,page,ordinal:0,text:source.text})));
    process.env.MORROW_GENERATION_PIPELINE='progressive';
    assert.deepEqual((await dispatch.generateConfiguredSection(doc.id,{mode:'strict',enrichment:false})).pages,[1,2,3]);
    const route=await env.route('app/api/documents/[id]/generate/route.ts','shared-dispatch-route');
    const response=await route.POST(new Request(`http://localhost/api/documents/${doc.id}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pages:[4]})}),{params:Promise.resolve({id:doc.id})});
    assert.equal(response.status,200);assert.deepEqual((await response.json()).pages,[4]);
    assert.equal(progressiveCalls,2);assert.equal(legacyCalls,0,'Foreground HTTP no longer silently selects the legacy pipeline');
    process.env.MORROW_GENERATION_PIPELINE='fast';await dispatch.generateConfiguredSection(doc.id,{mode:'strict',enrichment:false,pages:[1]});assert.equal(legacyCalls,0,'Historical environment values cannot select an old production engine');
    quality.savePageAnalysis(doc.id,{page:1,kind:'content',status:'retry',reason:'Previously attempted.',warnings:[],concepts:0,cards:0,version:(await env.load('directCardContracts')).DIRECT_CARD_VERSION,updatedAt:new Date().toISOString()});
    process.env.MORROW_GENERATION_PIPELINE='progressive';
    assert.deepEqual((await dispatch.generateConfiguredSection(doc.id,{mode:'strict',enrichment:false,skipRetried:true})).pages,[2,3,4],'The shared dispatcher preserves the bounded retry policy');
  });
  console.log('PASS: preserved PDF boundaries, concurrent complete factual review, cached rejection, failed-request drain, bounded dispatch and matching foreground/configured pipelines. Simulated models; no measured live quality or speed.');
}finally{
  delete globalThis.__accuracyComplete;delete globalThis.__section;delete globalThis.__legacy;
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
}
