import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {DatabaseSync} from 'node:sqlite';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

if(!process.argv.includes('--live'))throw Error('Use --live: this evaluation calls the configured provider and consumes API credits.');
const root=process.cwd();nextEnv.loadEnvConfig(root,false,{info(){},error(){}});
// Bound this declared evaluation independently of the normal document budget.
for(const [key,limit] of [['MORROW_GENERATION_MAX_REQUESTS',20],['MORROW_GENERATION_MAX_TOKENS',80000]]){
  const configured=Number(process.env[key]);process.env[key]=String(Number.isInteger(configured)&&configured>0?Math.min(configured,limit):limit);
}
// Read real evidence before isolatedModules switches the writable data root.
const realSource=process.argv.includes('--real-source');
let realCorpus;
if(realSource){
  const original=new DatabaseSync(path.join(process.env.MORROW_DATA_DIR??path.join(root,'data'),`${process.env.DB_NAME??'encyclopedia'}.db`),{readOnly:true});
  try{
    const document=original.prepare('SELECT id,title FROM documents ORDER BY created_at DESC LIMIT 1').get();
    if(!document)throw Error('No real course document is available for evaluation.');
    const pages=original.prepare('SELECT page,text FROM passages WHERE document_id=? AND page IN (23,32) ORDER BY page,ordinal').all(document.id);
    realCorpus=[23,32].map(page=>({id:`real-course-page-${page}`,title:`${document.title} — page ${page}`,source:pages.filter(p=>p.page===page).map(p=>p.text).join('\n'),expected:page===23?['Preserve the customer need, covered risk and distinguishing financial feature of the product families.','No invented causal benefit, mandatory protection threshold or guaranteed cost saving.','Product classification can overlap; purpose and risk transfer matter more than the label.']:['Recall explicitly shown function/title associations using bounded questions.','Preserve that this is a possible organizational structure, not a universal requirement.','Do not invent duties, mandatory hierarchy or guaranteed outcomes from labels alone.']}));
    if(realCorpus.some(item=>!item.source.trim()))throw Error('The selected real course does not contain the expected evaluation pages.');
  }finally{original.close();}
}
const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','llm','pdf','structuredSchema']);
const db=await env.load('db'),quality=await env.load('qualityDb'),sections=await env.load('sectionGeneration'),scope=await env.load('courseScope'),courses=await env.load('courses'),llm=await env.load('llm'),telemetry=await env.load('llmTelemetry');
const corpus=realCorpus??[
  {id:'rectangle-fr',title:'Aire du rectangle',source:'Pour un rectangle, l’aire est le produit de la largeur par la hauteur. Les deux longueurs doivent être exprimées dans la même unité. Le résultat est exprimé en unités carrées. Si la hauteur reste fixe, doubler la largeur double l’aire. Cette formule n’est pas affirmée pour toutes les formes géométriques.',expected:['Aire = largeur × hauteur, avec unités cohérentes et résultat en unités carrées.','Une application doit donner toutes ses dimensions et résoudre le calcul.','Doubler la largeur ne double l’aire que si la hauteur est maintenue fixe.','Aucune généralisation à toutes les formes.']},
  {id:'reserving-en',title:'Recognizing a claim estimate',source:'In this simplified accounting exercise, an initial claim estimate of 100 creates an expense of 100 and a liability of 100 without changing cash. If the estimate is unchanged, settling that recognized liability with cash reduces cash by 100 and the liability by 100, without a new expense. Changing the estimate before settlement would change the expense; the unchanged-estimate assumption is essential. Recording the liability does not itself segregate cash or guarantee that funds are available.',expected:['Recognition affects expense and liability, not cash.','Settlement of an unchanged recognized estimate affects cash and liability, not a second expense.','The unchanged-estimate condition must remain explicit.','A liability is not a fund of available cash; no liquidity guarantee.']},
];
const criteria=['Question autonome et non ambiguë','Un seul objectif pertinent','Réponse directe et suffisante','Raisonnement décisif exact','Conditions, limites et unités conservées','Aucune affirmation ou attribution inventée','Valeur de rappel distincte des autres cartes'];
const report={version:3,generatedAt:new Date().toISOString(),pipelineVersion:sections.CORE_PIPELINE_VERSION,importLessons:process.env.MORROW_IMPORT_LESSONS==='1',isolated:true,realSource,writer:llm.currentProviderLabel(),primaryReviewer:llm.currentProviderLabel(true),factualReviewer:llm.currentProviderLabel('accuracy'),complete:false,cases:[],accuracyScore:null,limitations:[realSource?'Selected real-course text pages; visual pages and full-course coverage are not evaluated.':'Synthetic declared cases, not representative real-course coverage.','Model approval and passing tests are not independent expert validation.','No quality or accuracy score is assigned without manual review.']};
try{
  await telemetry.withGenerationBudget({requests:0,inputTokens:0,outputTokens:0},async()=>{
    for(const item of corpus)await scope.withCourse(courses.createCourse(item.title).id,async()=>{
      if(report.failure)return;
      const doc=db.insertDocument({title:item.title,kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:item.source}]);
      const startedAt=Date.now();
      try{
        const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
        const cards=quality.getStudyCards();
        report.cases.push({...item,wallTimeMs:Date.now()-startedAt,cards,usage:result.usage,warnings:result.warnings,analysis:quality.pageAnalyses(doc.id),manualReview:cards.map(c=>({cardId:c.id,criticalError:null,criteria:criteria.map(criterion=>({criterion,passed:null,comment:''})),reviewer:null}))});
        if(result.usage.failures||!cards.some(c=>c.status==='ready'))report.failure='No usable reviewed cards were produced for this case; evaluation stopped. Inspect recorded provider failures and warnings.';
      }catch(error){report.failure=error instanceof Error?error.message:String(error);report.cases.push({...item,error:report.failure});}
    });
  });
  report.complete=!report.failure&&report.cases.length===corpus.length;
}finally{
  const file=path.join(root,'data','reports',`card-quality-live-${Date.now()}.json`);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,accuracyScore:null,report:file,failure:report.failure}));
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
}
if(!report.complete)process.exitCode=1;
