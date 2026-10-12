import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const root=process.cwd(),args=process.argv.slice(2),fileIndex=args.indexOf('--pdf');
if(fileIndex<0||!args[fileIndex+1])throw Error('Usage: node scripts/benchmark-generation.mjs --pdf "path/to/course.pdf" [--live]. Without --live, no AI calls occur.');
const file=path.resolve(args[fileIndex+1]),live=args.includes('--live');
const pageIndex=args.indexOf('--pages'),selected=pageIndex<0?undefined:args[pageIndex+1]?.split(',').map(Number);
if(selected&&(!selected.length||selected.some(p=>!Number.isInteger(p)||p<1)))throw Error('--pages requires comma-separated positive slide numbers');
if(live){try{process.loadEnvFile(path.join(root,'.env.local'));}catch(error){if(error.code!=='ENOENT')throw error;}}
process.env.MORROW_GENERATION_PIPELINE='progressive';
const bytes=await readFile(file),started=performance.now();
const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','generateSlides','llm','llmTelemetry','structuredSchema','pdf']);
process.chdir(env.workspace);
const pdf=await env.load('pdf'),planner=await env.load('sectionPlanning');
const extractionStarted=performance.now();
const pages=await pdf.extractPdfPages(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
if(selected?.some(p=>p>pages.length))throw Error('Selected slide exceeds the PDF page count');
const extractionMs=Math.round(performance.now()-extractionStarted),sections=planner.planLearningSections(selected??pages.map(p=>p.page),pages,new Set(pages.filter(p=>p.layout?.requiresVisualReview).map(p=>p.page)));
const report={mode:live?'live':'plan-only',pages:pages.length,extractionMs,textSections:sections.filter(s=>s.kind==='text').length,textSlides:sections.filter(s=>s.kind==='text').flatMap(s=>s.pages).length,visualFallbackSlides:sections.filter(s=>s.kind==='visual').flatMap(s=>s.pages).length,excludedSlides:sections.filter(s=>s.kind==='excluded').flatMap(s=>s.pages).length,minimumTextCalls:sections.filter(s=>s.kind==='text').length*2,sections:sections.map(s=>({pages:s.pages,kind:s.kind})),firstSectionPages:sections.find(s=>s.kind==='text')?.pages??[]};
if(live){
  const db=await env.load('db'),storage=await env.load('pdfStorage'),jobs=await env.load('documentGeneration'),quality=await env.load('qualityDb');
  const doc=db.insertDocument({title:'Generation benchmark',kind:'course',pageCount:pages.length});
  storage.savePdfFile(doc.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  db.insertPassages(pdf.chunkPagesIntoPassages(pages).map(p=>({...p,documentId:doc.id})));
  db.openDb().prepare('INSERT INTO quality_settings(key,value) VALUES(?,?)').run(`pdf-layout:${doc.id}`,JSON.stringify(pages.map(p=>({page:p.page,layout:p.layout}))));
  const job=jobs.startDocumentGeneration(doc.id,{mode:'strict',enrichment:false,pages:selected});await jobs.waitForDocumentGeneration(job.id);
  const done=jobs.getDocumentGeneration(doc.id),cards=quality.getStudyCards();
  Object.assign(report,{status:done.status,firstReadyMs:done.firstReadyMs??null,generationMs:done.elapsedMs??null,requests:done.requests,inputTokens:done.inputTokens,outputTokens:done.outputTokens,concepts:db.getGraph().notions.filter(n=>n.layer!=='organizer').length,readyCards:cards.filter(c=>c.status==='ready').length,draftCards:cards.filter(c=>c.status==='draft').length,completedPages:done.completedPages,reviewPages:done.reviewPages,warningCount:done.warnings.length,warnings:done.warnings,firstReadyWithin30s:done.firstReadyMs!=null&&cards.some(c=>c.status==='ready')?done.firstReadyMs<=30000:null,completeWithin30s:done.status==='complete'&&cards.some(c=>c.status==='ready')?(done.elapsedMs??Infinity)<=30000:null});
  for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
}
report.totalMs=Math.round(performance.now()-started);
const output=path.join(root,'.next',`generation-benchmark-${Date.now()}.json`);await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));console.log(`Report: ${output}`);
