import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'explain','learningTasks'],{
  llm:`export function currentProviderLabel(){return globalThis.__reviewer;}export class LlmNotConfiguredError extends Error{}export class LlmProviderError extends Error{}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb');
const source='For a rectangle, area equals width multiplied by height. Both lengths must use the same unit and area is measured in square units. With width 3 and height 4, area is 12 square units. Holding height fixed, doubling width doubles area.';
const doc=db.insertDocument({title:'Source explanations',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
const notion=db.insertNotion({label:'Rectangle area',domain:'Geometry',definition:'An untrusted old definition.',explanation:'An untrusted old explanation.',status:'draft',sources:[{documentId:doc.id,page:1}]});quality.setNotionMetadata(notion.id,'course',[{documentId:doc.id,page:1,quote:source}]);
const unsourced=db.insertNotion({label:'Missing source',domain:'Geometry',definition:'Unverified.',status:'draft',sources:[]});
const routes={adept:await env.route('app/api/notions/[id]/adept/route.ts','adept-route'),further:await env.route('app/api/notions/[id]/go-further/route.ts','further-route'),explain:await env.route('app/api/notions/[id]/explain/route.ts','explain-route')};
let scenario='positive',calls=0,lastGeneration;
globalThis.__reviewer='positive-reviewer';
globalThis.__complete=async(system,prompt,tool)=>{
  calls++;lastGeneration={system,input:JSON.parse(prompt),tool};
  if(scenario==='source-race')db.openDb().prepare('UPDATE passages SET text=text||? WHERE document_id=?').run(' The source changed.',doc.id);
  if(tool==='adept_explanation')return {analogy:'',diagram:'',example:'Hypothetically width is 3 metres and height is 4 metres. Area is 12 square metres because 3 * 4 = 12.',plainEnglish:'Multiply the width by the height to count the unit squares in a rectangle.',technical:'For a rectangle, area equals width multiplied by height.'};
  if(tool==='go_further_note')return {moreExamples:'Hypothetically width is 6 and height is 4. Area is 24 square units because 6 * 4 = 24.',nextStep:'Holding height fixed, doubling width doubles area.',references:scenario==='false-reference'?'Professor Rectangle recommends an imaginary textbook.':''};
  if(tool==='grade_explanation')return {verdict:'pass',coveredKeywords:[],missingKeywords:[],feedback:'The explanation follows the rectangle rule.',correctedText:'For a rectangle, area equals width multiplied by height.',exampleAnswer:'For a rectangle, area equals width multiplied by height.'};
  throw Error(`Unexpected generation stage ${tool}`);
};
globalThis.__accuracyComplete=async(system,prompt)=>{
  const input=JSON.parse(prompt);
  return {decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'',claims:[{text:f.text,verdict:scenario==='false-reference'&&f.key==='references'||scenario==='false-explanation'&&f.key==='plainEnglish'||scenario==='false-student'&&f.key==='studentAnswer'?'contradicted':'supported',evidence:f.sourceIds.map(id=>({sourceId:id,quote:input.sources.find(s=>s.id===id).text})),reasoning:'Independent source-based reviewer fixture.'}]}))};
};
const post=(route,id=notion.id,body={})=>routes[route].POST(new Request(`http://localhost/api/notions/${id}/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
try{
  for(const route of ['adept','further']){const before=calls;assert.equal((await post(route,unsourced.id)).status,422);assert.equal(calls,before,'No source means no paid generation or factual fallback');}
  const response=await post('adept');assert.equal(response.status,200);const first=(await response.json()).adept;assert.deepEqual(db.getNotionById(notion.id).adept,first);
  assert.equal(lastGeneration.input.sources[0].text,source,'The writer receives actual original source text');assert(!lastGeneration.system.includes(notion.definition),'Untrusted stored content is not promoted into system instructions');
  scenario='false-explanation';globalThis.__reviewer='negative-reviewer';assert.equal((await post('adept')).status,422);assert.deepEqual(db.getNotionById(notion.id).adept,first,'A rejected explanation preserves the previous persisted version');
  scenario='false-reference';globalThis.__reviewer='reference-reviewer';assert.equal((await post('further')).status,422);assert.equal(db.getNotionById(notion.id).goFurther,undefined,'A fabricated reference is never persisted');
  scenario='false-student';globalThis.__reviewer='grading-reviewer';const progress=db.exportSnapshot().masterySignals;
  assert.equal((await post('explain',notion.id,{level:'nonexpert',text:'Area is always the sum of width and height.',unaided:true})).status,422,'An optimistic pass cannot award mastery to a rejected factual answer');
  assert.deepEqual(db.exportSnapshot().masterySignals,progress);assert.equal(db.getExplainHistory(notion.id,'nonexpert').length,0);
  assert(lastGeneration.system.includes('ORIGINAL course sources'));assert.equal(lastGeneration.input.sources[0].text,source);
  scenario='source-race';assert.equal((await post('adept')).status,409);assert.deepEqual(db.getNotionById(notion.id).adept,first,'A source change during generation cannot commit a stale supplement');
  console.log('PASS: real source-only ADEPT/further routes, source-less zero-call refusal, rejected explanations/references, protected previous output, source-race refusal and independent grading gate with no invented mastery. Simulated models.');
}finally{delete globalThis.__complete;delete globalThis.__accuracyComplete;for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
