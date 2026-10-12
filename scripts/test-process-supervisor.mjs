import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {superviseProcess} from './process-supervisor.mjs';

await mkdir('.next',{recursive:true});
const directory=await mkdtemp(path.join(process.cwd(),'.next','supervisor-test-'));
const fixture=path.join(directory,'worker.mjs'),countFile=path.join(directory,'starts.txt');
await writeFile(fixture,`import fs from 'node:fs';const file=process.argv[2];const count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8'))+1:1;fs.writeFileSync(file,String(count));if(count===1)process.exit(17);setInterval(()=>{},1000);`);
const restarts=[];
const processHandle=superviseProcess(process.execPath,[fixture,countFile],{stdio:'ignore',minimumDelay:50,maximumDelay:100,onRestart:event=>restarts.push(event)});
try{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(await readFile(countFile,'utf8').catch(()=>'0')==='2')break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(await readFile(countFile,'utf8'),'2','A real crashed worker is restarted');
  assert.equal(restarts.length,1);assert.equal(restarts[0].code,17);
  const pid=processHandle.pid;assert(pid);process.kill(pid,0);
  await processHandle.close();assert.throws(()=>process.kill(pid,0));
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(await readFile(countFile,'utf8'),'2','Intentional shutdown never restarts the worker');
  console.log('PASS: actual worker crash/restart, independent child process, bounded backoff and shutdown without resurrection. No model calls.');
}finally{await processHandle.close();}
