import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Real IndexedDB, real FSRS and server receipts; the fixture is disposable.
export async function checkOfflineChains(command){
  const evaluate=async expression=>{
    const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
    return r.result.value;
  };
  const before=await evaluate("fetch('/api/export').then(r=>r.json())");
  assert.equal(before.documents[0]?.title,'Disposable offline integration fixture');
  const modules={};
  for(const name of ['fsrs','srs','xpEvent','offlineStudy']){
    let source=ts.transpileModule(await readFile(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    for(const [dependency,url]of Object.entries(modules))source=source.replaceAll(`@/lib/${dependency}`,url);
    modules[name]='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  }
  await evaluate(`import(${JSON.stringify(modules.offlineStudy)}).then(m=>{window.testOffline=m;})`);
  await evaluate("testOffline.refreshOfflineSnapshot('default')");
  const result=await evaluate(`(async()=>{
    const RealDate=Date,originalFetch=window.fetch,base=RealDate.now()-2*3600000;
    let now=base;
    class FixtureDate extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
    try{
      window.Date=FixtureDate;
      window.fetch=(...args)=>String(args[0]).endsWith('/grade')?Promise.reject(Error('fixture disconnected')):originalFetch(...args);
      const first=await testOffline.submitDurableReview('default','notion','offline-card-4','again');
      now+=61000;
      const second=await testOffline.submitDurableReview('default','notion','offline-card-4','good');
      return {firstStatus:first.status,first:await first.json(),secondStatus:second.status,second:await second.json(),pending:await testOffline.offlineReviews()};
    }finally{window.Date=RealDate;window.fetch=originalFetch;}
  })()`);
  assert.equal(result.firstStatus,200);assert.equal(result.secondStatus,200);
  assert.equal(result.first.pending,true);assert.equal(result.second.pending,true);
  assert.equal(result.pending.length,2);
  const ordered=result.pending.sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt));
  assert.equal(ordered[1].previousRequestId,ordered[0].id,'Local schedule and outbox are committed together');
  await evaluate("testOffline.refreshOfflineSnapshot('default')");
  const outbox=await evaluate('testOffline.offlineReviews()');assert.equal(outbox.length,2,'Refresh preserves unsent reviews');
  // The server commits, but the network loses the acknowledgement. A later
  // retry must deliver the identical receipt before replaying the child.
  await evaluate(`(async()=>{
    const original=window.fetch;let lost=false;
    window.fetch=async(...args)=>{const r=await original(...args);if(!lost&&String(args[0]).endsWith('/grade')){lost=true;throw Error('fixture acknowledgement lost');}return r;};
    try{await testOffline.flushOfflineReviews();}finally{window.fetch=original;}
  })()`);
  assert.equal((await evaluate('testOffline.offlineReviews()')).length,2);
  assert.equal(await evaluate("fetch('/api/export').then(r=>r.json()).then(s=>s.reviewLog.length)"),before.reviewLog.length+1);
  await evaluate('testOffline.flushOfflineReviews()');assert.equal((await evaluate('testOffline.offlineReviews()')).length,0);
  const after=await evaluate("fetch('/api/export').then(r=>r.json())");
  assert.equal(after.reviewLog.length,before.reviewLog.length+2);
  const logs=after.reviewLog.filter(r=>r.cardId==='offline-card-4');
  assert.equal(logs.length,2);assert.deepEqual(logs.map(r=>r.reviewedAt).sort(),ordered.map(r=>r.reviewedAt));
  await evaluate('testOffline.flushOfflineReviews()');
  assert.equal(await evaluate("fetch('/api/export').then(r=>r.json()).then(s=>s.reviewLog.length)"),before.reviewLog.length+2);
  const temporary=await evaluate(`(async()=>{
    const original=window.fetch;
    window.fetch=(...args)=>String(args[0]).endsWith('/grade')?Promise.resolve(Response.json({error:'temporary outage'},{status:503})):original(...args);
    try{const response=await testOffline.submitDurableReview('default','notion','offline-card-3','good');return {status:response.status,body:await response.json(),pending:await testOffline.offlineReviews()};}
    finally{window.fetch=original;}
  })()`);
  assert.equal(temporary.status,200);assert.equal(temporary.body.pending,true);
  assert.equal(temporary.pending.length,1,'A temporary outage is durable pending success, not an unretryable failed card');
  await evaluate('testOffline.flushOfflineReviews()');assert.equal((await evaluate('testOffline.offlineReviews()')).length,0);
  assert.equal(await evaluate("fetch('/api/export').then(r=>r.json()).then(s=>s.reviewLog.length)"),before.reviewLog.length+3);
  console.log('PASS: two spaced offline reviews on one card, atomic optimistic schedule, refresh preservation, lost acknowledgement, ordered replay and exactly-once real server writes. Disposable fixture.');
}
