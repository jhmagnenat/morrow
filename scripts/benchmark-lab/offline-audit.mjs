// Offline only: no provider, runner, SDK, experiment or output-generation entrypoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,hash,reusableModules,provenanceIssues,writeJson} from './core.mjs';
import {compileKnowledge,selectKnowledge,knowledgeSchema} from './methods.mjs';

globalThis.fetch=async()=>{throw Error('Network forbidden in offline audit');};
delete process.env.MORROW_OCR_BINARY; // Explicit text-only extraction; no external subprocess.
const directory=path.join(ROOT,'data','benchmark-lab','offline-audit');
await fs.mkdir(directory,{recursive:true});
const {pdf,schema}=await reusableModules();
const result={version:1,createdAt:new Date().toISOString(),scope:'Static code, local PDFs and predetermined knowledge only',apiCalls:0,generatedOutputs:0,sourceHashes:{},pdf:[],simulations:{}};
for(const file of ['core.mjs','methods.mjs','provider.mjs','runner.mjs','server.mjs','ui.html'])result.sourceHashes[file]=hash(await fs.readFile(path.join(import.meta.dirname,file)));
for(const file of ['pdf.ts','pdfLayout.ts','structuredSchema.ts'])result.sourceHashes[file]=hash(await fs.readFile(path.join(ROOT,'lib',file)));

function fixture(content){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let text='%PDF-1.4\n';const offsets=[0];
  for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const start=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
const line=(text,x,y)=>`BT /F1 12 Tf ${x} ${y} Td (${text}) Tj ET`;
const fixtures=[
  {id:'paragraph',content:[line('Pressure = 12 kPa; temperature = 25 C.',40,740),line('The rule applies only when volume is fixed.',40,710)].join('\n'),expected:['12 kPa','25 C','only when volume is fixed']},
  {id:'math',content:line('x\\262 = 4; x2 = 7; rate = 12%; a - b = 3.',40,740),expected:['x\u00b2 = 4','x2 = 7','12%','a - b = 3']},
  {id:'columns',content:[line('RIGHT TOP',330,740),line('RIGHT BOTTOM',330,710),line('LEFT TOP',40,740),line('LEFT BOTTOM',40,710)].join('\n'),expected:['LEFT TOP','LEFT BOTTOM','RIGHT TOP','RIGHT BOTTOM']},
  {id:'numeric-table',content:[line('Group A',40,740),line('12',240,740),line('25',400,740),line('Group B',40,710),line('13',240,710),line('26',400,710)].join('\n'),expected:['Group A','12','25','Group B','13','26']},
  {id:'text-table',content:[line('Animal',40,740),line('Mammal',240,740),line('Warm',400,740),line('Plant',40,710),line('Tree',240,710),line('Green',400,710)].join('\n'),expected:['Animal','Mammal','Warm','Plant','Tree','Green']},
  {id:'vector-diagram',content:'0 0 0 RG 2 w 40 650 180 80 re S 330 650 180 80 re S 220 690 m 330 690 l S',expected:[]},
];
for(const item of fixtures){
  const bytes=fixture(item.content);await fs.writeFile(path.join(directory,item.id+'.pdf'),bytes);
  const started=performance.now(),pages=await pdf.extractPdfPages(Uint8Array.from(bytes).buffer),elapsedMs=performance.now()-started;
  const page=pages[0],url=await pdf.renderPdfPageAsDataUrl(bytes,1);await fs.writeFile(path.join(directory,item.id+'.png'),Buffer.from(url.split(',')[1],'base64'));
  result.pdf.push({id:item.id,synthetic:true,sha256:hash(bytes),elapsedMs,text:page.text,expected:item.expected,preserved:item.expected.filter(s=>page.text.includes(s)),expectedOrderPreserved:item.expected.every((s,i)=>!i||page.text.indexOf(item.expected[i-1])<=page.text.indexOf(s)),layout:page.layout});
}
// Existing local document, never imported into MORROW or a benchmark experiment.
const local=path.join(ROOT,'data','recovery','default','blobs','438f0286f8310855dd51bcb0db76aafbea5c5551b8dcf160cbc0a5feeb4160af.pdf');
try{
  const bytes=await fs.readFile(local),start=performance.now(),pages=await pdf.extractPdfPages(Uint8Array.from(bytes).buffer);
  const extractionMs=performance.now()-start;
  const imagePages=[1,24,29].filter(n=>n<=pages.length);
  for(const number of imagePages){const url=await pdf.renderPdfPageAsDataUrl(bytes,number);await fs.writeFile(path.join(directory,`local-${number}.png`),Buffer.from(url.split(',')[1],'base64'));}
  result.localDocument={relativePath:path.relative(ROOT,local),sha256:hash(bytes),pages:pages.length,extractionMs,imagePages,perPage:pages.map(p=>({page:p.page,characters:p.text.length,blocks:p.layout.blocks.length,tables:p.layout.tableCandidates.length,visualReview:p.layout.requiresVisualReview,warnings:p.layout.warnings})),samples:pages.filter(p=>imagePages.includes(p.page))};
}catch(error){if(error.code!=='ENOENT')throw error;result.localDocument={available:false};}

const pages=[{page:1,text:'Pressure = 12 kPa. x\u00b2 = 4. Shared statement.'},{page:2,text:'Shared statement. Second page knowledge.'}];
const ref=(page=1,quote='Pressure = 12 kPa.')=>({page,quote,region:{x:0,y:0,width:1,height:1}});
const unit=(statement,sources=[ref()],extra={})=>({statement,kind:'fact',conditions:[],importance:3,sources,...extra});
const check=(name,value,expected)=>{assert.deepEqual(value,expected,name);result.simulations[name]={observed:value,expected};};
check('false_claim_with_real_quote_accepted',compileKnowledge([unit('Pressure = 900 kPa.')],pages).units.length,1);
check('superscript_quote_collision',provenanceIssues([ref(1,'x2 = 4')],pages),[]);
check('blank_region_accepted',provenanceIssues([ref(1,'')],[{page:1,text:''}]),[]);
check('short_quote_accepted',provenanceIssues([ref(1,'4')],pages),[]);
check('quote_ignores_invalid_region',provenanceIssues([{...ref(),region:{x:5,y:5,width:-1,height:-1}}],pages),[]);
const duplicate=compileKnowledge([unit('Shared statement.',[ref(1,'Shared statement.')],{importance:1}),unit('Shared statement.',[ref(2,'Shared statement.')],{importance:3,kind:'rule'})],pages);
check('duplicate_source_loss',duplicate.units[0].sources.map(s=>s.page),[1]);
check('duplicate_importance_loss',duplicate.units[0].importance,1);
check('duplicate_kind_loss',duplicate.units[0].kind,'fact');
check('condition_order_duplicates',compileKnowledge([unit('Scoped rule',undefined,{conditions:['a','b']}),unit('Scoped rule',undefined,{conditions:['b','a']})],pages).units.length,2);
check('empty_knowledge_schema_accepted',schema.findSchemaViolations({knowledge:[unit('',[])]},knowledgeSchema(pages)),[]);
check('compiler_rejects_empty_knowledge',compileKnowledge([unit('',[])],pages).units.length,0);
const preset=Array.from({length:18},(_,i)=>unit('Predetermined unit '+i,[i<10?ref():ref(2,'Second page knowledge.')],{importance:i<10?3:2,kind:['fact','comparison','rule'][i%3]}));
const ir=compileKnowledge(preset,pages),selection=selectKnowledge(ir,8);
check('selected_pages',Array.from(new Set(selection.groups.flatMap(g=>g.units.flatMap(u=>u.sources.map(s=>s.page))))),[1]);
result.simulations.selection={inputUnits:18,acceptedUnits:ir.units.length,selectedUnits:selection.selectedIds.length,omittedUnits:selection.omittedIds.length,groups:selection.groups.map(g=>({kind:g.kind,unitIds:g.units.map(u=>u.id)}))};
result.simulations.schedule={assumption:'10 seconds per hypothetical remote stage, no measured remote latency; no stages executed',batches:19,A:{plannedCalls:19,serialSeconds:190},B:{plannedCalls:38,serialSeconds:380},C:{minimumPlannedCalls:19,maximumPlannedCalls:76,threeGroupSerialSeconds:760,threeGroupParallelSeconds:380},firstOutputStageSeconds:{A:10,B:20,C:20},note:'C with zero groups has no output stage. Parallel C figures overlap groups only, not batches. All counts assume successful stages and 38 pages, 2 pages per batch.'};
await writeJson(path.join(directory,'results.json'),result);
await writeJson(path.join(directory,'history',result.createdAt.replace(/[:.]/g,'-')+'.json'),result);
console.log(JSON.stringify({report:path.join(directory,'results.json'),apiCalls:0,generatedOutputs:0,pdfFixtures:result.pdf.map(p=>({id:p.id,preserved:p.preserved.length,expected:p.expected.length,order:p.expectedOrderPreserved,tables:p.layout.tableCandidates.length})),localPages:result.localDocument.pages,checks:Object.keys(result.simulations).length},null,2));
