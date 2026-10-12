// Exercise compatibility with the explicitly requested rich-import path.
process.env.MORROW_IMPORT_LESSONS='1';
import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
process.env.MORROW_GENERATION_PIPELINE='progressive';process.env.MORROW_GENERATION_CONCURRENCY='3';
const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','conceptLesson','llmTelemetry','learningTasks'],{
  llm:`import {observeLlm} from './llmTelemetry.mjs';export function currentProviderLabel(audit=false){return audit&&globalThis.__auditName?globalThis.__auditName:'fixture';}export class LlmNotConfiguredError extends Error{}export class LlmProviderError extends Error{}export async function structuredCompletion(...args){return observeLlm(()=>globalThis.__complete(...args),()=>({input:100,output:100}));}`,
  generateSlides:`export function generationLocks(){return globalThis.__locks??=new Set();}export async function generateSlides(id,options){return globalThis.__visual(id,options);}`,
  directCardGeneration:`export async function generateDirectCards(id,options){return (await import('./sectionGeneration.mjs')).generateLearningSection(id,options);}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),jobs=await env.load('documentGeneration'),scope=await env.load('courseScope'),courses=await env.load('courses');
const sections=await env.load('sectionGeneration'),planning=await env.load('sectionPlanning'),deep=await env.load('conceptLesson'),tasks=await env.load('learningTasks');
const source='A rectangle has area equal to width multiplied by height. Width counts squares per row; height counts rows. With width 3 and height 4, its area is 12 square units. Holding height fixed, doubling width doubles area. This applies to rectangles, not arbitrary shapes.';
const lesson={intuition:'How can we count the surface covered by a rectangle?',goalAnswer:'Width counts squares per row, and height counts the rows. Multiplying the two counts all covered unit squares.',mechanism:['Width determines how many unit squares fill a row.','Height determines the number of rows; multiplying counts the complete surface.'],experiment:{setup:'Hypothetically, a rectangle is 3 units wide and 4 units high.',rule:'Area equals width multiplied by height. Hold height fixed and double width to 6.',question:'What is the new area, and why?',answer:'24 square units.',why:'6 × 4 = 24. Doubling the number of squares per row doubles the area.'},technical:'For a rectangle, A = width × height, measured in square units.',conditions:'The region is a rectangle and lengths use the same unit.',limits:'This product alone does not determine the area of an arbitrary nonrectangular shape.'};
const variants=[{setup:'Hypothetically, a rectangle has width 5 and height 2.',assumptions:'Area equals width × height. Triple only height to 6.',question:'What is the new area and which input changed?',answer:'30 square units; height changed.',reasoning:'5 × 6 = 30; there are three times as many rows.'},{setup:'Hypothetically, a rectangle has width 2 and height 8.',assumptions:'Area equals width × height. Halve only width to 1.',question:'What is the resulting area and why?',answer:'8 square units.',reasoning:'1 × 8 = 8; each row contains half as many unit squares.'}];
let calls=[],scenario='normal',pauseTool,paused=false,release,visualCalls=0;
globalThis.__complete=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);calls.push({tool,input,at:Date.now()});
  if(pauseTool===tool){pauseTool=undefined;paused=true;await new Promise(resolve=>release=resolve);}
  await new Promise(resolve=>setTimeout(resolve,5));
  if(tool==='learn_section'&&scenario==='truncated'&&input.primaryPages.length>1)throw Error('Structured response was truncated; retry a smaller page batch');
  if(tool==='learn_section')return {title:'Rectangle area',concepts:[{key:'area',label:'Rectangle area',definition:'The surface covered by a rectangle, measured in square units.',goal:'How do width and height determine rectangle area?',lesson:structuredClone(lesson),sources:input.primaryPages.map(page=>({sourceId:scenario==='bad-quote'?'forged-id':input.sourceSnippets.find(s=>s.page===page).id}))}],relations:[]};
  if(tool==='audit_learning_section')return {assertions:input.assertions.filter(a=>scenario!=='missing-assertion'||!a.key.endsWith(':technical')).map(a=>({key:a.key,supported:scenario!=='unsupported-assertion'||!a.key.endsWith(':technical'),pages:scenario==='foreign-assertion'?[999]:a.pages,reason:'Source-bound assertion check.'})),pages:input.primaryPages.map(page=>({page,complete:true,excluded:false,missing:[],reason:'The source mechanism is covered.'})),concepts:input.draft.concepts.map(c=>({key:c.key,accepted:true,existingId:scenario==='wrong-merge'?globalThis.__wrongExistingId:'',reason:'The mechanism follows the source.'})),cards:input.cards.filter(c=>scenario!=='missing-audit'||c.kind!=='application').map(c=>({key:c.key,accepted:true,duplicateOf:'',reason:'The stated inputs determine the worked result.'})),relations:[]};
  if(tool==='deepen_concept')return {lesson:{...structuredClone(lesson),analogy:{model:'',mapping:'',limit:''},transferTasks:scenario==='bad-variant'?[{...variants[0],reasoning:'5 × 6 = 35.'},variants[1]]:structuredClone(variants)},sources:input.context.map(p=>({documentId:p.documentId,page:p.page,quote:source}))};
  if(tool==='audit_concept_lesson')return {assertions:input.assertions.filter(a=>scenario!=='missing-deep-assertion'||!a.key.endsWith(':intuition')).map(a=>({key:a.key,supported:true,pages:a.pages,reason:'Supported rule and explicit example inputs.'})),accepted:scenario!=='rejected-deep',reason:'The source rule and all changed-input calculations are supported.',probe:{question:'If width remains 3 and height doubles from 4 to 8, what changes and why?',expectedAnswer:'Area doubles to 24 square units because the number of rows doubles.',reasoningSourceId:input.references.find(r=>r.text.includes('Multiplying'))?.id??input.references[0].id}};
  throw Error(`Unexpected paid stage ${tool}`);
};
globalThis.__visual=async(id,options)=>{visualCalls++;for(const page of options.pages)quality.savePageAnalysis(id,{page,kind:'content',status:'retry',reason:'Image requires independent inspection.',warnings:[],concepts:0,cards:0,version:'visual-fixture',updatedAt:new Date().toISOString()});return {notions:[],cardsCreated:0,usage:{requests:0,inputTokens:0,outputTokens:0},warnings:[]};};
const create=(count,text=source)=>{const d=db.insertDocument({title:'Geometry fixture',kind:'course',pageCount:count});db.insertPassages(Array.from({length:count},(_,i)=>({documentId:d.id,page:i+1,ordinal:0,text})));return d;};
const generate=id=>sections.generateLearningSection(id,{mode:'strict',enrichment:false});
try{
  const plan=planning.planLearningSections(Array.from({length:38},(_,i)=>i+1),Array.from({length:38},(_,i)=>({page:i+1,text:source})));
  assert.deepEqual(plan.map(s=>s.pages.length),[2,6,6,6,6,6,6],'38 textual slides become seven bounded sections');
  const doc=create(38),job=jobs.startDocumentGeneration(doc.id,{mode:'strict',enrichment:false});
  while(jobs.getDocumentGeneration(doc.id).sectionsCompleted===undefined)await new Promise(resolve=>setTimeout(resolve,5));
  assert(jobs.getDocumentGeneration(doc.id).firstReadyAt,'First checked cards are available before completion');assert.equal(jobs.getDocumentGeneration(doc.id).status,'running');
  await jobs.waitForDocumentGeneration(job.id);const done=jobs.getDocumentGeneration(doc.id);
  assert.equal(done.status,'complete');assert.equal(done.completedPages,38);assert.equal(done.requests,56);assert.equal(done.sectionCount,14);assert(done.firstReadyMs>0);assert(done.elapsedMs>=done.firstReadyMs);
  assert.equal(calls[0].tool,'learn_section');
  assert.equal(calls[0].input.primaryPages.length,1,'Small first section remains first in the queue');
  assert.equal(calls.slice(0,3).filter(c=>c.tool==='learn_section').length,3,'Three independent sections start before the first audit finishes');
  assert.equal(db.getGraph().notions.length,1,'Repeated mechanisms merge across slides');assert.equal(quality.getStudyCards().length,2,'Shared objectives reuse cards');
  const notion=db.getGraph().notions[0],cards=quality.getStudyCards();assert.equal(notion.clair.depth,'overview');assert(tasks.courseTasks([notion],{},10).length>=5,'Compact lessons support immediate Interview');
  assert(notion.clair.logic.formalism.includes(lesson.conditions)&&notion.clair.logic.formalism.includes(lesson.limits),'The visible precise formulation includes conditions and scientific limits, not only reconstruction');
  const application=cards.find(c=>c.kind==='application'),applicationTask=tasks.courseTasks([notion],{},10).find(t=>t.learningDimension==='application');
  assert.equal(application.question,applicationTask.question);
  db.gradeCard('notion',application.id,'easy');
  const session=db.insertInterviewSession({jobTitle:'Course understanding',jobDescription:'',cvText:'',coverLetter:'',durationMinutes:20,exchanges:[applicationTask]});
  db.recordInterviewAnswer(session.id,0,'Area doubles to 24.',{feedback:'The causal result is correct.',correctedAnswer:'Area doubles because each row contains twice as many squares.',score:0.95},true);
  const applications=db.openDb().prepare("SELECT task_id FROM mastery_signals WHERE notion_id=? AND dimension='application'").all(notion.id);
  assert.equal(applications.length,2);assert.equal(new Set(applications.map(a=>a.task_id)).size,1,'The same application across Interview and Drills cannot certify two transfer tasks');
  db.gradeCard('notion',cards[0].id,'easy');const review=db.getReviewState('notion',cards[0].id),originalCards=JSON.stringify(quality.getStudyCards());
  calls=[];const [a,b]=await Promise.all([deep.deepenConcept(notion.id),deep.deepenConcept(notion.id)]);
  assert.deepEqual(a,b);assert.equal(a.depth,'deep');assert.equal(a.practice.length,2);assert.deepEqual(calls.map(c=>c.tool),['deepen_concept','audit_concept_lesson']);
  await deep.deepenConcept(notion.id);assert.equal(calls.length,2,'Persisted deep lessons need no repeated model calls');
  assert.equal(JSON.stringify(quality.getStudyCards()),originalCards);assert.deepEqual(db.getReviewState('notion',cards[0].id),review,'Deepening preserves FSRS');
  const snapshot=db.exportSnapshot();db.importSnapshot(snapshot);assert.equal(db.getNotionById(notion.id).clair.depth,'deep');
  quality.retryPages(doc.id,[1,2]);calls=[];await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});assert.deepEqual(calls.map(c=>c.tool),['learn_section','audit_learning_section'],'A different historical page grouping requires one new reconstruction');
  assert.equal(db.getNotionById(notion.id).clair.depth,'deep','Unchanged reimport preserves deeper lessons');assert.deepEqual(db.getReviewState('notion',cards[0].id),review);
  quality.retryPages(doc.id,[1,2]);calls=[];const reused=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});
  assert.equal(calls.length,0,'Identical sources, lessons, neighboring notes, cards and audit model reuse the successful independent audit');
  assert.equal(reused.usage.requests,0);assert(quality.pageAnalyses(doc.id).slice(0,2).every(p=>p.status==='complete'));
  globalThis.__auditName='different-auditor';quality.retryPages(doc.id,[1,2]);calls=[];await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});
  assert.deepEqual(calls.map(c=>c.tool),['audit_learning_section'],'Changing the audit model requires a new independent decision, while preserving cached generation');delete globalThis.__auditName;
  const protectedCard=quality.getStudyCards().find(c=>c.kind==='mechanism');quality.saveStudyCard({...protectedCard,userEdited:true,answer:'Manual explanation requiring its own verification.'});
  quality.retryPages(doc.id,[1,2]);await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});
  assert.equal(quality.getStudyCards().find(c=>c.id===protectedCard.id).answer,'Manual explanation requiring its own verification.');assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','Auditing a generated answer cannot approve a different protected answer');
  quality.saveStudyCard(protectedCard);
  db.openDb().prepare("DELETE FROM quality_settings WHERE key LIKE 'learning-section-audit:%'").run();
  scenario='missing-audit';quality.retryPages(doc.id,[1,2]);await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','Ready old cards cannot hide a missing new audit');
  scenario='bad-quote';const bad=create(2);calls=[];await generate(bad.id);assert.equal(db.getGraph().notions.filter(n=>n.sources.some(s=>s.documentId===bad.id)).length,0);assert(quality.pageAnalyses(bad.id).every(p=>p.status==='retry'));assert.deepEqual(calls.map(c=>c.tool),['learn_section'],'Locally rejected content never incurs a paid approval call');
  for(const failure of ['missing-assertion','unsupported-assertion','foreign-assertion']){
    scenario=failure;const ungrounded=create(2);await generate(ungrounded.id);
    assert(!db.getGraph().notions.some(n=>n.sources.some(s=>s.documentId===ungrounded.id)),`${failure}: an optimistic concept audit cannot override missing field evidence`);
    assert(quality.pageAnalyses(ungrounded.id).every(p=>p.status==='retry'));
    if(failure==='unsupported-assertion'){
      calls=[];await generate(ungrounded.id);assert.equal(calls.length,0,'An identical complete rejection is reused without paying for another chance at approval');
    }
  }
  scenario='normal';const visual=create(1,'Figure: width and height');await generate(visual.id);assert.equal(visualCalls,1);
  const mixed=create(3);
  db.openDb().prepare('UPDATE passages SET text=? WHERE document_id=? AND page=2').run('Figure: width and height',mixed.id);
  const visualBefore=visualCalls;await generate(mixed.id);
  assert.equal(visualCalls-visualBefore,1,'One visual page cannot route the two textual pages through the rich visual pipeline');
  assert.equal(quality.pageAnalyses(mixed.id).filter(p=>p.status==='complete').length,2,'Text pages complete independently of the unverified figure');
  scenario='truncated';const dense=create(2);const repaired=await generate(dense.id);assert(quality.pageAnalyses(dense.id).every(p=>p.status==='complete'),'A truncated section splits once instead of committing incomplete content');assert.equal(repaired.usage.requests,9,'One failed reconstruction plus two generation/primary-audit/two-accuracy-review groups');scenario='normal';
  const logistics=create(1,'Assessment: final examination 60%, attendance 40%.');const before=calls.length;await generate(logistics.id);assert.equal(calls.length,before);assert.equal(quality.pageAnalyses(logistics.id)[0].status,'skipped');
  const oldDefinition=db.getNotionById(notion.id).definition;
  globalThis.__auditName='concurrent-context';quality.retryPages(doc.id,[1,2]);pauseTool='audit_learning_section';paused=false;
  const staleContext=sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,pages:[1,2]});
  while(!paused)await new Promise(resolve=>setTimeout(resolve,5));
  db.openDb().prepare('UPDATE notions SET definition=? WHERE id=?').run('A concurrently saved source-specific definition.',notion.id);
  release();const deferred=await staleContext;
  assert(deferred.warnings.some(w=>w.includes('Related notes changed during audit')));
  assert.equal(db.getNotionById(notion.id).definition,'A concurrently saved source-specific definition.','A stale audit cannot overwrite concurrent course content');
  db.openDb().prepare('UPDATE notions SET definition=? WHERE id=?').run(oldDefinition,notion.id);delete globalThis.__auditName;
  const mutate=create(2);pauseTool='audit_learning_section';paused=false;const inFlight=generate(mutate.id);while(!paused)await new Promise(resolve=>setTimeout(resolve,5));db.openDb().prepare('UPDATE passages SET text=? WHERE document_id=?').run(source+' Sources changed.',mutate.id);release();await assert.rejects(inFlight,/source document changed/);assert(!db.getGraph().notions.some(n=>n.sources.some(s=>s.documentId===mutate.id)));
  const other=courses.createCourse('Other geometry');let second;
  await scope.withCourse(other.id,async()=>{const d=create(2);await generate(d.id);second=db.getGraph().notions[0];assert.equal(db.getGraph().notions.length,1);});assert.equal(db.getNotionById(second.id),null);
  db.openDb().prepare('UPDATE notion_metadata SET user_edited=1,clair=NULL WHERE notion_id=?').run(notion.id);await assert.rejects(deep.deepenConcept(notion.id),e=>e.status===409);
  await scope.withCourse(other.id,async()=>{
    scenario='bad-variant';await assert.rejects(deep.deepenConcept(second.id),/incorrect explicit calculation/);assert.equal(db.getNotionById(second.id).clair.depth,'overview');
    scenario='rejected-deep';await assert.rejects(deep.deepenConcept(second.id));assert.equal(db.getNotionById(second.id).clair.depth,'overview');
    scenario='normal';pauseTool='deepen_concept';paused=false;const pending=deep.deepenConcept(second.id);while(!paused)await new Promise(resolve=>setTimeout(resolve,5));db.openDb().prepare('UPDATE notion_metadata SET user_edited=1 WHERE notion_id=?').run(second.id);release();await assert.rejects(pending,e=>e.status===409);
  });
  const identityCourse=courses.createCourse('Concept identity regression');
  await scope.withCourse(identityCourse.id,async()=>{
    const d=create(2),unrelated=db.insertNotion({label:'Insurance product design',domain:'Geometry fixture',status:'draft',definition:'Product terms are not rectangle area.',explanation:'Original insurance lesson.',sources:[{documentId:d.id,page:1}]});
    quality.setNotionMetadata(unrelated.id,'course',[{documentId:d.id,page:1,quote:source}],'slides-v12');
    scenario='wrong-merge';globalThis.__wrongExistingId=unrelated.id;
    await generate(d.id);
    assert.equal(db.getNotionById(unrelated.id).definition,'Product terms are not rectangle area.','An accepted but wrong model merge cannot overwrite an unrelated node');
    const area=db.getGraph().notions.find(n=>n.label==='Rectangle area');assert(area);assert.notEqual(area.id,unrelated.id);
    const {clairQualityIssues}=await env.load('contentQuality');
    assert(clairQualityIssues(unrelated.label,area.clair).includes('Lesson belongs to a different concept'));
    assert.throws(()=>quality.setNotionClair(unrelated.id,area.clair),/different concept/);
    scenario='normal';const legacy={...area.clair};delete legacy.depth;delete legacy.conceptLabel;quality.setNotionClair(area.id,legacy);
    const before=calls.length;await deep.deepenConcept(area.id);
    assert(calls.length>before,'Legacy lessons without depth must not be treated as already deep');assert.equal(db.getNotionById(area.id).clair.depth,'deep');
    quality.setNotionClair(area.id,{...db.getNotionById(area.id).clair,depth:'overview'});scenario='missing-deep-assertion';await assert.rejects(deep.deepenConcept(area.id),/Missing or duplicate assertion audit/);assert.equal(db.getNotionById(area.id).clair.depth,'overview');scenario='normal';
  });
  const route=await env.route('app/api/notions/[id]/lesson/route.ts','lesson-route');const response=await route.POST(new Request('http://localhost/api/notions/missing/lesson',{method:'POST'}),{params:Promise.resolve({id:'missing'})});assert.equal(response.status,404);
  console.log('PASS: archived progressive engine regression, 38 slides through 14 bounded batches/56 simulated calls, source/edit protection, cache, FSRS and backup preservation. Historical fixtures, no live quality or paid calls.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
