import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry'],{
  courseSections:`export async function reconstructCourseSection(){return undefined;}`,
  llm:`export function currentProviderLabel(){return 'fixture';} export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(){return 'data:image/png;base64,AAAA';}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),q=await env.load('contentQuality'),pedagogy=await env.load('coursePedagogy'),policy=await env.load('teachingPolicy');
const {generateSlides}=await env.load('generateSlides');
assert(q.teachingQualityIssues('Ceded Premium Payment Accounting',"Expenses increase but this doesn't directly impact profit.").length);
assert(q.teachingQualityIssues('Technical Provisions','Reserves are separate funds set aside.').length);
assert.equal(q.teachingQualityIssues('Technical Provisions','Reserves are estimates, not separate funds set aside in cash.').length,0);
assert(q.teachingQualityIssues('Company Functions','Reserving involves setting aside enough funds to cover anticipated liabilities.').length);
assert(q.teachingQualityIssues('Reinsurance','This ensures solvency and stability even under extraordinary claim events.').length);
assert.equal(q.teachingQualityIssues('Reinsurance','Risk transfer reduces exposure but does not guarantee solvency.').length,0);
assert(q.teachingQualityIssues('Previously Reserved Claim Settlement','Incurred claims raise liabilities without immediate profit impact.').length);
assert.equal(q.teachingQualityIssues('Previously Reserved Claim Settlement','Payment reduces cash and the previously recognized liability, with no new expense if the estimate is unchanged.').length,0);
assert(pedagogy.isClassroomInstruction('Nominate one person to explain the hardest transaction.'));
assert(!pedagogy.isClassroomInstruction('Calculate the change in cash and explain why it differs from profit.'));
assert(q.cardQuality('What is the total change in cash from the reconciliation session?','The change is +14.').length);
assert(q.cardQuality('How are Provisions and Claims connected?','Provisions estimate unpaid claim obligations.').length);
assert.equal(q.cardQuality('A case receives 20, pays 2 and pays 5. What is the cash change?','20 - 2 - 5 = 13.').length,0);
const text='Simplified recognition rules: a ceded premium of 2 is paid and recognized as a reinsurance expense. Cash decreases by 2; profit decreases by 2. Nominate one person to explain the hardest transaction.';
const doc=db.insertDocument({title:'Insurance accounting mechanisms',kind:'course',pageCount:2});
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text},{documentId:doc.id,page:2,ordinal:0,text:'A ceded premium is the price of the cover bought from a reinsurer.'}]);
storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
const peer=db.insertNotion({label:'Ceded premium and cover',domain:'Insurance',status:'draft',definition:'The price of reinsurance cover.',explanation:'An earlier draft incorrectly confuses charges and cash.',sources:[{documentId:doc.id,page:2}]});
quality.setNotionMetadata(peer.id,'course',[]);
let scenario='normal',extractCalls=0,teachCalls=0,auditCalls=0;
const correct='Under the simplified recognition rules of this exercise, paying and recognizing a ceded premium of 2 reduces cash by 2 and profit by 2. Payment and expense recognition are separate events in general accounting.';
globalThis.__complete=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);
  if(tool==='plan_course')return {purpose:'Understand recognition and settlement.',learnerStartingPoint:'A beginner.',branches:[{key:'accounting',label:'Financial mechanisms',question:'What changes?',summary:['Expenses reduce profit; payments reduce cash.'],pages:[1,2],scope:'Recognition and cash movements.'}],progression:['Event','Accounts','Reconcile']};
  if(tool==='extract_slide'){
    extractCalls++;
    return {kind:'content',reason:'An accounting mechanism.',teachingPoints:[{key:'expense',detail:'A recognized ceded premium expense reduces profit.',quote:text,visualDescription:''},{key:'presenter',detail:'Nominate one person to explain the hardest transaction.',quote:text,visualDescription:''}],concepts:[{key:'ceded',branchKey:'accounting',existingId:'',label:'Ceded Premium Payment Accounting',domain:'Insurance',definition:'A payment for reinsurance cover.',explanation:correct,courseContext:'An expense in this case.',quote:text,visualDescription:'',layer:'course',teachingPoints:['expense']}],links:scenario==='unsupported-link'?[{key:'invented',source:'ceded',target:peer.id,type:'prerequisite',description:'An invented mandatory sequence.',quote:text}]:[]};
  }
  if(tool==='teach_notes'){
    teachCalls++;
    assert(input.courseConceptReferences.some(n=>n.id===peer.id),'Related earlier notes are supplied for cross-concept checks');
    if(scenario==='format-repair' && teachCalls===1)return {notes:[]};
    if(scenario==='format-repair')assert(input.formatRepair?.reason.includes('exactly one'));
    return {notes:[{key:'ceded',branchKey:'accounting',explanation:scenario==='bad-note'?"Paying ceded premium creates an expense without direct effects on profit.":correct,courseContext:'Simplified recognition in this case.',bridges:[{kind:'deduction',question:'Why does profit fall?',explanation:'An expense is subtracted from revenue in calculating profit; cash timing can differ.',premiseSourceIds:[input.sourceSnippets.find(s=>s.page===1 && s.quote).id],assumptions:['The whole payment is recognized as an expense in this exercise.']}],sketch:{relations:['Payment — cash outflow → cash −2','Expense recognition — charge → profit −2'],example:'In this simplified case, a recognized expense of 2 reduces profit by 2.'},workflow:{before:'Reinsurance cover is agreed.',inputs:'Payment and recognition rule.',decision:'Recognize the expense and payment separately.',after:'Reconcile profit and cash effects.'},confusions:[{first:'Payment',second:'Expense recognition',distinction:'Cash timing is distinct from profit recognition.'}],teachingPoints:['expense'],evidence:[]}]};
  }
  if(tool==='draft_cards')return {cards:[{key:'card',bridgeKeys:[],concept:'ceded',relationSource:'',relationTarget:'',question:'Under this exercise’s simplified rule, how does a recognized ceded premium expense of 2 affect profit?',answer:scenario==='bad-card'?"It increases reinsurance expenses but doesn't directly impact profit.":'Profit decreases by 2 because the expense is deducted from revenue.',example:'',kind:'mechanism',objective:'Effect of recognized reinsurance expense on profit',quote:text}]};
  if(tool==='audit_slide'){
    auditCalls++;
    assert(!input.teachingPoints.some(p=>p.key==='presenter'),'Classroom commands do not become missing subject objectives');
    return {bridges:input.bridges.map(b=>({key:b.key,supported:true,reason:'Fixture accepts bridge'})),coverageComplete:true,missingObjectives:[],teachingPoints:input.teachingPoints.map(p=>({key:p.key,supported:true,covered:true,reason:'Mechanism retained'})),links:input.links.map(l=>({key:l.key,supported:false,reason:'Not source supported'})),existingCards:[],concepts:input.concepts.map(c=>({key:c.key,supported:true,consistent:scenario==='missing-check'?undefined:true,scopeCorrect:true,contextual:true,detailsPreserved:true,existingMatch:Boolean(c.existingId),canonicalExistingId:c.existingId,reason:'Optimistic model decision'})),cards:input.cards.map(c=>({key:c.key,supported:true,consistent:true,scopeCorrect:true,atomic:true,unambiguous:true,duplicateOf:'',reason:'Optimistic model decision'}))};
  }
  throw new Error('Unexpected tool '+tool);
};
try {
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  const accepted=db.getGraph().notions.find(n=>n.label==='Ceded Premium Payment Accounting');
  assert(accepted.explanation.includes('profit by 2'));
  for(scenario of ['bad-note','bad-card','missing-check']){
    quality.retryPages(doc.id,[1]);extractCalls=teachCalls=auditCalls=0;
    await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
    assert.equal(extractCalls,2,'Semantic repairs are bounded');
    assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'retry');
    assert(!quality.getStudyCards().some(c=>c.status==='ready' && c.answer.includes("doesn't directly impact profit")),'Optimistic audit cannot make the wrong card ready');
    assert.equal(db.getGraph().notions.find(n=>n.id===accepted.id).explanation,accepted.explanation,'Bad or unaudited notes do not replace the accepted lesson');
  }
  scenario='format-repair';quality.retryPages(doc.id,[1]);extractCalls=teachCalls=auditCalls=0;
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(extractCalls,1);assert.equal(teachCalls,2);assert.equal(auditCalls,1);
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete');
  scenario='unsupported-link';quality.retryPages(doc.id,[1]);extractCalls=teachCalls=auditCalls=0;
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete','Rejecting an invented optional link is not missing source coverage');
  assert(!db.getGraph().links.some(l=>l.description==='An invented mandatory sequence.'));
  scenario='normal';
  const currentPage=quality.pageAnalyses(doc.id)[0];
  quality.retryPages(doc.id,[1]);
  quality.savePageAnalysis(doc.id,{...currentPage,status:'retry',version:'slides-v7-implicit-teaching'});
  extractCalls=teachCalls=auditCalls=0;
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1],skipRetried:true});
  assert.equal(extractCalls,1,'A new pipeline revisits old failed pages without a manual reset');
  scenario='bad-note';quality.retryPages(doc.id,[1]);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1],skipRetried:true});
  extractCalls=0;
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1],skipRetried:true});
  assert.equal(extractCalls,0,'A persistent failure in this version cannot cause repeated paid generations');
  const template=quality.getStudyCards()[0];
  quality.saveStudyCard({...template,id:'automatic-legacy',promptVersion:'legacy',status:'ready',userEdited:false});
  quality.saveStudyCard({...template,id:'manual-legacy',promptVersion:'legacy',status:'ready',userEdited:true});
  quality.saveStudyCard({...template,id:'wrong-reviewed-by-model',status:'ready',userEdited:false,answer:"The expense doesn't directly impact profit."});
  db.gradeCard('notion','automatic-legacy','easy');const reviewBefore=db.exportSnapshot().reviewState;
  const cardIdsBefore=quality.getStudyCards().map(c=>c.id);
  quality.quarantineUnverifiedCards(db.openDb());
  assert.equal(quality.getStudyCards().find(c=>c.id==='automatic-legacy').status,'draft');
  assert.equal(quality.getStudyCards().find(c=>c.id==='manual-legacy').status,'ready');
  assert.equal(quality.getStudyCards().find(c=>c.id==='wrong-reviewed-by-model').status,'draft');
  assert.deepEqual(db.exportSnapshot().reviewState,reviewBefore);
  assert.deepEqual(quality.getStudyCards().map(c=>c.id),cardIdsBefore);
  quality.quarantineUnverifiedCards(db.openDb());
  assert.deepEqual(db.exportSnapshot().reviewState,reviewBefore,'Quarantine is idempotent and preserves review history');
  const refs=policy.courseConceptReferences([{label:'Premium',definition:'Price of cover.'}],Array.from({length:20},(_,i)=>({id:String(i),label:'Premium pricing',definition:'Price of cover',explanation:'x'.repeat(6000)})));
  assert.equal(refs.length,3);assert(refs.every(r=>r.explanation.length<1900),'Cross-concept context remains bounded');
  console.log('PASS: optimistic-audit rejection, explicit consistency/scope decisions, one-stage format repair, meaningful coverage, standalone cards and reversible legacy quarantine. No paid API call.');
} finally {db.openDb().close();}
