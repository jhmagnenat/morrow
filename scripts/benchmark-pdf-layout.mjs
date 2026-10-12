import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {getDocumentProxy,extractText} from 'unpdf';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const position=process.argv.indexOf('--pdf');if(position<0||!process.argv[position+1])throw Error('Usage: node scripts/benchmark-pdf-layout.mjs --pdf path/to/course.pdf');
const bytes=await readFile(path.resolve(process.argv[position+1])),env=await isolatedModules([...DATABASE_MODULES,'pdf']);
const pdf=await env.load('pdf'),samples={baseline:[],structured:[]};let count=0;
for(let i=0;i<4;i++){
  const start=performance.now(),document=await getDocumentProxy(new Uint8Array(bytes));let original;
  try{original=(await extractText(document,{mergePages:false})).text;}finally{await document.loadingTask.destroy();}
  samples.baseline.push(Math.round(performance.now()-start));
  const next=performance.now(),pages=await pdf.extractPdfPages(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));samples.structured.push(Math.round(performance.now()-next));count=pages.length;
  assert.deepEqual(pages.map(p=>p.text),original,'Structured extraction must preserve the original text');
  pages[0].text='Mutation must not change the shared cache';
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const report={pages:count,sourceTextUnchanged:true,samplesMs:samples,firstStructuredMs:samples.structured[0],warmMedianMs:{baseline:median(samples.baseline.slice(1)),structuredCached:median(samples.structured.slice(1))},noModelCalls:true,limitations:['Single machine and document; not a generation-AI benchmark.','First measurements are affected by parser warmup; do not infer a universal cold-start speedup.']};
await writeFile(path.join(env.root,'.next/pdf-extraction-comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
