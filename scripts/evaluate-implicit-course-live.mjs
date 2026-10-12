// Real uploaded slides/images and LLM pipeline in an isolated course DB.
// Explicit invocation consumes credits; the user's course is never modified.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const root=process.cwd();
const {default:nextEnv}=await import('@next/env');nextEnv.loadEnvConfig(root,true,{info(){},error(){}});
const snapshot=JSON.parse(await readFile('data/reports/pedagogy-audit-snapshot.json','utf8')).snapshot;
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llm','llmTelemetry','structuredSchema','pdf']);
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),llm=await env.load('llm');
const {generateSlides}=await env.load('generateSlides');
const report={model:llm.currentProviderLabel(),auditModel:llm.currentProviderLabel(true),isolated:true,generatedAt:new Date().toISOString(),cases:[],limitations:'Two real source pages and their images; pipeline success does not prove equivalence to a full live lecture.'};
try{
 for(const [documentId,page] of [['216268ae-dbe2-4935-8b65-7e7c5dfbed87',8],['4fe379c0-a193-4ddb-acae-60f003af1972',23]]){
  const original=snapshot.documents.find(d=>d.id===documentId);
  const doc=db.insertDocument({title:original.title,kind:'course',pageCount:original.pageCount});
  db.insertPassages(original.passages.map((p,i)=>({documentId:doc.id,page:p.page,ordinal:i,text:p.text})));
  const bytes=Buffer.from(original.pdfBase64,'base64');storage.savePdfFile(doc.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  console.log(`Generating real page ${page}: ${original.title}`);
  const result=await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[page]});
  const graph=db.getGraph(true),notes=graph.notions.filter(n=>n.sources.some(s=>s.documentId===doc.id));
  const cards=quality.getStudyCards().filter(c=>c.evidence.some(e=>e.documentId===doc.id));
  report.cases.push({sourceTitle:original.title,page,sourceText:original.passages.filter(p=>p.page===page).map(p=>p.text).join('\n'),notes:notes.map(n=>({label:n.label,definition:n.definition,explanation:n.explanation,evidence:n.evidence})),cards,branches:graph.notions.filter(n=>n.generationVersion==='planned-course-v1'),analysis:quality.pageAnalyses(doc.id).find(p=>p.page===page),warnings:result.warnings,run:quality.exportQuality().generation_runs.find(r=>r.id===result.runId)});
  await mkdir(path.join(root,'data/reports'),{recursive:true});await writeFile(path.join(root,'data/reports/implicit-course-live.json'),JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify({page,notes:notes.length,readyCards:cards.filter(c=>c.status==='ready').length,status:report.cases.at(-1).analysis.status,warnings:result.warnings}));
 }
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();process.chdir(root);}
