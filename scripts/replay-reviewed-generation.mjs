// Reuse an actual local evaluation's source-bound verdicts. Never generate
// positive verdicts, call a provider, or accept changed/visual evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const root=process.cwd(),reportPath=flag('report'),documentId=flag('document'),courseId=flag('course');
if(!reportPath||!documentId||!courseId)throw Error('Required: --report=path --document=id --course=id; --apply publishes after all checks.');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
assert.equal(report.complete,true,'Only a completed real evaluation may be replayed');
assert.equal(report.humanQualityScore,null,'An evaluation is not a human quality certification');
assert(report.jobs?.some(j=>j.requests>0),'The report must contain actual provider operations');
const env=await isolatedModules(DATABASE_MODULES);
process.env.MORROW_DATA_DIR=path.join(root,'data');
const scope=await env.load('courseScope'),repo=await env.load('generationRepository'),quality=await env.load('qualityDb'),db=await env.load('db'),sections=await env.load('sourceSections'),catalog=await env.load('sourceCatalog'),engine=await env.load('generationEngine'),contracts=await env.load('directCardContracts'),recovery=await env.load('recovery');
await scope.withCourse(courseId,async()=>{
 const {source,title}=repo.readGenerationDocument(documentId);
 assert(!db.openDb().prepare("SELECT 1 FROM generation_jobs WHERE document_id=? AND status='running'").get(documentId),'Cannot publish while generation is running');
 const baseline=quality.getDocumentStudyCards(documentId),checked=[];
 for(const artifact of report.artifacts??[]){
  assert.equal(artifact.version,contracts.DIRECT_CARD_VERSION,'Different generation contract');
  assert.equal(artifact.pdfSha256,source.pdfSha256,'The original PDF must be identical');
  assert(!/fixture|synthetic|not configured/i.test(artifact.reviewModel),'A real provider review is required');
  assert.equal(artifact.cardDetail,'key-ideas','Only essential-selection reports are supported');
  assert(!artifact.repairs?.length,'Repaired evaluations require their own exact field binding');
  const pages=artifact.pages,primary=source.pages.filter(p=>pages.includes(p.page));
  assert.equal(primary.length,pages.length,'Every original page must exist');
  const input={documentId,title,revision:source.revision,primaryPages:pages,snippets:catalog.sourceCatalog(sections.sourceContext(pages,source.pages.filter(p=>!sections.administrativePageReason(p,source.pages)))),layouts:primary.filter(p=>p.layout).map(p=>({page:p.page,...p.layout})),imagePages:[],images:[],uncertainOcrPages:[]};
  assert(primary.every(p=>p.layout?.origin!=='ocr'),'OCR requires its original confidence checks');
  let calls=0;
  const model={async complete(_system,current,tool){
   assert.equal(tool,'audit_direct_cards','Only deterministic source-compiled cards may reuse these reviews');calls++;
   assert.equal(current.requiredQuestions.length,0,'Original quizzes require exact separate coverage binding');
   const inventory=k=>({key:k.key,page:k.page,claim:k.claim,sourceIds:k.sourceIds,selected:k.selected,importance:k.importance});
   assert.deepEqual(current.knowledge.map(inventory),artifact.draft.knowledge.map(inventory),'Source inventory or selection changed');
   assert.equal(current.fields.length,artifact.review.decisions.length,'Review must cover every exact field');
   for(const field of current.fields){
    const decision=artifact.review.decisions.find(d=>d.key===field.key);
    assert(decision&&!decision.requiresVisualEvidence&&!decision.duplicateOf,'Only independent textual verdicts can be reused');
    assert.equal(decision.claims.length,1,'Expected an immutable whole-field review');
    assert.equal(decision.claims[0].text,field.text,'Question, answer or concept definition changed');
    assert.equal(current.cards.find(c=>c.key===field.key).kind,artifact.draft.cards.find(c=>c.key===field.key).kind,'Card kind changed');
    for(const evidence of decision.claims[0].evidence){
     assert(field.sourceIds.includes(evidence.sourceId),'Evidence is outside the reviewed field scope');
     assert.equal(evidence.quote,input.snippets.find(s=>s.id===evidence.sourceId)?.text,'Original cited passage changed');
    }
   }
   return {targets:Object.fromEntries(artifact.review.targets.map(({key,coverageComplete,...t})=>[key,{...t,recallMatchesTarget:coverageComplete}])),decisions:Object.fromEntries(artifact.review.decisions.map(({key,claims,...d})=>[key,{...d,verdict:claims[0].verdict,evidence:claims[0].evidence.map(e=>({sourceId:e.sourceId})),reasoning:claims[0].reasoning}])),pages:Object.fromEntries(artifact.review.pages.map(({page,...p})=>['p'+page,{...p,questionCoverage:{}}]))};
  }};
  const output=await engine.runGenerationEngine(input,[],model,'key-ideas');
  assert.equal(calls,1,'No planner, writer, repair or paid call');
  assert(output.cards.every(c=>!c.issues.length),'Current local source and pedagogical gates must still pass');
  checked.push({pages,output,model:artifact.writerModel});
 }
 assert(checked.length,'No usable artifacts');
 console.log(JSON.stringify({verified:true,courseId,documentId,pages:checked.flatMap(c=>c.pages),cards:checked.reduce((n,c)=>n+c.output.cards.length,0),providerCalls:0,apply:process.argv.includes('--apply')}));
 if(process.argv.includes('--apply')){
  const recoveryId=recovery.createRecoveryPoint('before-reviewed-generation-replay');
  const results=checked.map(c=>repo.publishGeneration(source,title,c.pages,c.output,baseline,{mode:'strict',enrichment:false,cardDetail:'key-ideas'},c.model));
  fs.writeFileSync(path.join(root,'references/evaluation/reviewed-replay-latest.json'),JSON.stringify({reportPath,documentId,courseId,recoveryId,results,providerCalls:0,at:new Date().toISOString()},null,2));
  console.log(JSON.stringify({published:true,results,providerCalls:0}));
 }
});
