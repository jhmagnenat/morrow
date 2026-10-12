// Default is read-only preparation. --live makes a bounded number of configured
// provider calls, in an isolated course, and never writes to the user's deck.
import path from 'node:path';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import nextEnv from '@next/env';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const root=process.cwd();nextEnv.loadEnvConfig(root,false,{info(){},error(){}});
const dataRoot=path.resolve(process.env.MORROW_DATA_DIR??path.join(root,'data'));
const original=new DatabaseSync(path.join(dataRoot,'encyclopedia.db'),{readOnly:true});
let document,pages;
try{
  document=original.prepare('SELECT id,title,page_count FROM documents ORDER BY created_at DESC LIMIT 1').get();
  if(!document)throw Error('Upload a course before preparing this evaluation.');
  pages=original.prepare('SELECT page,text,layout FROM source_pages WHERE document_id=? ORDER BY page').all(document.id).map(p=>({page:Number(p.page),text:String(p.text),...(p.layout?{layout:JSON.parse(String(p.layout))}:{})}));
  if(!pages.length)throw Error('Original source pages are unavailable; import the original PDF first.');
}finally{original.close();}
const requested=process.argv.find(arg=>arg.startsWith('--pages='))?.slice(8);
const reference=JSON.parse(fs.readFileSync(path.join(root,'references/evaluation/insurance-generation-reference.json'),'utf8'));
const selected=requested?requested.split(',').map(Number):process.argv.includes('--reference')?reference.pages.map(p=>p.page):[19,23];
if(!selected.length||selected.length>7||new Set(selected).size!==selected.length||selected.some(n=>!Number.isInteger(n)||!pages.some(p=>p.page===n)))throw Error('Select up to seven existing pages with --pages=19,23.');
const pdfFile=path.join(dataRoot,'uploads','default',`${document.id}.pdf`);
const pdf=fs.existsSync(pdfFile)?fs.readFileSync(pdfFile):null;
const plan={document:document.title,pages:selected,live:process.argv.includes('--live'),maximumCalls:selected.length*5,outputTokensPerCall:6144,isolated:true,pdfAvailable:Boolean(pdf),qualityScore:null};
if(!plan.live){console.log(JSON.stringify(plan,null,2));process.exit(0);}
process.env.MORROW_GENERATION_MAX_REQUESTS=String(plan.maximumCalls);process.env.MORROW_GENERATION_MAX_TOKENS=String(selected.length*25000);process.env.MORROW_MAX_OUTPUT_TOKENS='8192';process.env.MORROW_LLM_TIMEOUT_MS='30000';
const env=await isolatedModules([...DATABASE_MODULES,'llm','pdf']);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),sources=await env.load('sourceDocument'),direct=await env.load('directCardGeneration'),telemetry=await env.load('llmTelemetry');
const report={...plan,createdAt:new Date().toISOString(),complete:false,cases:[],limitations:['No independent human ratings: no accuracy or learning score.','Selected pages cannot establish full-course coverage or RemNote parity.']};
try{
  const doc=db.insertDocument({title:document.title,kind:'course',pageCount:Number(document.page_count)});
  db.insertPassages(pages.map(p=>({documentId:doc.id,page:p.page,ordinal:0,text:p.text})));
  if(pdf)storage.savePdfFile(doc.id,Uint8Array.from(pdf).buffer);
  sources.storeSourceDocument(db.openDb(),doc.id,pages,sources.originalPdfHash(pdf));
  await telemetry.withGenerationBudget({requests:0,inputTokens:0,outputTokens:0},async()=>{
    for(const page of selected){
      const start=Date.now(),result=await direct.generateDirectCards(doc.id,{mode:'strict',enrichment:false,pages:[page],cardDetail:'key-ideas'});
      const cards=quality.getDocumentStudyCards(doc.id,[page]);
      report.cases.push({originalPage:page,sourceText:pages.find(p=>p.page===page).text,expectedTopics:reference.pages.find(p=>p.page===page)?.expectedTopics??[],expectedTopicReview:reference.pages.find(p=>p.page===page)?.expectedTopics.map(topic=>({topic,covered:null,reviewer:null}))??[],wallTimeMs:Date.now()-start,result,cards,notions:db.getGraph().notions.filter(n=>cards.some(c=>c.notionId===n.id)),analysis:quality.pageAnalyses(doc.id).find(p=>p.page===page),humanReview:cards.map(c=>({id:c.id,acceptableWithoutEditing:null,criticalErrors:null,reviewer:null}))});
      if(result.usage.failures){report.failure='Provider request failed; stopped without retries.';break;}
    }
  });
  report.complete=!report.failure&&report.cases.length===selected.length;
}catch(error){report.failure=error instanceof Error?error.message:String(error);}
finally{
  const file=path.join(root,'.next','direct-generation-evaluation.json');fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:report.complete,report:file,failure:report.failure,cases:report.cases.map(c=>({page:c.originalPage,wallTimeMs:c.wallTimeMs,ready:c.cards.filter(x=>x.status==='ready').length,draft:c.cards.filter(x=>x.status==='draft').length,usage:c.result.usage,warnings:c.result.warnings}))},null,2));
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
}
if(!report.complete)process.exitCode=1;
