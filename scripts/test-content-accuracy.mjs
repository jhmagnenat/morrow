// Exercise compatibility with the explicitly requested rich-import path.
process.env.MORROW_IMPORT_LESSONS='1';
import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','conceptLesson','qaGeneration','learningTasks'],{
  llm:`export function currentProviderLabel(role){return role==='accuracy'?globalThis.__reviewer:'fixture';}export class LlmNotConfiguredError extends Error{}export class LlmProviderError extends Error{}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  generateSlides:`export async function generateSlides(){throw Error('Unexpected visual fallback');}`,
});
process.chdir(env.workspace);
const {accuracyIssues,accuracyBatches}=await env.load('contentAccuracy'),{arithmeticIssues}=await env.load('reliabilityChecks');
const dense=Array.from({length:15},(_,i)=>({key:String(i),text:'x'.repeat(2001),kind:'fact',sourceIds:['S1']}));
assert.deepEqual(accuracyBatches(dense).map(b=>b.length),[2,2,2,2,2,2,2,1]);assert.deepEqual(accuracyBatches(dense).flat(),dense,'Batching preserves every field and character');
const {teachingQualityIssues}=await env.load('contentQuality');
for(const correct of ['Reserving is not setting aside funds.','Claim reserving does not guarantee cash is available.','Les provisions ne garantissent pas la liquidité.','Une provision n’est pas un compte bancaire.'])assert.equal(teachingQualityIssues('Technical provisions',correct).length,0,correct);
for(const wrong of ['Reserving means setting aside funds.','Claim provisions guarantee cash is available.','Les provisions garantissent la liquidité.','Une provision est constituée de fonds mis de côté.'])assert(teachingQualityIssues('Technical provisions',wrong).length,wrong);
const sources=[{id:'S1',text:'Only rectangles have area computed here as width multiplied by height.'},{id:'S2',text:'The result is expressed in square units, not units of length.'}];
const fields=[{key:'definition',text:'Area is width times height. This rule applies to rectangles.',kind:'fact',sourceIds:['S1']}];
const positive=()=>({decisions:[{key:'definition',complete:true,scopeCorrect:true,reason:'',claims:[{text:fields[0].text,verdict:'supported',evidence:[{sourceId:'S1',quote:sources[0].text}],reasoning:''}]}]});
assert.equal(accuracyIssues(fields,sources,positive()).size,0);
const cases=[
  ['missing field',a=>{a.decisions=[];}],
  ['duplicate decision',a=>{a.decisions.push(structuredClone(a.decisions[0]));}],
  ['unknown field',a=>{a.decisions.push({...a.decisions[0],key:'invented'});}],
  ['explicit incomplete coverage',a=>{a.decisions[0].complete=false;}],
  ['missing scope',a=>{a.decisions[0].scopeCorrect=false;}],
  ['missing claims',a=>{a.decisions[0].claims=[];}],
  ['real quotation, unsupported meaning',a=>{a.decisions[0].claims[0].verdict='unsupported';}],
  ['contradicted claim',a=>{a.decisions[0].claims[0].verdict='contradicted';}],
  ['uncertainty cannot certify truth',a=>{a.decisions[0].claims[0].verdict='uncertain';}],
  ['missing evidence',a=>{a.decisions[0].claims[0].evidence=[];}],
  ['forged source ID',a=>{a.decisions[0].claims[0].evidence[0].sourceId='forged';}],
  ['real but unassigned source',a=>{a.decisions[0].claims[0].evidence=[{sourceId:'S2',quote:sources[1].text}];}],
  ['forged quotation',a=>{a.decisions[0].claims[0].evidence[0].quote='All triangles have the same area as rectangles.';}],
  ['cherry-picked sentence',a=>{a.decisions[0].claims[0].text='Area is width times height.';}],
  ['silently rewritten false claim',a=>{a.decisions[0].claims[0].text='Area is width times height. This rule applies to every shape.';}],
  ['hypothesis cannot approve a fact',a=>{a.decisions[0].claims[0].verdict='hypothetical';a.decisions[0].claims[0].reasoning='Assume a rectangle with these dimensions.';}],
  ['unexplained inference',a=>{a.decisions[0].claims[0].verdict='deduction';}],
  ['incorrect reviewer calculation',a=>{a.decisions[0].claims[0].reasoning='(3 + 4) * 2 = 20';}],
];
for(const [name,mutate] of cases){const audit=positive();mutate(audit);assert(accuracyIssues(fields,sources,audit).size,name);}
const partitioned=positive();partitioned.decisions[0].claims=[{...partitioned.decisions[0].claims[0],text:'Area is width times height.'},{...partitioned.decisions[0].claims[0],text:'This rule applies to rectangles.'}];
assert.equal(accuracyIssues(fields,sources,partitioned).size,0,'Complete consecutive quotations can partition a field');
partitioned.decisions[0].claims.reverse();assert(accuracyIssues(fields,sources,partitioned).size,'Out-of-order excerpts cannot establish exhaustive review');
assert(accuracyIssues(fields,[...sources,sources[0]],positive()).size,'Ambiguous duplicate source identities are rejected');

const goodCalculations=['2 * 3 + 4 = 10','(3 + 4) * 2 = 14','-2 * 3 = -6','2 * -3 = -6','2 ^ 3 = 8','-2 ^ 2 = -4','100 * 20% = 20','3 / 4 = 75%','2,5 * 4 = 10','1 / 3 = 0.33','1e2 * 2 = 200','2 × 3 × 0.1 = 0.60','(100 - 20) ÷ 2 = 40','2 + 3 * 4 = 14'];
const badCalculations=['2 * 3 + 4 = 9','(3 + 4) * 2 = 20','-2 * 3 = 6','2 * -3 = 6','2 ^ 3 = 9','-2 ^ 2 = 4','100 * 20% = 25','3 / 4 = 80%','2,5 * 4 = 11','1 / 3 = 0.40','1e2 * 2 = 300','2 × 3 × 0.1 = 0.70','(100 - 20) ÷ 2 = 50','2 + 3 * 4 = 20','1 / 0 = 0'];
goodCalculations.push('(12 - 10) / 10 × 100 = 20%');badCalculations.push('(12 - 10) / 10 × 100 = 25%');
for(const expression of goodCalculations)assert.equal(arithmeticIssues(expression).length,0,expression);
for(const expression of badCalculations)assert(arithmeticIssues(expression).length,expression);
for(const expression of ['x * 2 + 3 = 100','2x + 3 = 100','1,000 + 20 = 1020','100 + 20% = 120'])assert.equal(arithmeticIssues(expression).length,0,`Do not pretend to verify unsupported or ambiguous notation: ${expression}`);

const db=await env.load('db'),quality=await env.load('qualityDb'),sections=await env.load('sectionGeneration'),scope=await env.load('courseScope'),courses=await env.load('courses');
const source='A rectangle has area equal to width multiplied by height. Width counts squares per row; height counts rows. With width 3 and height 4, its area is 12 square units. Holding height fixed, doubling width doubles area. This applies to rectangles, not arbitrary shapes.';
const lesson={intuition:'Count the unit squares covering the rectangle.',goalAnswer:'Width counts squares per row and height counts rows. Multiplying counts the unit squares.',mechanism:['Count the squares in each row.','Multiply the row width by the number of rows.'],technical:'Rectangle area equals width multiplied by height, measured in square units.',conditions:'The region is a rectangle and both lengths use the same unit.',limits:'This product is not a rule for arbitrary shapes.',experiment:{setup:'Hypothetically, a rectangle is 3 units wide and 4 units high.',rule:'Area equals width multiplied by height. Double width to 6 and keep height at 4.',question:'What is the resulting area?',answer:'24 square units.',why:'6 * 4 = 24.'}};
let scenario='positive',primaryCalls=0,criticCalls=0;
globalThis.__reviewer='reviewer-initial';
globalThis.__complete=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);primaryCalls++;
  if(tool==='learn_section')return {title:'Rectangle area',concepts:[{key:'area',label:'Rectangle area',definition:'The surface covered by a rectangle, in square units.',goal:'How do width and height determine rectangle area?',lesson:structuredClone(lesson),sources:input.primaryPages.map(page=>({sourceId:input.sourceSnippets.find(s=>s.page===page).id}))}],relations:[]};
  if(tool==='audit_learning_section')return {assertions:input.assertions.map(a=>({key:a.key,supported:true,pages:a.pages,reason:''})),pages:input.primaryPages.map(page=>({page,complete:true,excluded:false,missing:[],reason:''})),concepts:input.draft.concepts.map(c=>({key:c.key,accepted:true,existingId:'',reason:''})),cards:input.cards.map(c=>({key:c.key,accepted:true,duplicateOf:'',reason:''})),relations:[]};
  throw Error(`Unexpected tool ${tool}`);
};
globalThis.__accuracyComplete=async(system,prompt)=>{
  const input=JSON.parse(prompt);criticCalls++;
  const audit={decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'',claims:[{text:f.text,verdict:'supported',evidence:f.sourceIds.map(id=>({sourceId:id,quote:input.sources.find(s=>s.id===id).text})),reasoning:'The original rectangle rule determines the result.'}]}))};
  if(scenario==='source-race')db.openDb().prepare('UPDATE passages SET text=text||?').run(' Source changed during review.');
  if(scenario==='rejected-concept')for(const d of audit.decisions)if(d.key.endsWith(':technical')){d.claims[0].verdict='contradicted';d.claims[0].reasoning='The formula does not describe arbitrary shapes.';}
  if(scenario==='omitted-clause')for(const d of audit.decisions)d.claims[0].text=d.claims[0].text.slice(0,10);
  if(scenario==='rejected-application')for(const d of audit.decisions)if(d.key==='card:area:application'){d.claims[0].verdict='uncertain';d.reason='The worked answer is not independently established.';}
  return audit;
};
const create=()=>{const doc=db.insertDocument({title:'Accuracy fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);return doc;};
const generate=id=>sections.generateLearningSection(id,{mode:'strict',enrichment:false});
try {
  for(const failure of ['rejected-concept','omitted-clause']) {
    await scope.withCourse(courses.createCourse(failure).id,async()=>{
      scenario=failure;const doc=create();const result=await generate(doc.id);
      assert.equal(db.getGraph().notions.length,0,`${failure}: an optimistic primary audit cannot publish a rejected explanation`);
      assert.equal(result.readyCards,0);assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry');
      const count=criticCalls;await generate(doc.id);assert.equal(criticCalls,count,'Identical rejected claims cannot obtain stochastic reapproval');
    });
  }
  assert(primaryCalls>0&&criticCalls>0,'The tests exercise both the optimistic primary pipeline and the real separate accuracy gate');
  await scope.withCourse(courses.createCourse('Card safety').id,async()=>{
    scenario='positive';const doc=create();await generate(doc.id);
    assert.equal(db.getDueNotions().length,2);
    const application=quality.getStudyCards().find(c=>c.kind==='application');
    assert(application.accuracyReview,'A published card records its exact reviewed content and full source context');
    db.gradeCard('notion',application.id,'easy');const schedule=db.exportSnapshot().reviewState;
    globalThis.__reviewer='reviewer-rejection';scenario='rejected-application';quality.retryPages(doc.id,[1]);await generate(doc.id);
    assert.equal(quality.getStudyCard(application.id).status,'draft','Re-auditing the actual same answer negatively removes a previously ready card');
    assert.deepEqual(db.exportSnapshot().reviewState,schedule,'Quarantine preserves actual review history');
    assert(!db.getDueNotions().some(c=>c.cardId===application.id));
    const card=quality.getStudyCards().find(c=>c.kind==='mechanism');
    const offline=await env.route('app/api/offline/route.ts');
    const initial=await offline.GET(new Request('http://localhost/api/offline'));
    const etag=initial.headers.get('ETag');
    assert.equal(initial.status,200);
    assert(Object.keys((await initial.json()).reviews).length>0);
    assert.equal((await offline.GET(new Request('http://localhost/api/offline',{headers:{'If-None-Match':etag}}))).status,304);
    const stored=db.openDb().prepare('SELECT payload FROM study_cards WHERE id=?').get(card.id).payload;
    db.openDb().prepare('UPDATE passages SET text=text||? WHERE document_id=?').run(' New context changes the assumptions.',doc.id);
    assert.equal(quality.getStudyCard(card.id).status,'draft','Full-source changes invalidate approval even while the quotation still matches');
    assert.equal(db.openDb().prepare('SELECT payload FROM study_cards WHERE id=?').get(card.id).payload,stored,'Read-time exclusion preserves the original stored card');
    assert.equal(db.getDueNotions().length,0);
    assert(db.getGraph().notions.filter(n=>n.clair).every(n=>n.contentWarnings?.length),'Source changes also invalidate the displayed overview lessons');
    const refreshed=await offline.GET(new Request('http://localhost/api/offline',{headers:{'If-None-Match':etag}}));
    assert.equal(refreshed.status,200,'Changed original evidence invalidates the offline ETag');
    assert.notEqual(refreshed.headers.get('ETag'),etag);
    assert.equal(Object.keys((await refreshed.json()).reviews).length,0,'Offline inventory excludes invalidated cards');
    const unsafe=quality.saveStudyCard({...card,id:'manual-unsafe',accuracyReview:undefined,userEdited:true,answer:'(3 + 4) * 2 = 20',status:'ready'});
    assert.equal(unsafe.status,'draft','Manual editing cannot bypass deterministic arithmetic failures');
  });
  await scope.withCourse(courses.createCourse('Review race').id,async()=>{
    scenario='source-race';const doc=create();await assert.rejects(generate(doc.id),/source document changed/);assert.equal(db.getGraph().notions.length,0);assert.equal(quality.getStudyCards().length,0);
  });
  console.log(`PASS: ${cases.length+3} adversarial review artifacts, ${goodCalculations.length+badCalculations.length+4} arithmetic cases, optimistic-audit rejection, cached negative verdicts, ready-card quarantine, full-source fingerprints, review preservation and source-race rollback. Simulated reviewers; no scientific accuracy score or paid calls.`);
}finally{delete globalThis.__complete;delete globalThis.__accuracyComplete;for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
