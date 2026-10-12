import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const env=await isolatedModules([...DATABASE_MODULES,'reliabilityContext','ankiExport'],{
  llm:`import {observeLlm} from './llmTelemetry.mjs';export function currentProviderLabel(){return 'simulated-teacher';}export function isLlmConfigured(){return true;}export async function structuredCompletion(...args){return observeLlm(()=>globalThis.__teacher(...args),()=>({input:100,output:100}));}`,
  pdf:`export async function renderPdfPagesAsDataUrls(_pdf,pages){return pages.map(()=> 'data:image/png;base64,aGVsbG8=');}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),dispatch=await env.load('generationDispatch');
const teaching=await env.load('teachingStorage'),reviews=await env.load('contentReview'),storage=await env.load('pdfStorage');
const source='Photosynthesis\nChloroplasts: light reactions; carbon fixation.\nPrerequisites: light, water and carbon dioxide.\nLearning objectives: understand energy conversion, distinguish stages and reason about limiting conditions.';
let scenario='good',calls=[],mutation;
globalThis.__teacher=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);calls.push(tool);
  if(tool==='reconstruct_teaching'){
    assert(system.includes('NOT a complete transcript'));
    const id=input.sources.find(s=>input.primaryPages.includes(s.page)).id;
    return {units:[{title:'Photosynthesis',claims:[
      {statement:'Photosynthesis converts light energy into chemical energy stored in organic compounds.',origin:'background',sourceIds:[id],uncertainty:''},
      {statement:'The slide distinguishes light reactions from carbon fixation.',origin:'slide',sourceIds:[id],uncertainty:''},
      {statement:'This advertisement proves a measured increase in trust.',origin:'slide',sourceIds:[id],uncertainty:''},
      {statement:'The lecturer specifically intended a particular examination question.',origin:'background',sourceIds:[id],uncertainty:'The lecturer intention is unknown'},
      {statement:'In a hypothetical constant-rate example, fixing 2 carbon units per hour for 3 hours produces 6 carbon units, assuming the rate stays unchanged.',origin:'illustration',sourceIds:[id],uncertainty:''},
      {statement:'In a hypothetical arithmetic example, 3 * 4 = 15.',origin:'illustration',sourceIds:[id],uncertainty:''},
    ]}]};
  }
  if(tool==='audit_teaching')return {decisions:Object.fromEntries(input.units.flatMap(u=>u.claims).map(c=>[c.id,{verdict:c.id.endsWith('c2')?'reject':c.uncertainty?'uncertain':'accept',reason:c.id.endsWith('c2')?'No experiment is established by an advertisement':'Explicit simulated scientific review, not measured model accuracy'}]))};
  if(tool==='teaching_cards'){
    if(scenario==='card-provider-failure')throw Error('429 You have no credits remaining');
    assert.equal(input.lesson.units[0].claims.length,3,'Rejected, uncertain and arithmetically false teaching never reaches the writer');
    assert(input.lesson.units[0].claims.some(c=>c.origin==='background'),'Background omitted from slides is intentionally retained');
    const id=input.lesson.units[0].claims[0].id;
    return {cards:[
      {topic:'Photosynthesis',topicDefinition:'Photosynthesis converts light energy into chemical energy.',question:'What energy transformation occurs during photosynthesis?',answer:'Light energy is converted into chemical energy.',explanation:'Chemical energy is stored in organic compounds.',kind:'definition',objective:'Recall the energy conversion of photosynthesis',claimIds:scenario==='forged'?['not-approved']:[id]},
      {topic:'Photosynthesis',topicDefinition:'The slide distinguishes light reactions from carbon fixation.',question:'Which two stages of photosynthesis are distinguished in this course?',answer:'Light reactions and carbon fixation.',explanation:'',kind:'comparison',objective:'Distinguish the two stages of photosynthesis',claimIds:['u0c1']},
      {topic:'Photosynthesis',topicDefinition:'A hypothetical constant rate can be used for a worked example.',question:'In a hypothetical example, a plant fixes 2 carbon units per hour for 3 hours at an unchanged rate. How many carbon units does it fix?',answer:'6 carbon units.',explanation:'2 units per hour × 3 hours = 6 units.',kind:'application',objective:'Apply an explicitly hypothetical constant rate',claimIds:['u0c4']},
    ]};
  }
  if(tool==='audit_teaching_cards'){
    mutation?.();mutation=undefined;
    return {decisions:Object.fromEntries(input.cards.map(c=>[c.key,{accepted:scenario!=='reject-card'||c.key!=='c1',atomic:true,unambiguous:true,relevant:true,reason:'Simulated card review'}])),pages:Object.fromEntries(input.primaryPages.map(p=>['p'+p,{excluded:false,reason:'Explained incomplete slide',missingObjectives:[]}]))};
  }
  throw Error('Unexpected stage '+tool);
};
function document(text=source){const doc=db.insertDocument({title:'Biology fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text}]);storage.savePdfFile(doc.id,new TextEncoder().encode('fixture original PDF').buffer);return doc;}
const generate=doc=>dispatch.generateConfiguredSection(doc.id,{mode:'strict',enrichment:false,pages:[1]});
try{
  const doc=document();const result=await generate(doc);
  assert.equal(result.readyCards,3);
  assert.deepEqual(calls,['reconstruct_teaching','audit_teaching','teaching_cards','audit_teaching_cards']);
  const cards=quality.getDocumentStudyCards(doc.id),background=cards.find(c=>c.teaching.origin==='background');
  assert(background&&background.status==='ready','Added context can publish although the slide never states the definition');
  assert(background.accuracyReview&&background.teaching.claims.length===1);
  const lesson=teaching.getTeachingLessons().find(l=>l.documentId===doc.id);
  assert.equal(lesson.units[0].claims.length,3);assert.equal(lesson.unresolved.length,3);
  assert(lesson.unresolved.some(u=>u.statement.includes('3 * 4 = 15')),'Local arithmetic checks reject a false example despite an optimistic reviewer');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','Unresolved teaching is visible, never false complete coverage');
  const originalHash=reviews.cardContentHash(background);
  assert.notEqual(reviews.cardContentHash({...background,teaching:{...background.teaching,origin:'slide'}}),originalHash,'Origin is part of immutable review binding');
  const tampered=quality.saveStudyCard({...background,teaching:{...background.teaching,origin:'slide'}});
  assert.equal(tampered.status,'draft','Tampered provenance cannot enter revisions');
  quality.saveStudyCard(background);
  const revision=db.gradeCard('notion',background.id,'good');assert(revision.dueAt);
  const history=db.openDb().prepare('SELECT COUNT(*) AS n FROM review_log').get().n;
  quality.retryPages(doc.id,[1]);calls=[];await generate(doc);
  assert.equal(calls.length,0,'Unchanged stages reuse cached model output, including stable teaching inputs');
  assert.equal(db.openDb().prepare('SELECT COUNT(*) AS n FROM review_log').get().n,history,'Reconstruction preserves review history');
  assert(quality.getStudyCard(background.id),'Studied card identity survives generation');
  const context=(await env.load('reliabilityContext')).reliabilityContext();
  const graph=db.getGraph();
  const exported=(await env.load('ankiExport')).ankiExport({...graph,...context,cards:quality.getStudyCards(),passages:graph.documents.flatMap(d=>db.getPassagesForDocument(d.id))});
  assert(exported.exported>=2);assert(exported.text.includes('Added teaching context'),'Anki export discloses added context');
  const snapshot=db.exportSnapshot();assert(snapshot.quality.quality_settings.some(r=>String(r.key).startsWith('teaching-lesson:')),'Backups carry reconstructed teaching');
  scenario='reject-card';calls=[];const rejected=document();const partial=await generate(rejected);assert.equal(partial.readyCards,2);assert.equal(quality.getDocumentStudyCards(rejected.id).filter(c=>c.status==='draft').length,1);
  scenario='forged';const forged=document();await generate(forged);assert.equal(quality.getDocumentStudyCards(forged.id).length,0,'Unknown teaching claim IDs prevent any publication');
  scenario='card-provider-failure';calls=[];const interrupted=document();const failed=await generate(interrupted);assert(failed.warnings.some(w=>w.includes('no credits remaining')));assert.equal(calls.length,3,'Quota failure stops without a repair loop');assert.equal(quality.getDocumentStudyCards(interrupted.id).length,0);assert(teaching.getTeachingLessons().some(l=>l.documentId===interrupted.id&&l.units.length),'An accepted explanation survives a subsequent card-provider failure');
  scenario='good';const race=document();mutation=()=>db.insertPassages([{documentId:race.id,page:1,ordinal:1,text:'Changed source material.'}]);await assert.rejects(generate(race),/source document changed/);assert.equal(quality.getDocumentStudyCards(race.id).length,0,'No stale card is committed after a source race');assert(!teaching.getTeachingLessons().some(l=>l.documentId===race.id),'Earlier accepted teaching becomes unavailable after its original source changes');
  calls=[];const admin=document('The final grade includes an individual submission (30%), an exam (70%) and attendance requirements. Submit your assignment before the deadline.');await generate(admin);assert.equal(calls.length,0,'Administrative slides do not consume credits');
  scenario='good';calls=[];const sparse=document('Photosynthesis');await generate(sparse);assert(quality.getDocumentStudyCards(sparse.id).some(c=>c.status==='ready'&&c.teaching.origin==='background'),'An incomplete heading can anchor teaching without pretending to prove it');
  console.log('PASS: incomplete slides → independently reviewed added teaching → multidimensional cards; rejected claims, provenance tampering, cache, Anki, backups, source races and revision history. All model responses simulated.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
