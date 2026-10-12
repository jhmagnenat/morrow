// Explicit --live only. Six-call / 160k-character ceiling; isolated database.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
if(!process.argv.includes('--live'))throw new Error('Use --live to explicitly run the bounded paid evaluation.');
const root=process.cwd(),{default:nextEnv}=await import('@next/env');
nextEnv.loadEnvConfig(root,true,{info(){},error(){}});
const snapshot=JSON.parse(await readFile(path.join(root,'data/reports/pedagogy-audit-snapshot.json'),'utf8')).snapshot;
const original=snapshot.documents.find(d=>d.id==='216268ae-dbe2-4935-8b65-7e7c5dfbed87');
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llm','llmTelemetry','structuredSchema','pdf']);
await copyFile(path.join(env.workspace,'llm.mjs'),path.join(env.workspace,'providerLlm.mjs'));
await writeFile(path.join(env.workspace,'llm.mjs'),`export * from './providerLlm.mjs';import {structuredCompletion as complete} from './providerLlm.mjs';let calls=0,characters=0;export async function structuredCompletion(system,prompt,tool,...rest){characters+=system.length+prompt.length;if(++calls>6 || characters>160000)throw new Error('Evaluation budget reached; no further provider call.');console.log('Evaluation call '+calls+': '+tool);return complete(system,prompt,tool,...rest);}`);
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),llm=await env.load('llm'),{generateSlides}=await env.load('generateSlides');
const redact=text=>String(text).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]');
const report={version:(await env.load('contentQuality')).GENERATION_VERSION,model:llm.currentProviderLabel(),isolated:true,generatedAt:new Date().toISOString(),sourceTitle:original.title,page:8,sourceText:original.passages.filter(p=>p.page===8).map(p=>p.text).join('\n'),limits:{calls:6,inputCharacters:160000},limitations:'A single real primary slide with its reconstructed theme and images. Human source review is required; this is not a RemNote parity or 10/10 score.'};
try {
  const doc=db.insertDocument({title:original.title,kind:'course',pageCount:original.pageCount});
  db.insertPassages(original.passages.map((p,i)=>({documentId:doc.id,page:p.page,ordinal:i,text:p.text})));
  const bytes=Buffer.from(original.pdfBase64,'base64');storage.savePdfFile(doc.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const started=Date.now(),result=await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[8]});
  const graph=db.getGraph(true);
  report.elapsedMs=Date.now()-started;
  report.notes=graph.notions.filter(n=>n.layer!=='organizer').map(({label,definition,explanation,evidence})=>({label,definition,explanation,evidence}));
  report.cards=quality.getStudyCards();report.analysis=quality.pageAnalyses(doc.id).find(p=>p.page===8);
  report.warnings=result.warnings.map(redact);report.run=quality.exportQuality().generation_runs.find(r=>r.id===result.runId);
  console.log(JSON.stringify({elapsedMs:report.elapsedMs,notes:report.notes.length,readyCards:report.cards.filter(c=>c.status==='ready').length,status:report.analysis?.status,warnings:report.warnings}));
}catch(error){report.error=redact(error instanceof Error?error.message:error);console.log(report.error);}
finally {
  await writeFile(path.join(root,'data/reports/sections-live-evaluation.json'),redact(JSON.stringify(report,null,2)));
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();process.chdir(root);
}
