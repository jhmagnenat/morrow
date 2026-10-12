import assert from 'node:assert/strict';
// Run ONLY against scripts/seed-offline-preview.mjs on a disposable server.
export async function checkOfflineStudy(command){
  const evaluate=async(expression)=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description);return result.result.value;};
  const waitFor=expression=>evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const check=async()=>{if(await (${expression}))resolve(true);else if(Date.now()>deadline)reject(Error('Offline check timed out: '+${JSON.stringify(expression)}));else setTimeout(check,100);};check();})`);
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.innerText.trim().startsWith(${JSON.stringify(label)}));if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click();})()`);
  const data=await evaluate(`fetch('/api/export').then(r=>r.json())`);
  assert.equal(data.documents[0]?.title,'Disposable offline integration fixture','Never write to a real course');
  const before=data.reviewLog.length;
  await waitFor(`(async()=>{if(!navigator.serviceWorker.controller)return false;const cache=await caches.open('morrow-study-v1');return (await cache.keys()).some(r=>r.url.includes('/__offline/default/study'));})()`);
  await click('Today');await waitFor(`document.body.innerText.includes('Card 1 /')`);
  // Read an outbox directly without relying on the implementation's exports.
  const pending=`new Promise((resolve,reject)=>{const open=indexedDB.open('morrow-offline-v1',2);open.onsuccess=()=>{const db=open.result,tx=db.transaction('reviews'),r=tx.objectStore('reviews').getAll();r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};open.onerror=()=>reject(open.error);})`;
  await command('Network.enable');
  await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await click('Reveal');await waitFor(`document.body.innerText.includes('Good')`);await click('Good');
  await waitFor(`document.body.innerText.includes('Card 2 /')`);
  assert.equal((await evaluate(pending)).length,1,'Offline success requires a committed durable review');
  await evaluate('window.testReloadMarker=true');await command('Page.reload');
  try{await waitFor(`!window.testReloadMarker&&document.body.innerText.includes('Card 2 /')`);}
  catch(error){throw Error(`${error.message}\nOffline document: ${await evaluate('document.body.innerText')}\nScripts: ${JSON.stringify(await evaluate('performance.getEntriesByType("resource").map(r=>({name:r.name,size:r.transferSize}))'))}`);}
  assert.equal((await evaluate(pending)).length,1,'Offline reload preserves the answer and session');
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await waitFor(`(async()=> (await (${pending})).length===0)()`);
  const after=await evaluate(`fetch('/api/export').then(r=>r.json())`);
  assert.equal(after.reviewLog.length,before+1,'Reconnection writes exactly one real review');
  await evaluate(`window.dispatchEvent(new Event('online'))`);await evaluate(`new Promise(r=>setTimeout(r,300))`);
  assert.equal(await evaluate(`fetch('/api/export').then(r=>r.json()).then(s=>s.reviewLog.length)`),before+1);
  console.log('PASS: actual server-disconnected review, committed IndexedDB outbox, offline full reload/session restoration and exactly-once automatic synchronization. Disposable course only.');
}
