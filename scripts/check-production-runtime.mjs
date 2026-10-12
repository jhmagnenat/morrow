import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';

// Requires a production build and seed-offline-preview.mjs. No AI job is queued.
const {dataDirectory}=JSON.parse(await readFile('.next/offline-preview.json','utf8'));
const child=spawn(process.execPath,['scripts/start.mjs','--port','3003'],{
  env:{...process.env,MORROW_DATA_DIR:dataDirectory,MORROW_GENERATION_EXECUTION:'worker'},
  stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,
});
const workers=[],servers=[];let output='';
child.on('message',message=>{if(message.type==='worker')workers.push(message.pid);if(message.type==='server')servers.push(message.pid);});
child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
const exited=new Promise(resolve=>child.once('exit',code=>resolve(code)));
const waitFor=async predicate=>{
  const end=Date.now()+20000;
  while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}
  throw Error(`Production runtime condition timed out\n${output}`);
};
const url='http://localhost:3003/api/export';
try{
  await waitFor(async()=>workers.length===1&&servers.length===1&&await fetch(url).then(r=>r.ok).catch(()=>false));
  const before=await(await fetch(url)).json();assert.equal(before.documents[0]?.title,'Disposable offline integration fixture');
  const initial=workers[0];process.kill(initial,'SIGKILL');
  await waitFor(()=>workers.length===2);assert.notEqual(workers[1],initial);
  process.kill(servers[0],0);assert.equal((await fetch(url)).status,200,'HTTP survives a real generation-worker crash');
  assert.equal((await(await fetch(url)).json()).reviewLog.length,before.reviewLog.length,'Runtime restart does not grade fixture cards');
  child.send('shutdown');assert.equal(await exited,0);
  for(const pid of [servers[0],workers[1]])assert.throws(()=>process.kill(pid,0),'Graceful parent shutdown leaves no child running');
  console.log('PASS: production CLI launches server and worker, actual worker crash/restart, HTTP continuity, unchanged data and complete child shutdown. Disposable data; no model calls.');
}finally{
  if(child.connected)child.send('shutdown');
  let timeout;
  await Promise.race([exited,new Promise(resolve=>{timeout=setTimeout(resolve,7000);})]);clearTimeout(timeout);
  if(child.exitCode===null){
    for(const pid of [workers.at(-1),servers.at(-1)].filter(Boolean))try{process.kill(pid,'SIGKILL');}catch{}
    child.kill('SIGKILL');
  }
}
