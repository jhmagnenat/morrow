import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry'],{
  courseSections:`export async function reconstructCourseSection(){return undefined;}`, // Page repair/commit gates; real section integration has its own test.
  llm:`export function currentProviderLabel(){return 'fixture-model';} export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(){if(globalThis.__renderFails)throw new Error('image unavailable');return 'data:image/png;base64,AA==';}`,
});
process.chdir(env.workspace);
const db=await env.load('db'), quality=await env.load('qualityDb'), q=await env.load('contentQuality'), courses=await env.load('courses'), scope=await env.load('courseScope'), backup=await env.load('backup'), storage=await env.load('pdfStorage'), srs=await env.load('srs');
const {generateSlides}=await env.load('generateSlides');
assert.equal(q.teachingQualityIssues('Provision','Recognizing a provision does not itself ensure available cash.').length,0,'A correctly negated warning must not reject the lesson');
assert(q.teachingQualityIssues('Provision','Recognizing a provision ensures available cash.').length>0,'Unsupported positive guarantee is rejected');
assert.deepEqual(q.cardQuality('Which title is associated with investment management in the shown organization?','CIO','definition'),[],'An exact acronym does not need invented prose to meet a minimum length');
assert.deepEqual(q.cardQuality('What is the derivative of f(x)=x at a point?','1','definition'),[],'A precise mathematical value may be a complete recall answer');
assert(q.cardQuality('Which title is associated with investment management?','   ','definition').length,'An absent answer remains invalid');
const text='A premium is the price paid for insurance coverage. Risk pooling shares losses across many policyholders.';
const doc=db.insertDocument({title:'Source slides',kind:'course',pageCount:3});
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text},{documentId:doc.id,page:2,ordinal:0,text:'Assessment: final examination 60%, attendance 40%.'}]);
storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
const concept={key:'premium',branchKey:'foundations',existingId:'',label:'Premium',domain:'Insurance',definition:'Price paid for insurance coverage.',explanation:'The premium is the price of coverage.',quote:'A premium is the price paid for insurance coverage.',visualDescription:'',layer:'course'};
const card={key:'c1',concept:'premium',relationSource:'',relationTarget:'',question:'What does an insurance premium pay for?',answer:'The insurance coverage provided by the policy.',example:'',kind:'definition',objective:'Define premium',quote:concept.quote};
let scenario='normal', callCount=0;
globalThis.__complete=async(system,prompt,tool)=>{
  callCount++;const input=JSON.parse(prompt);
  if(tool==='plan_course')return {purpose:'Understand the source mechanism.',learnerStartingPoint:'A beginner.',branches:[{key:'foundations',label:'Foundations',question:'How does it work?',summary:['Source mechanism ? decision'],pages:input.pages.map(p=>p.page),scope:'The supplied concepts.'}],progression:['Concrete situation','Mechanism','Technical distinction']};
  if(tool==='teach_notes')return {notes:input.concepts.map(c=>({key:c.key,branchKey:'foundations',explanation:c.explanation,courseContext:c.courseContext ?? '',bridges:[{kind:'deduction',question:'What follows from the source mechanism?',explanation:c.explanation,premiseSourceIds:[input.sourceSnippets.find(s=>s.page===input.page && s.quote)?.id??input.sourceSnippets[0].id],assumptions:[]}],sketch:{relations:[c.definition],example:c.explanation},workflow:{before:'The product is considered.',inputs:c.definition,decision:c.explanation,after:c.courseContext || c.definition},confusions:[{first:'Premium',second:'Claim',distinction:'The price of coverage differs from the cost of a covered loss.'}],evidence:[]}))};
  if(tool==='extract_slide'){
    if(input.page===2)return {kind:'administrative',reason:'Assessment logistics are excluded',concepts:[],links:[]};
    if(input.page===3)return {kind:'content',reason:'Image-only source',concepts:[{...concept,key:'visual',existingId:'',label:'Risk pooling',quote:'',visualDescription:'Diagram shows many policyholders sharing losses in a common pool.'}],links:[]};
    if(scenario==='bad-quote')return {kind:'content',reason:'Relevant',concepts:[{...concept,quote:'This invented quotation does not occur in the slide'}],links:[]};
    return {kind:'content',reason:'Insurance terminology',concepts:[{...concept}],links:[]};
  }
  if(tool==='draft_cards')return {cards:input.concepts.some(c=>c.key==='visual') ? [{...card,key:'visual-card',concept:'visual',question:'How does the risk pooling diagram distribute losses?',answer:'Losses are shared by policyholders through a common pool.',objective:'Explain visual risk pooling',quote:''}] : [card,...(scenario==='hallucination'?[{...card,key:'bad',question:'What fixed tax applies to every premium?',answer:'Every premium always has a 50% tax.',objective:'Unsupported tax rate'}]:[])]};
  if(tool==='audit_classification')return {skipJustified:input.page===2,reason:input.page===2?'Administrative only':'Diagram teaches risk pooling'};
  if(tool==='audit_slide')return {bridges:(input.bridges??[]).map(b=>({key:b.key,supported:true,reason:'Fixture bridge checked'})),coverageComplete:true,missingObjectives:[],links:[],concepts:input.concepts.map(c=>({key:c.key,supported:!['rejected-lesson','rejected-identity'].includes(scenario),identitySupported:scenario!=='rejected-identity',existingMatch:Boolean(c.existingId),consistent:true,scopeCorrect:true,canonicalExistingId:c.existingId,reason:'Supported by slide'})),cards:input.cards.map(c=>({key:c.key,duplicateOf:'',supported:c.key!=='bad',consistent:true,scopeCorrect:true,atomic:true,unambiguous:true,reason:c.key==='bad'?'Invented tax unsupported':'Answer supported'}))};
  throw new Error(`Unexpected tool ${tool}`);
};
try {
  for(const rejected of ['rejected-lesson','rejected-identity'])await scope.withCourse(courses.createCourse(rejected).id,async()=>{
    scenario=rejected;
    const isolated=db.insertDocument({title:'Independent legacy card review',kind:'course',pageCount:1});
    db.insertPassages([{documentId:isolated.id,page:1,ordinal:0,text}]);
    await generateSlides(isolated.id,{mode:'strict',enrichment:false});
    const published=quality.getStudyCards().filter(c=>c.status==='ready');
    if(rejected==='rejected-lesson'){
      assert.equal(published.length,1,'The diagram-aware path also preserves an independently reviewed factual card');
      const notion=db.getGraph().notions.find(n=>n.id===published[0].notionId);
      assert.equal(notion.explanation,'');assert(!notion.clair,'A rejected lesson never creates practice tasks');
      assert(quality.pageAnalyses(isolated.id)[0].missingObjectives.some(item=>item.startsWith('Verify lesson:')));
    }else assert.equal(published.length,0,'Rejected source identities cannot publish cards');
  });
  scenario='normal';callCount=0;
  const first=await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(db.getGraph().notions.filter(n=>n.layer!=='organizer').length,2,'No invented parents or administrative nodes');
  assert.equal(quality.getStudyCards().length,2,'Mapping nodes only receive independently drafted cards');
  assert.equal(quality.getStudyCards()[0].status,'ready');
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===2).status,'skipped');
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===3).status,'retry','Image-only cards remain draft until human verification');
  assert.equal(quality.getStudyCards().find(c=>c.objective==='Explain visual risk pooling').status,'draft');
  assert.equal(callCount,10,'Content retains full audit; explicit logistics consume no LLM calls; image-only diagrams are inspected');
  assert.equal(first.remainingPassages,1);
  assert.equal(first.remainingUnattemptedPages,0,'A visual draft must not block processing other pages');
  const saved=quality.getStudyCards()[0];quality.saveStudyCard({...saved,answer:'User-approved definition of the price of insurance coverage.',userEdited:true});
  db.gradeCard('notion',saved.id,'easy');
  const review=db.exportSnapshot().reviewState;
  db.clearMapping();await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(db.getGraph().notions.filter(n=>n.layer!=='organizer').length,2,'Archived notions are reused after map clear');
  assert.equal(db.getGraph(true).notions.filter(n=>n.layer!=='organizer').length,2,'Archived nodes reappear without duplicates');
  assert.equal(quality.getStudyCards().length,2,'Regeneration preserves independent cards');
  assert.equal(quality.getStudyCards()[0].userEdited,true);
  assert.deepEqual(db.exportSnapshot().reviewState,review);
  const edited=quality.getStudyCards()[0];db.deleteCard('notion',saved.id);
  assert.equal(db.getGraph().notions.filter(n=>n.layer!=='organizer').length,2,'Deleting a card never deletes its mapping node');
  quality.saveStudyCard(edited);
  scenario='hallucination';quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(quality.getStudyCards().find(c=>c.question.includes('fixed tax')).status,'draft','Unsupported answers never enter review');
  scenario='bad-quote';quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'retry');assert(db.getUngeneratedPassages(doc.id).some(p=>p.page===1));
  scenario='normal';globalThis.__renderFails=true;await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'retry','Visual failure remains explicit and retryable');globalThis.__renderFails=false;
  const snapshot=backup.snapshotWithPdfs();assert(snapshot.documents[0].pdfBase64);
  backup.restoreWithPdfs(snapshot);assert.equal(storage.readPdfFile(doc.id).toString(),'%PDF-1.7\nfixture');
  const before=db.exportSnapshot();
  assert.throws(()=>db.importSnapshot({...before,links:[{id:'invalid',source:'missing',target:'missing',type:'related',description:'Invalid FK'}]}));
  assert.deepEqual(db.exportSnapshot().notions,before.notions,'Failed import rolls back');
  assert.throws(()=>backup.restoreWithPdfs({...before,documents:[{...before.documents[0],pdfBase64:'invalid'}]}));
  const other=courses.createCourse('Other');
  const captured=courses.getActiveCourseId();
  await scope.withCourse(captured,async()=>{await Promise.resolve();courses.setActiveCourse(other.id);assert.equal(db.getGraph().documents[0].id,doc.id,'Async work remains pinned to starting course');});
  assert.equal(db.getGraph().documents.length,0);courses.setActiveCourse(captured);
  quality.saveReviewSettings({newPerDay:0,sessionLimit:100});assert.equal(db.getDueNotions().filter(c=>c.isNew).length,0);
  assert.equal(srs.nextReviewState(srs.INITIAL_REVIEW_STATE,'again').intervalDays,1/1440);
  assert.equal(srs.nextReviewState(srs.INITIAL_REVIEW_STATE,'good').intervalDays,10/1440);
  assert.equal(srs.nextReviewState(srs.INITIAL_REVIEW_STATE,'easy').intervalDays,8);
  assert.equal(new Date(srs.dueDateFrom(1/1440,new Date(0))).getTime(),60000);
  const grading=await env.route('app/api/review/[cardType]/[cardId]/grade/route.ts','grade-route');
  assert.equal(quality.getStudyCard(edited.id).status,'draft','An edited answer cannot reuse the original answer review');
  const blocked=await grading.POST(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grade:'good'})}),{params:Promise.resolve({cardType:'notion',cardId:edited.id})});
  assert.equal(blocked.status,409,'Unverified edits cannot be graded through the API');
  quality.saveStudyCard({...saved,status:'ready'});
  db.makeCardDueNow('notion',edited.id);
  const request=()=>new Request('http://localhost/api/review/notion/x/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grade:'good',requestId:'idempotent-test'})});
  const params={params:Promise.resolve({cardType:'notion',cardId:edited.id})};
  const logsBefore=db.exportSnapshot().reviewLog.length;
  const response1=await grading.POST(request(),params), response2=await grading.POST(request(),params);
  assert.equal(response1.status,200);assert.deepEqual(await response1.json(),await response2.json());
  assert.equal(db.exportSnapshot().reviewLog.length,logsBefore+1,'Repeated reviews award progress once');
  const response3=await grading.POST(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grade:'easy',requestId:'other-tab'})}),params);
  assert.equal((await response3.json()).alreadyReviewed,true);
  assert.equal(db.exportSnapshot().reviewLog.length,logsBefore+1);
  assert(q.verifiesQuote('price paid for insurance coverage',text));assert(!q.verifiesQuote('not in source',text));
  assert(q.createsCycle([{source:'a',target:'b',type:'sub-notion'}],'b','a','sub-notion'));
  assert(!q.createsCycle([{source:'a',target:'b',type:'sub-notion'}],'b','a','prerequisite'),'Taxonomy and prerequisites have separate cycle rules');
  const ocrCourse=courses.createCourse('Uncertain OCR fixture');
  await scope.withCourse(ocrCourse.id,async()=>{
    const scanned=db.insertDocument({title:'Uncertain scan',kind:'course',pageCount:1});
    db.insertPassages([{documentId:scanned.id,page:1,ordinal:0,text}]);
    storage.savePdfFile(scanned.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
    quality.getStudyCards();
    db.openDb().prepare('INSERT INTO quality_settings(key,value) VALUES(?,?)').run(`pdf-layout:${scanned.id}`,JSON.stringify([{page:1,layout:{origin:'ocr',requiresVisualReview:true,blocks:[{text:'400',confidence:60}]}}]));
    await generateSlides(scanned.id,{mode:'strict',enrichment:false});
    const cards=quality.getStudyCards();
    assert(cards.length>0);
    assert(cards.every(c=>c.status==='draft'),'Uncertain OCR cannot be promoted by an optimistic AI audit');
    assert.equal(quality.pageAnalyses(scanned.id)[0].status,'retry');
  });
  console.log('PASS: source audit, administrative exclusion, image-only slides, uncertain OCR quarantine, atomic independent cards, hallucination drafts, retry states, archived deduplication, preserved edits/scheduling, PDF backups, rollback, course isolation, daily budget, learning intervals and idempotent grading.');
} finally {for(const conn of globalThis.__courseDbs?.values()??[])conn.close();process.chdir(env.root);}
