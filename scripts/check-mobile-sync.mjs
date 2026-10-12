import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {checkOfflineStudy} from './check-offline-study.mjs';

// Run against the disposable fixture server on 3006 and a dedicated Chrome
// debugging profile. Disconnect a real proxy: worker fetches must also fail.
const proxy=http.createServer((request,response)=>{
  // Both origins are disposable local test servers. Adapt the origin at the
  // transport boundary; product origin/authentication guards stay enabled.
  const headers={...request.headers,host:'localhost:3006',...(request.headers.origin?{origin:'http://localhost:3006'}:{})};
  const upstream=http.request({hostname:'127.0.0.1',port:3006,path:request.url,method:request.method,headers},reply=>{
    response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);
  });
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(503);response.end();});request.pipe(upstream);
});
const connections=new Set();
proxy.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
proxy.on('upgrade',(request,socket,head)=>{
  const upstream=http.request({hostname:'127.0.0.1',port:3006,path:request.url,headers:{...request.headers,host:'localhost:3005'}});
  upstream.on('upgrade',(reply,remote,remoteHead)=>{
    socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(reply.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')+'\r\n\r\n');
    if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);socket.pipe(remote).pipe(socket);socket.on('close',()=>remote.destroy());remote.on('error',()=>socket.destroy());
  });upstream.on('error',()=>socket.destroy());upstream.end();
});
const listen=()=>new Promise(resolve=>proxy.listen(3005,resolve));
const disconnect=()=>new Promise(resolve=>{proxy.close(resolve);proxy.closeAllConnections();for(const socket of connections)socket.destroy();});
await listen();
const fixture=await(await fetch('http://localhost:3005/api/export')).json();
assert.equal(fixture.documents[0]?.title,'Disposable offline integration fixture');
const target=await(await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map(),errors=[];
socket.addEventListener('message',({data})=>{const message=JSON.parse(data),wait=pending.get(message.id);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);if(wait){pending.delete(message.id);clearTimeout(wait.timer);if(message.error)wait.reject(Error(message.error.message));else wait.resolve(message.result);}});
async function command(method,params={}){
  if(method==='Network.emulateNetworkConditions'){
    if(params.offline)await disconnect();else if(!proxy.listening)await listen();
  }
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
}
const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value;};
try{
  await command('Page.enable');await command('Runtime.enable');
  await command('Storage.clearDataForOrigin',{origin:'http://localhost:3005',storageTypes:'all'});
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await command('Page.navigate',{url:'http://localhost:3005/study'});
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+20000;const tick=()=>{if(document.body?.innerText.includes('Today'))resolve();else if(Date.now()>end)reject(Error('Study did not load'));else setTimeout(tick,100);};tick();})`);
  const manifest=await(await fetch('http://localhost:3005/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/study');
  for(const icon of manifest.icons)assert.equal((await fetch('http://localhost:3005'+icon.src)).status,200);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'Mobile study has no horizontal page overflow');
  await checkOfflineStudy(command);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('Tools')).click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText==='Prepare course offline').click()`);
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const tick=()=>{if(document.body.innerText.includes('Course pages and review queues prepared offline'))resolve();else if(Date.now()>end)reject(Error('Offline preparation did not complete: '+document.body.innerText));else setTimeout(tick,100);};tick();})`);
  await evaluate(`document.querySelector('button[aria-label="Close tools"]').click()`);
  // Another device grades a due card directly at the server. Foreground
  // inventory refresh removes it without reloading or altering local answers.
  const before=await(await fetch('http://localhost:3005/api/offline')).json();
  const card=Object.entries(before.reviews).find(([key,value])=>key.startsWith('notion:')&&(!value.dueAt||Date.parse(value.dueAt)<=Date.now()));assert(card);
  const id=card[0].slice('notion:'.length);
  const first=await fetch('http://localhost:3005/api/offline');const etag=first.headers.get('ETag');assert(etag);
  assert.equal((await fetch('http://localhost:3005/api/offline',{headers:{'If-None-Match':etag}})).status,304);
  const grade=await fetch(`http://localhost:3005/api/review/notion/${id}/grade`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grade:'easy',requestId:crypto.randomUUID()})});assert.equal(grade.status,200);
  const changed=await fetch('http://localhost:3005/api/offline',{headers:{'If-None-Match':etag}});assert.equal(changed.status,200);assert.notEqual(changed.headers.get('ETag'),etag);
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const key=${JSON.stringify(card[0])};const tick=()=>{const entries=Object.keys(localStorage).filter(k=>k.includes('default')&&k.includes('today'));if(entries.some(k=>{const q=JSON.parse(localStorage.getItem(k));return q.cards&&!q.cards.slice(q.index).some(c=>(c.kind+':'+c.cardId)===key);}))resolve();else if(Date.now()>end)reject(Error('Remote review still appears in queue'));else setTimeout(tick,100);};tick();})`);
  // Replay from the service worker, independently of window.fetch.
  const pure=(await readFile('scripts/check-offline-chains.mjs','utf8'));
  assert(pure.includes('testOffline'),'Existing harness retains real FSRS and IndexedDB coverage');
  await evaluate(`(async()=>{const registration=await navigator.serviceWorker.ready;window.__originalSync=globalThis.SyncManager?.prototype.register;if(window.__originalSync)SyncManager.prototype.register=async()=>{};})()`);
  const {checkOfflineChains}=await import('./check-offline-chains.mjs');
  // The chain harness uses window fetch failures to test lost acknowledgements.
  await checkOfflineChains(command);
  const inventory=await(await fetch('http://localhost:3005/api/offline')).json();
  const workerCard=Object.entries(inventory.reviews).find(([key,value])=>key.startsWith('notion:')&&(!value.dueAt||Date.parse(value.dueAt)<=Date.now()));assert(workerCard);
  const workerId=workerCard[0].slice('notion:'.length),beforeWorker=(await(await fetch('http://localhost:3005/api/export')).json()).reviewLog.length;
  await evaluate(`testOffline.refreshOfflineSnapshot('default')`);
  const queued=await evaluate(`(async()=>{const original=window.fetch;try{window.fetch=(...args)=>String(args[0]).endsWith('/grade')?Promise.reject(Error('foreground disconnected')):original(...args);const response=await testOffline.submitDurableReview('default','notion',${JSON.stringify(workerId)},'easy');return {status:response.status,pending:(await testOffline.offlineReviews()).length};}finally{window.fetch=original;}})()`);
  assert.equal(queued.status,200);assert.equal(queued.pending,1);
  await evaluate(`navigator.serviceWorker.controller.postMessage({type:'sync-reviews'})`);
  await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const tick=async()=>{if(!(await testOffline.offlineReviews()).length)resolve();else if(Date.now()>end)reject(Error('Worker did not replay the durable review'));else setTimeout(tick,100);};tick();})`);
  assert.equal((await(await fetch('http://localhost:3005/api/export')).json()).reviewLog.length,beforeWorker+1,'The worker independently delivers a queued review');
  await evaluate(`if(window.__originalSync)SyncManager.prototype.register=window.__originalSync`);
  const logs=await(await fetch('http://localhost:3005/api/export')).json();
  await evaluate(`navigator.serviceWorker.controller.postMessage({type:'sync-reviews'})`);
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal((await(await fetch('http://localhost:3005/api/export')).json()).reviewLog.length,logs.reviewLog.length,'Worker replay of acknowledged outbox does not duplicate reviews');
  console.log('PASS: mobile PWA/icons/layout, actual network loss including workers, offline reload, durable replay, conditional inventory, remote-device queue refresh and service-worker receipt idempotency. Disposable data only.');
}catch(error){
  console.error(JSON.stringify({errors,diagnostic:await evaluate(`(async()=>({text:document.body.innerText,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,size:r.transferSize})),controlled:!!navigator.serviceWorker.controller,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state})),cacheKeys:await caches.keys()}))()`).catch(()=>null)},null,2));throw error;
}finally{
  if(!proxy.listening)await listen();
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
  await fetch(`http://127.0.0.1:9222/json/close/${target.id}`).catch(()=>{});socket.close();await disconnect();
}
