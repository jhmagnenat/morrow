import fs from 'node:fs';
import path from 'node:path';
import {isolatedModules} from './isolated-modules.mjs';
const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
async function run(){
  const env=await isolatedModules(['learningEvaluation']);const evaluation=await env.load('learningEvaluation');
  if(args[0]==='score'){
    const file=value('--file');if(!file)throw Error('--file is required');console.log(JSON.stringify(evaluation.scoreLearningEvaluation(JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))),null,2));return;
  }
  const url=new URL(value('--url')??'http://localhost:3000'),course=value('--course'),file=value('--file');
  if(args[0]!=='prepare'||!course||!file||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password)throw Error('Usage: node scripts/evaluate-learning.mjs prepare --course ID --file output.json [--url http://localhost:3000] or score --file reviewed.json');
  const response=await fetch(`${url.origin}/api/export`,{headers:{'X-Course-Id':course},redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Export failed: HTTP ${response.status}`);
  const report=evaluation.buildLearningEvaluation(await response.json(),course,Number(value('--limit')??30));
  fs.writeFileSync(path.resolve(file),JSON.stringify(report,null,2),{flag:'wx'});console.log(`Prepared ${report.cases.length} cases for independent human review. No quality score has been assigned.`);
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
