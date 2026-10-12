import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

delete process.env.MORROW_IMPORT_LESSONS;
process.env.MORROW_GENERATION_PIPELINE='progressive';
const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','conceptLesson'],{
  llm:`export function currentProviderLabel(){return 'source-first-fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),sections=await env.load('sectionGeneration');
const schema=await env.load('structuredSchema'),deep=await env.load('conceptLesson');
const text='For a rectangle, area equals width multiplied by height, in square units. This rule applies only to rectangles. A rectangle with width 3 metres and height 4 metres has area 12 square metres. Both lengths must use the same unit.';
let mode='normal',calls=[];
globalThis.__complete=async(system,prompt,tool,_description,inputSchema)=>{
  const input=JSON.parse(prompt);calls.push({tool,input});
  if(tool==='deepen_concept')throw Error('Explicit on-demand lesson request reached the model');
  let output;
  if(tool==='extract_section_knowledge'){
    assert(!inputSchema.properties.concepts.items.properties.lesson,'Default wire contract has no lesson fields');
    assert(!system.includes('one self-contained changed-input task'),'Import does not request mandatory experiments');
    const sources=[{sourceId:mode==='forged'?'invented':input.sourceSnippets[0].id}];
    assert(!inputSchema.properties.cards,'Extraction cannot produce flashcards');
    output={title:'Rectangle area',concepts:[{key:'area',label:'Rectangle area',definition:'Area of a rectangle is width multiplied by height, in square units.',goal:'How is rectangle area calculated?',sources}],knowledge:mode==='empty'?[]:[{concept:'area',claim:'Rectangle area is width multiplied by height, in square units.',kind:mode==='causal'?'fact':'rule',conditions:['Both lengths must use the same unit.'],sources}],relations:[]};
    if(mode!=='forged')assert.deepEqual(schema.findSchemaViolations(output,inputSchema),[],'Actual default writer response satisfies its strict minimal schema');
  }else if(tool==='design_knowledge_cards'){
    assert.equal(input.units.length,1);assert.equal(input.units[0].conditions[0],'Both lengths must use the same unit.');
    output={cards:mode==='missing-objective'?[]:[{key:'area-rule',knowledgeId:input.units[0].id,concept:'area',question:'Which rule calculates the area of a rectangle, and in what units?',answer:'Multiply width by height, using the same length unit; the result is in square units.',objective:'Apply the rectangle area rule and preserve units',kind:'mechanism',sources:input.units[0].sourceIds.map(sourceId=>({sourceId}))}]};
    assert.deepEqual(schema.findSchemaViolations(output,inputSchema),[]);
  }else if(tool==='audit_learning_section'){
    assert.deepEqual(input.assertions.map(a=>a.key),['area:definition'],'Only published identity assertions need lesson-free review');
    assert(!input.draft.concepts[0].lesson,'No synthetic lesson enters the reviewer');
    output={assertions:input.assertions.map(a=>({key:a.key,supported:true,pages:a.pages,reason:''})),pages:input.primaryPages.map(page=>({page,complete:true,excluded:false,missing:[],reason:''})),concepts:[{key:'area',accepted:mode!=='identity',identitySupported:mode!=='identity',existingId:'',reason:mode==='identity'?'Identity is not supported.':''}],cards:input.cards.map(c=>({key:c.key,accepted:true,duplicateOf:'',reason:''})),relations:[]};
    assert.deepEqual(schema.findSchemaViolations(output,inputSchema),[]);
  }else throw Error(`Unexpected import stage ${tool}`);
  return output;
};
globalThis.__accuracyComplete=async(_system,prompt)=>{
  const input=JSON.parse(prompt);calls.push({tool:'audit_accuracy',input});
  return {decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'',claims:[{text:f.text,verdict:mode==='factual-rejection'&&f.key.startsWith('card:')?'unsupported':'supported',evidence:f.sourceIds.map(id=>({sourceId:id,quote:input.sources.find(s=>s.id===id).text})),reasoning:'Simulated verdict; no claim of real model quality.'}]}))};
};
const create=()=>{const doc=db.insertDocument({title:'Source-first geometry',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text}]);return doc;};
const generate=id=>sections.generateLearningSection(id,{mode:'strict',enrichment:false,pages:[1]});
try{
  const doc=create(),result=await generate(doc.id);
  assert.equal(result.readyCards,1,JSON.stringify(result));assert.equal(result.processed,1);assert.equal(result.warnings.length,0);
  assert.deepEqual(calls.map(c=>c.tool),['extract_section_knowledge','design_knowledge_cards','audit_learning_section','audit_accuracy','audit_accuracy']);
  assert(db.openDb().prepare('SELECT value FROM quality_settings WHERE key LIKE ?').get(`knowledge-plan:${doc.id}:%`),'Knowledge plan is persisted separately before card design');
  const notion=db.getGraph().notions.find(n=>n.sources.some(s=>s.documentId===doc.id));
  assert.equal(notion.explanation,'');assert(!notion.clair,'No unaudited or invented lesson is published');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete','Deferred lessons must not make the importer retry a complete deck');
  const card=quality.getStudyCards().find(c=>c.notionId===notion.id);assert(card.accuracyReview);
  assert(card.knowledgeTrace?.unitId.startsWith('K-'));assert(card.knowledgeTrace.planKey.includes(doc.id));
  db.gradeCard('notion',card.id,'easy');const review=db.getReviewState('notion',card.id);
  quality.retryPages(doc.id,[1]);calls=[];await generate(doc.id);
  assert(!calls.some(c=>['extract_section_knowledge','design_knowledge_cards'].includes(c.tool)),'Compiled successful section is reused without new writing calls');
  assert.equal(quality.getStudyCards().filter(c=>c.notionId===notion.id).length,1);
  assert.deepEqual(db.getReviewState('notion',card.id),review,'Source-first reimport preserves scheduling');
  const original=JSON.stringify(quality.getStudyCards());
  await assert.rejects(deep.deepenConcept(notion.id),/Explicit on-demand lesson request/);
  assert.equal(calls.at(-1).tool,'deepen_concept','Minimal notion can request the existing audited deepening path');
  assert.equal(JSON.stringify(quality.getStudyCards()),original,'Failed deepening cannot change accepted cards');

  for(const scenario of ['identity','factual-rejection','empty','forged','causal','missing-objective']){
    mode=scenario;calls=[];const next=create(),output=await generate(next.id);
    assert.equal(output.readyCards,0,scenario);
    assert.equal(quality.pageAnalyses(next.id)[0].status,'retry',scenario);
    if(scenario==='identity'||scenario==='forged')assert(!db.getGraph().notions.some(n=>n.sources.some(s=>s.documentId===next.id)));
    if(scenario==='forged')assert.deepEqual(calls.map(c=>c.tool),['extract_section_knowledge'],'Forged citations stop before card design and paid review');
    if(scenario==='empty')assert.equal(quality.getStudyCards().filter(c=>c.evidence.some(s=>s.documentId===next.id)).length,0,'No lesson-derived fallback invents cards');
    if(scenario==='causal')assert.deepEqual(calls.map(c=>c.tool),['extract_section_knowledge','design_knowledge_cards'],'Invented causal task rejected before paid reviewers');
    if(scenario==='missing-objective')assert(quality.pageAnalyses(next.id)[0].missingObjectives.some(s=>s.includes('Knowledge objective not covered')),'An optimistic page audit cannot hide an omitted compiled objective');
  }
  console.log('PASS: default strict source-first schema, no lesson/experiment at import, completed card-only coverage, independent identity/card reviews, rejected identity/fact/forgery, no empty-deck invention, deferred deepening and preserved FSRS. Simulated models; no measured live quality.');
}finally{
  delete globalThis.__complete;delete globalThis.__accuracyComplete;
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
}
