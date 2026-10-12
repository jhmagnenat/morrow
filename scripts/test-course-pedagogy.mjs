import assert from 'node:assert/strict';
import { isolatedModules, DATABASE_MODULES } from './isolated-modules.mjs';

const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry'], {
  courseSections:`export async function reconstructCourseSection(){return undefined;}`,
  llm:`export function currentProviderLabel(){return 'fixture';} export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(){return 'data:image/png;base64,AAAA';}`,
});
const pedagogy=await env.load('coursePedagogy');
assert(pedagogy.nonTeachingSlideReason('Insurance Company Simulation Session 1 Quynh Nguyen Autumn 2026',true));
assert(pedagogy.nonTeachingSlideReason('SLIDO https://app.sli.do/event/example 7216923'));
assert(pedagogy.nonTeachingSlideReason('Course planning: reflection submission deadline 30.10.2026'));
assert(!pedagogy.nonTeachingSlideReason('Risk assessment determines risk acceptance and pricing.'));
assert(!pedagogy.nonTeachingSlideReason('Expected loss = frequency × severity'),'Sparse technical slides still require visual/source analysis');
assert(pedagogy.isNonTeachingSlide('What you should not expect from this course: advanced pricing models.'));
assert(pedagogy.isNonTeachingSlide('Today’s lesson: insurance products, company functions, assessment.'));
assert(!pedagogy.isNonTeachingSlide('Risk assessment determines whether to accept a risk and on what terms.'));
assert(!pedagogy.isCourseMethodNotion('Differentiated Instruction',false),'Education subject matter remains valid outside an insurance course');
assert(pedagogy.isCourseMethodNotion('Differentiated Instruction',true));
const outline=pedagogy.courseOverview(Array.from({length:100},(_,i)=>({page:i+1,text:'x'.repeat(5000)+'END-HEADING'})));
assert.equal(outline.length,100,'Global context covers the end of long decks too');
assert(outline.every(p=>p.text.includes('END-HEADING')),'End-of-page headings survive excerpting');
assert(outline.reduce((n,p)=>n+p.text.length,0)<27000,'Course context is bounded');
assert(pedagogy.sourceSnippets(outline).every(s=>!s.quote.includes('[excerpt omitted]')),'Excerpt markers cannot become fabricated quotations');
const costPayload={context:outline,courseOverview:outline,sourceSnippets:pedagogy.sourceSnippets(outline)};
const compactPayload=JSON.parse(pedagogy.sourcePrompt(costPayload));
assert.deepEqual(compactPayload.sourceSnippets,costPayload.sourceSnippets,'Cost reduction preserves every evidence ID and quotation');
assert(compactPayload.context.every(p=>p.sourceIds?.length),'Repeated source excerpts become citation references');
assert(pedagogy.sourcePrompt(costPayload).length<JSON.stringify(costPayload).length*.55,'Repeated course source payload is reduced by at least 45 percent');
const missingText=JSON.parse(pedagogy.sourcePrompt({context:[{page:1,text:'Important detail not in the citation ledger.'}],sourceSnippets:[{id:'P1S1',page:1,quote:'A different detail.'}]}));
assert(missingText.context[0].text,'Unrepresented source details are never removed to save tokens');
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage');
const {generateSlides}=await env.load('generateSlides');
try {
  const doc=db.insertDocument({title:'Insurance Company Simulation',kind:'course',pageCount:4});
  const source='Underwriting assesses risk and pricing determines the premium. Claims management pays insured losses.';
  db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source},{documentId:doc.id,page:4,ordinal:0,text:'Insurance Company Simulation: the value chain links underwriting, claims and investment.'}]);
  storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
  const old=db.insertNotion({label:'Underwriting',domain:'Insurance',status:'draft',definition:'Old glossary text',sources:[{documentId:doc.id,page:1}]});
  quality.setNotionMetadata(old.id,'course',[{documentId:doc.id,page:1,quote:source}]);
  const meta=db.insertNotion({label:'Classroom Management Techniques',domain:'Education',status:'draft',definition:'Course methodology',sources:[]});
  quality.saveStudyCard({id:'methodology-card',notionId:meta.id,cardType:'notion',question:'What is classroom management?',answer:'Classroom logistics.',example:'',kind:'definition',status:'ready',evidence:[],objective:'Classroom logistics',warnings:[],userEdited:false,model:'legacy',promptVersion:'legacy'});
  db.gradeCard('notion','methodology-card','easy');
  const history=db.exportSnapshot().reviewState;
  quality.quarantineCourseMethodology(db.openDb());
  assert(!db.getGraph(true).notions.some(n=>n.id===meta.id));
  assert(db.getGraph().notions.some(n=>n.id===meta.id),'Quarantine archives rather than deletes');
  assert.equal(quality.getStudyCards()[0].status,'draft');
  assert.deepEqual(db.exportSnapshot().reviewState,history,'Review history survives quarantine');
  let contextual=true, repair=false, auditCount=0, extractCount=0, inventoryMapped=true, reconcile=false,bridgeSupported=true,planCalls=0;
  globalThis.__complete=async(system,prompt,tool)=>{
    const input=JSON.parse(prompt);
    if(tool==='plan_course'){planCalls++;return {purpose:'Understand the source mechanism.',learnerStartingPoint:'A beginner.',branches:[{key:'foundations',label:'Foundations',question:'How does it work?',summary:['Source mechanism → decision'],pages:input.pages.map(p=>p.page),scope:'The supplied concepts.'}],progression:['Concrete situation','Mechanism','Technical distinction']};}
  if(tool==='teach_notes')return {notes:input.concepts.map(c=>({key:c.key,branchKey:'foundations',explanation:c.explanation,courseContext:c.courseContext ?? '',bridges:[{kind:'deduction',question:'What follows from the source mechanism?',explanation:c.explanation,premiseSourceIds:[input.sourceSnippets.find(s=>s.page===input.page && s.quote)?.id??input.sourceSnippets[0].id],assumptions:[]}],sketch:{relations:[c.definition],example:c.explanation},workflow:{before:'The product is considered.',inputs:c.definition,decision:c.explanation,after:c.courseContext || c.definition},confusions:[{first:'Premium',second:'Claim',distinction:'The price of coverage differs from the cost of a covered loss.'}],evidence:[]}))};
    if(tool==='extract_slide') {
      extractCount++;
      if(repair && extractCount===2)assert(input.revision.audit.missingObjectives.includes('Explain the missing claims role'),'Independent omissions are fed back into reconstruction');
      assert(input.courseOverview.some(p=>p.page===4),'Extraction sees the distant course purpose');
      assert(system.includes('excellent student'));
      const sourceId=input.sourceSnippets.find(s=>s.page===input.page).id;
      return {kind:'content',reason:'Business functions',teachingPoints:[{key:'p1',detail:'Claims management pays insured losses.',sourceId,visualDescription:''}],concepts:[{key:'u',branchKey:'foundations',existingId:old.id,label:'Underwriting',domain:'Insurance',definition:'Risk acceptance within the insurer.',explanation:'Underwriting assesses the risk before the insurer accepts it. In the source value chain, pricing determines the premium and claims management pays insured losses.',courseContext:'Connect risk assessment, premium and insured loss payments in the insurance value chain.',teachingPoints:inventoryMapped?['p1']:[],quote:'',evidence:[{sourceId}],visualDescription:'',layer:'course'}],links:[]};
    }
    if(tool==='draft_cards')return {cards:[]};
    if(tool==='audit_slide') {
      auditCount++;
      return {bridges:(input.bridges??[]).map(b=>({key:b.key,supported:bridgeSupported,reason:bridgeSupported?'Fixture bridge checked':'Rejected implicit claim'})),existingCards:reconcile?[{id:'duplicate-a',duplicateOf:'duplicate-b',supported:true,reason:'Same objective'},{id:'duplicate-b',duplicateOf:'',supported:true,reason:'Reviewed canonical card'}]:[],coverageComplete:!repair || auditCount>1,missingObjectives:repair && auditCount===1?['Explain the missing claims role']:[],teachingPoints:[{key:'p1',supported:true,covered:true,reason:'Cited detail'}],links:[],cards:[],concepts:[{key:'u',supported:true,contextual,detailsPreserved:true,existingMatch:true,consistent:true,scopeCorrect:true,canonicalExistingId:old.id,reason:contextual?'Contextual lecture notes':'Generic glossary loses the mechanism'}]};
    }
    throw Error(tool);
  };
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  const updated=db.getGraph().notions.find(n=>n.id===old.id);
  assert(updated.explanation.includes('source value chain'),'Supported reprocessing upgrades prior generated explanations');
  assert(updated.courseContext.includes('risk assessment'));
  assert(updated.explanation.includes('Details retained from the slide'),'Inventoried facts survive in the visible notes');
  assert.equal(updated.generationVersion,(await env.load('contentQuality')).GENERATION_VERSION);
  assert(updated.explanation.includes('In the workflow:'));
  assert(updated.explanation.includes('Do not confuse:'));
  assert(updated.explanation.startsWith('At a glance:'));
  assert(updated.explanation.indexOf('Concrete example:')<updated.explanation.indexOf('In the workflow:'));
  db.insertPassages([{documentId:doc.id,page:2,ordinal:1,text:source}]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[2]});
  assert.deepEqual(db.getGraph().notions.find(n=>n.id===old.id).sourceNotes.map(n=>n.page),[1,2],'Later slides cannot erase earlier lecture notes');
  assert.equal((db.getGraph().notions.find(n=>n.id===old.id).explanation.match(/At a glance:/g)??[]).length,1,'The visible concept is one unified lesson, not concatenated slide explanations');
  const snapshot=db.exportSnapshot();db.importSnapshot(snapshot);
  assert.deepEqual(db.getGraph().notions.find(n=>n.id===old.id).sourceNotes.map(n=>n.page),[1,2],'Backups retain notes from every source page');
  repair=true;extractCount=0;auditCount=0;quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(extractCount,2,'One bounded correction pass closes audited omissions');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete');
  repair=false;extractCount=0;
  contextual=false;quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','A faithful quotation does not excuse a generic explanation');
  assert.equal(extractCount,2,'A persistently generic response cannot trigger an unbounded repair loop');
  contextual=true;inventoryMapped=false;extractCount=0;quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','Optimistic coverage cannot conceal an unmapped teaching point');
  assert.equal(quality.pageAnalyses(doc.id)[0].teachingPoints[0].covered,false);
  inventoryMapped=true;reconcile=true;
  for(const id of ['duplicate-a','duplicate-b']){
    const card={id,notionId:old.id,cardType:'notion',question:'What does underwriting assess?',answer:'The insured risk.',example:'',kind:'definition',status:'ready',evidence:[{documentId:doc.id,page:1,quote:source}],objective:'Underwriting risk assessment',warnings:[],userEdited:false,model:'fixture',promptVersion:'slides-v4-course-notes'};
    // Simulate cards persisted by an older deployment, before the new safety
    // gate. The actual answers must be re-reviewed before duplicate routing.
    db.openDb().prepare('INSERT INTO study_cards VALUES(?,?,?,?,?)').run(id,'notion',old.id,null,JSON.stringify(card));
  }
  db.gradeCard('notion','duplicate-b','easy');
  const reviewed=db.exportSnapshot().reviewState;
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(quality.getStudyCards().find(c=>c.id==='duplicate-a').status,'suspended');
  assert.equal(quality.getStudyCards().find(c=>c.id==='duplicate-b').status,'ready');
  assert.deepEqual(db.exportSnapshot().reviewState,reviewed,'Duplicate reconciliation retains review history and both card IDs');
  reconcile=false;
  const beforeRejected=db.getGraph().notions.find(n=>n.id===old.id).explanation;
  const cachedPlans=planCalls;
  bridgeSupported=false;quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(db.getGraph().notions.find(n=>n.id===old.id).explanation,beforeRejected,'Rejected implicit reasoning cannot overwrite accepted notes');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','A rejected bridge overrides an optimistic concept audit');
  assert.equal(planCalls,cachedPlans,'Changing generation status does not invalidate the cached course plan');
  bridgeSupported=true;quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  const curated=db.getGraph().notions.find(n=>n.id===old.id);
  quality.setNotionMetadata(old.id,'course',[{documentId:doc.id,page:1,quote:source}],'reviewed-notes-v6-intuition',curated.sourceNotes);
  quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  const preserved=db.getGraph().notions.find(n=>n.id===old.id);
  assert(preserved.explanation.includes('source value chain'),'New generation can upgrade agent-authored notes through the audited teaching pipeline');
  assert.equal(preserved.definition,curated.definition);
  assert.equal(preserved.courseContext,curated.courseContext);
  assert.deepEqual(preserved.sourceNotes.map(n=>n.page),curated.sourceNotes.map(n=>n.page));
  assert.equal(preserved.generationVersion,(await env.load('contentQuality')).GENERATION_VERSION);
  const admin=db.insertDocument({title:'Course instructions',kind:'course',pageCount:1});
  db.insertPassages([{documentId:admin.id,page:1,ordinal:0,text:'Prepare an individual report for the instructor. Submit the report together with the group presentation before the next meeting.'}]);
  storage.savePdfFile(admin.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
  let classificationCalls=0;
  globalThis.__complete=async(system,prompt,tool)=>{
    classificationCalls++;
    if(tool==='extract_slide')return {kind:'administrative',reason:'Submission instructions',concepts:[],links:[],teachingPoints:[{key:'admin',detail:'Prepare an individual report.',quote:'Prepare an individual report for the instructor.',visualDescription:''}]};
    if(tool==='audit_classification')return {skipJustified:true,reason:'No subject teaching'};
    throw Error('Excluded slide must not request notes/cards/coverage: '+tool);
  };
  const excluded=await generateSlides(admin.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(classificationCalls,0,'Standalone submission instructions do not spend credits designing a subject plan');
  assert.equal(quality.pageAnalyses(admin.id)[0].status,'skipped','Audited exclusions cannot fail subject coverage');
  assert.deepEqual(excluded.warnings,[]);
  assert.equal(excluded.remainingPassages,0);
  const visualPoll=db.insertDocument({title:'Visual audience poll',kind:'course',pageCount:1});
  db.insertPassages([{documentId:visualPoll.id,page:1,ordinal:0,text:'10'}]);
  storage.savePdfFile(visualPoll.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
  classificationCalls=0;
  const visualExcluded=await generateSlides(visualPoll.id,{mode:'strict',enrichment:false});
  assert.equal(classificationCalls,1,'Sparse non-teaching images get one classification, not full generation');
  assert.equal(quality.pageAnalyses(visualPoll.id)[0].status,'skipped');
  assert.deepEqual(visualExcluded.warnings,[]);
  const logistics=db.insertDocument({title:'Course logistics',kind:'course',pageCount:2});
  db.insertPassages([{documentId:logistics.id,page:1,ordinal:0,text:'SLIDO https://app.sli.do/event/example 7216923'},{documentId:logistics.id,page:2,ordinal:1,text:'Course planning: individual submission deadline 30.10.2026.'}]);
  classificationCalls=0;
  const fast=await generateSlides(logistics.id,{mode:'strict',enrichment:false});
  assert.equal(classificationCalls,0,'Known logistics skip rendering and all paid LLM calls');
  assert.equal(fast.skippedPages,2);
  assert.equal(fast.remainingPassages,0);
  assert.deepEqual(fast.warnings,[]);
  console.log('PASS: contextual notes and preserved data; excluded inventories cannot create omissions; explicit logistics skip all paid calls.');
} finally {for(const connection of globalThis.__courseDbs?.values()??[])connection.close();process.chdir(env.root);}
