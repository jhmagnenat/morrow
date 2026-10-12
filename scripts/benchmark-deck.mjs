import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const root=process.cwd(),index=process.argv.indexOf('--cards'),count=index<0?10000:Number(process.argv[index+1]);
if(!Number.isInteger(count)||count<100||count>50000)throw Error('--cards must be between 100 and 50000');
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb');
const report={mode:'synthetic-local-deck',cards:count,notions:count,node:process.version,measurements:{},note:'Disposable synthetic deck. These timings do not measure AI latency or competitor performance.'};
const measure=(name,fn)=>{const start=performance.now(),result=fn();report.measurements[name]=Math.round((performance.now()-start)*100)/100;return result;};
try{
  const document=db.insertDocument({title:'Deck benchmark',kind:'course',pageCount:1}),source='Area is width multiplied by height, holding the units fixed.';
  db.insertPassages([{documentId:document.id,page:1,ordinal:0,text:source}]);
  db.openDb().exec('BEGIN IMMEDIATE');
  measure('seedMs',()=>{for(let i=0;i<count;i++){
    db.insertNotion({id:`notion-${i}`,label:`Rectangle area ${i}`,domain:'Geometry',status:'validated',definition:source,sources:[{documentId:document.id,page:1}]});
    quality.saveStudyCard({id:`card-${i}`,cardType:'notion',notionId:`notion-${i}`,question:`What determines rectangle area in case ${i}?`,answer:source,example:'',kind:'definition',objective:`Rectangle ${i}`,status:'ready',evidence:[{documentId:document.id,page:1,quote:source}],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
  }});db.openDb().exec('COMMIT');
  const graph=measure('graphMs',()=>db.getGraph());assert.equal(graph.notions.length,count);assert(graph.notions.every(n=>n.cardCoverage.total===1));
  const due=measure('queueMs',()=>db.getDueNotions(100));assert.equal(due.length,20);
  measure('singleGradeMs',()=>db.gradeCard('notion','card-0','good'));
  measure('snapshotMs',()=>db.exportSnapshot());
  console.log(JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'.next',`deck-benchmark-${Date.now()}.json`),JSON.stringify(report,null,2));
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
