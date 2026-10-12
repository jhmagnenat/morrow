import fs from 'node:fs';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const root=process.cwd(),recordPath=flag('record'),documentId=flag('document'),courseId=flag('course'),page=Number(flag('page'));
if(!recordPath||!documentId||!courseId||!Number.isInteger(page)||page<1)throw Error('Required: --record=path --document=id --course=id --page=36; --apply publishes explicit coverage only');
const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
const env=await isolatedModules([...DATABASE_MODULES,'inspectedGeneration']);process.env.MORROW_DATA_DIR=path.join(root,'data');
const scope=await env.load('courseScope'),inspected=await env.load('inspectedGeneration');
scope.withCourse(courseId,()=>{
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({questions:record.questions.length,apply:false,providerCalls:0}));return;}
 const result=inspected.confirmInspectedQuestionCoverage(documentId,page,record);
 fs.writeFileSync(path.join(root,'references/evaluation/inspected-question-coverage-latest.json'),JSON.stringify({recordPath,courseId,documentId,result},null,2));console.log(JSON.stringify(result));
});
