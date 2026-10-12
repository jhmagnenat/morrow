import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const root=process.cwd(),recordPath=flag('record'),documentId=flag('document'),courseId=flag('course');
if(!recordPath||!documentId||!courseId)throw Error('Required: --record=path --document=id --course=id; --apply publishes the explicit source inspection.');
const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
for(const img of record.images??[]){const imagePath=path.resolve(path.dirname(recordPath),img.file);if(createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')!==img.sha256)throw Error('Inspected image changed');}
const env=await isolatedModules([...DATABASE_MODULES,'inspectedGeneration']);process.env.MORROW_DATA_DIR=path.join(root,'data');
const scope=await env.load('courseScope'),repo=await env.load('generationRepository'),inspected=await env.load('inspectedGeneration');
scope.withCourse(courseId,()=>{
 const {source}=repo.readGenerationDocument(documentId);
 if(source.pdfSha256!==record.pdfSha256)throw Error('Original inspected PDF changed');
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({sourceMatches:true,facts:record.facts.length,pages:[...new Set(record.facts.map(f=>f.page))],providerCalls:0,apply:false}));return;}
 const result=inspected.publishInspectedGeneration(documentId,record);
 fs.writeFileSync(path.join(root,'references/evaluation/inspected-publication-latest.json'),JSON.stringify({recordPath,courseId,documentId,result},null,2));console.log(JSON.stringify(result));
});
