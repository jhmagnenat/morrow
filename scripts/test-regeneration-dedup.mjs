import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry'],{
  courseSections:`export async function reconstructCourseSection(){return undefined;}`,
  llm:`export function currentProviderLabel(){return 'fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(){return 'data:image/png;base64,AAAA';}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),q=await env.load('contentQuality'),storage=await env.load('pdfStorage');
const {generateSlides}=await env.load('generateSlides');
const source='A premium is the price paid for the insurance coverage provided by a policy.';
const doc=db.insertDocument({title:'Insurance price and coverage',kind:'course',pageCount:1});
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF-1.7\nfixture').buffer);
let round=0,notionId;
const questions=['What does an insurance premium pay for?','What does an insurance premium pay for?','What does the price paid by a policyholder purchase?','What does the price paid by a policyholder purchase?','What is purchased in exchange for a policyholder’s premium?'];
const objectives=['Explain the price of insurance coverage','Identify the policy coverage purchased','Identify the policy coverage purchased','Explain the insurance cover purchased','Explain the insurance cover purchased'];
globalThis.__complete=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);
  if(tool==='audit_classification')return {skipJustified:false,reason:'Source teaches the price of coverage.'};
  if(tool==='plan_course')return {purpose:'Understand what is purchased.',learnerStartingPoint:'A beginner.',branches:[{key:'price',label:'Pricing and coverage',question:'What is purchased?',summary:['Premium pays for coverage.'],pages:[1],scope:'Price and coverage.'}],progression:['Need','Coverage','Price']};
  if(tool==='extract_slide')return {kind:'content',reason:'A substantive definition.',concepts:[{key:'premium',branchKey:'price',existingId:round>0&&round<3?notionId:'',label:round===0?'Insurance premium':round<3?'Price of insurance cover':`Coverage price ${round}`,domain:round===0?'Insurance':`Financial groups ${round}`,definition:'The price of insurance coverage.',explanation:'The premium is paid in exchange for the coverage promised by the policy.',courseContext:'The cost of purchasing cover.',quote:source,visualDescription:'',layer:'course'}],links:[]};
  if(tool==='teach_notes')return {notes:input.concepts.map(c=>({key:c.key,branchKey:'price',explanation:c.explanation,courseContext:c.courseContext,bridges:[{kind:'deduction',question:'What is purchased?',explanation:'Coverage is the insurer’s promise to compensate covered losses, rather than a refund of every premium.',premiseSourceIds:[input.sourceSnippets[0].id],assumptions:[]}],sketch:{relations:['Policyholder — pays premium for → coverage'],example:'A hypothetical policyholder pays for cover against a stated loss.'},workflow:{before:'The coverage is specified.',inputs:'Policy terms and price.',decision:'Choose to purchase the coverage.',after:'The contract defines covered losses.'},confusions:[{first:'Premium',second:'Claim payment',distinction:'The price buys coverage; compensation follows a covered loss.'}],evidence:[]}))};
  if(tool==='draft_cards')return {cards:[{key:'price-card',concept:'premium',relationSource:'',relationTarget:'',question:questions[round],answer:'The insurance coverage promised by the policy.',example:'',kind:round===0?'definition':round<3?'mechanism':'comparison',objective:objectives[round],quote:source}]};
  if(tool==='audit_slide')return {bridges:input.bridges.map(b=>({key:b.key,supported:true,reason:'Supported'})),coverageComplete:true,missingObjectives:[],teachingPoints:[],links:[],existingCards:[],concepts:input.concepts.map(c=>({key:c.key,supported:true,consistent:true,scopeCorrect:true,contextual:true,detailsPreserved:true,existingMatch:Boolean(c.existingId),canonicalExistingId:c.existingId,reason:'Same source concept when identified'})),cards:input.cards.map(c=>({key:c.key,supported:true,consistent:true,scopeCorrect:true,atomic:true,unambiguous:true,duplicateOf:'',reason:'Source supported; fixture intentionally misses duplicateOf'}))};
  throw new Error('Unexpected tool '+tool);
};
try {
  await generateSlides(doc.id,{mode:'strict',enrichment:false});
  const original=quality.getStudyCards()[0];notionId=original.notionId;
  db.gradeCard('notion',original.id,'easy');
  const scheduling=db.exportSnapshot().reviewState,logs=db.exportSnapshot().reviewLog;
  for(round=1;round<5;round++){
    db.clearMapping();
    assert.equal(db.getGraph(true).notions.length,0);
    const result=await generateSlides(doc.id,{mode:'strict',enrichment:false});
    assert.equal(quality.getStudyCards().length,1,`Clear + regeneration round ${round} must reuse the deck card`);
    assert.equal(quality.getStudyCards()[0].id,original.id);
    assert.equal(result.cardsCreated,0);
    assert.deepEqual(db.exportSnapshot().reviewState,scheduling);
    assert.deepEqual(db.exportSnapshot().reviewLog,logs);
    if(round<3){
      assert.equal(db.getNotionById(notionId).label,'Insurance premium','A model-suggested synonym cannot silently rewrite an existing concept identity');
      assert(db.getGraph().notions.some(n=>n.label==='Price of insurance cover'),'A differently named concept is materialized separately while its identical review objective can reuse the card');
    }
  }
  const card=quality.getStudyCards()[0],proof=card.evidence;
  assert.equal(q.reusableStudyCard([card],{...card,question:'How is an expected claim amount estimated?',objective:'Estimate the expected claim amount'},'another-node',proof),undefined,'Different mechanisms do not merge through a shared page');
  assert.equal(q.reusableStudyCard([{...card,objective:'Understand the insurance concept'}],{...card,question:'How is an expected claim amount estimated?',objective:'Understand the insurance concept'},'another-node',proof),undefined,'A generic objective is not an identity even on the same source page');
  assert.equal(q.reusableStudyCard([card],{...card},'another-node',[{...proof[0],documentId:'other-document',page:2}]),undefined,'Different source contexts do not merge across rebuilt nodes');
  assert.equal(q.reusableStudyCard([card],{...card},'another-node',[{...proof[0],page:2}]),undefined,'Identical text from different case pages does not merge without audit');
  const other={...card,id:'newer-card',notionId:'other',userEdited:false};
  assert.equal(q.reusableStudyCard([other,card],card,card.notionId,proof,undefined,new Set([card.id])).id,card.id,'Reviewed cards win over unreviewed copies');
  const manual={...other,id:'manual',userEdited:true};
  assert.equal(q.reusableStudyCard([card,manual],card,card.notionId,proof,undefined,new Set([card.id])).id,manual.id,'Manual edits are preserved preferentially');
  quality.saveStudyCard({...card,userEdited:true,answer:'A manually verified answer for this coverage.'});
  const manualAnswer=quality.getStudyCards()[0].answer;
  round=4;db.clearMapping();await generateSlides(doc.id,{mode:'strict',enrichment:false});
  assert.equal(quality.getStudyCards().length,1);assert.equal(quality.getStudyCards()[0].answer,manualAnswer);
  assert.deepEqual(db.exportSnapshot().reviewState,scheduling);
  console.log('PASS: repeated clear/regeneration, renamed concepts/domains, changed card kinds/questions, source-scoped reuse, preserved edits, IDs, scheduling and review logs. No paid API calls.');
} finally {db.openDb().close();}
