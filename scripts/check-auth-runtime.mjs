import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES),auth=await env.load('auth');
const owner=await auth.provisionUser('runtime-owner','Synthetic password for account owner',true);
await auth.provisionUser('runtime-guest','Synthetic password for account guest');
for(const db of globalThis.__authDbs.values())db.close();globalThis.__authDbs.clear();
const child=spawn(process.execPath,['scripts/start.mjs','--port','3004'],{env:{...process.env,MORROW_AUTH:'required'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
let output='';const children=[];child.on('message',message=>{if(message.pid)children.push(message.pid);});child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
const exited=new Promise(resolve=>child.once('exit',resolve));
const base='http://localhost:3004';
const login=async(name,password)=>{const response=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({name,password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');};
try{
  const deadline=Date.now()+20000;while(true){if(await fetch(base+'/api/auth').then(r=>r.ok).catch(()=>false))break;if(Date.now()>deadline)throw Error(output);await new Promise(r=>setTimeout(r,100));}
  assert.equal((await fetch(base+'/api/graph')).status,401);
  const page=await fetch(base+'/',{redirect:'manual'});assert.equal(page.status,307);assert(page.headers.get('location').endsWith('/login'));
  const ownerCookie=await login(owner.name,'Synthetic password for account owner'),guestCookie=await login('runtime-guest','Synthetic password for account guest');
  const ownerCourses=await(await fetch(base+'/api/courses',{headers:{Cookie:ownerCookie}})).json();
  const guestCourses=await(await fetch(base+'/api/courses',{headers:{Cookie:guestCookie}})).json();
  assert.equal(ownerCourses.courses[0].id,'default');assert.notEqual(guestCourses.courses[0].id,'default');
  assert.equal((await fetch(base+'/api/graph',{headers:{Cookie:guestCookie,'X-Course-Id':'default'}})).status,409);
  assert.equal((await fetch(base+'/study',{headers:{Cookie:guestCookie}})).status,200,'Authenticated server rendering resolves user workspace');
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{Cookie:guestCookie,'Content-Type':'application/json',Origin:'https://foreign.example'},body:'{"action":"logout"}'})).status,403);
  assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{Cookie:guestCookie,'Content-Type':'application/json',Origin:base},body:'{"action":"logout"}'})).status,200);
  assert.equal((await fetch(base+'/api/export',{headers:{Cookie:guestCookie}})).status,401);
  console.log('PASS: production proxy redirect, anonymous API denial, real sign-in cookies, independent account registries, server-rendered Study, cross-origin rejection and logout revocation. Synthetic accounts; no model calls.');
}finally{
  if(child.connected)child.send('shutdown');
  let timeout;await Promise.race([exited,new Promise(resolve=>{timeout=setTimeout(resolve,7000);})]);clearTimeout(timeout);
  if(child.exitCode===null){for(const pid of children)try{process.kill(pid,'SIGKILL');}catch{}child.kill('SIGKILL');}
}
