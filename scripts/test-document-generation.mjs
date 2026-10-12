import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'documentGenerationClient'],{
  directCardGeneration:`export async function generateDirectCards(...args){return globalThis.__batch(...args);}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),courses=await env.load('courses'),scope=await env.load('courseScope'),jobs=await env.load('documentGeneration'),client=await env.load('documentGenerationClient');
let batches=[],scenario='success',failures=0,pauseNext=false,releasePause,paused;
globalThis.__batch=async(documentId,options)=>{
  batches.push({documentId,pages:options.pages,course:scope.scopedCourseId(),cardDetail:options.cardDetail});
  if(pauseNext){pauseNext=false;paused=true;await new Promise(resolve=>{releasePause=resolve;});}
  if(!quality.ownsClaim(documentId,options.claimId))return {notions:[],cardsCreated:0,warnings:['Generation canceled'],usage:{requests:0,inputTokens:0,outputTokens:0}};
  const warnings=[];
  for(const page of options.pages){
    const failed=scenario==='semantic'&&page===1 || scenario==='transport'&&page===1&&failures++===0 || scenario==='quota';
    const reason=!failed?'A source-based lesson.':scenario==='transport'?'OpenAI Connection error.':scenario==='quota'?'OpenAI request failed (429): billing quota exceeded.':'A source claim failed semantic verification.';
    quality.savePageAnalysis(documentId,{page,kind:'content',status:failed?'retry':'complete',reason,warnings:[],concepts:1,cards:1,updatedAt:new Date().toISOString(),version:'fixture'});
    if(failed)warnings.push(reason);else db.markPassagesGenerated(db.getPassagesForDocument(documentId).filter(p=>p.page===page).map(p=>p.id));
  }
  return {notions:[],cardsCreated:0,warnings,usage:{requests:2,inputTokens:120,outputTokens:80}};
};
const createDoc=count=>{const doc=db.insertDocument({title:'Generation lifecycle fixture',kind:'course',pageCount:count});db.insertPassages(Array.from({length:count},(_,i)=>({documentId:doc.id,page:i+1,ordinal:0,text:'An independently testable source mechanism with explicit conditions, sufficient context and a precise outcome that can be checked against its original source.'})));return doc;};
const options={mode:'strict',enrichment:false,cardDetail:'comprehensive'};
try {
  const doc=createDoc(7),job=jobs.startDocumentGeneration(doc.id,options);
  assert.equal(job.status,'running');assert.equal(jobs.startDocumentGeneration(doc.id,options).id,job.id,'Repeated start does not create duplicate paid jobs');
  await jobs.waitForDocumentGeneration(job.id);
  const done=jobs.getDocumentGeneration(doc.id);
  assert.equal(done.status,'complete');assert.equal(done.completedPages,7);assert.equal(done.requests,6);
  assert.equal(done.cardDetail,'comprehensive');assert(batches.every(b=>b.cardDetail==='comprehensive'),'Durable generation propagates card coverage to each worker batch');
  assert.deepEqual(batches.map(b=>b.pages),[[1],[2,3,4],[5,6,7]],'Server drains every batch without any browser continuation');
  assert(!quality.ownsClaim(doc.id,job.id));assert.equal(db.getUngeneratedPassages(doc.id).length,0);
  scenario='semantic';batches=[];const partial=createDoc(5),partialJob=jobs.startDocumentGeneration(partial.id,options);await jobs.waitForDocumentGeneration(partialJob.id);
  assert.equal(jobs.getDocumentGeneration(partial.id).status,'needs_review');assert.deepEqual(jobs.getDocumentGeneration(partial.id).reviewPages,[1]);
  assert.equal(batches.length,3,'A source rejection never blocks the remaining pages or causes an unlimited retry');
  scenario='success';batches=[];const resumed=jobs.startDocumentGeneration(partial.id,options);await jobs.waitForDocumentGeneration(resumed.id);
  assert.deepEqual(batches.map(b=>b.pages),[[1]],'Clicking retry processes the incomplete page rather than returning an empty batch');assert.equal(jobs.getDocumentGeneration(partial.id).completedPages,5);
  scenario='transport';failures=0;batches=[];const retryDoc=createDoc(5),retryJob=jobs.startDocumentGeneration(retryDoc.id,options);await jobs.waitForDocumentGeneration(retryJob.id);
  assert.equal(jobs.getDocumentGeneration(retryDoc.id).status,'complete');assert.deepEqual(batches.map(b=>b.pages),[[1],[2,3,4],[5],[1]],'Temporary failure is retried once after other pages');
  scenario='quota';batches=[];const quotaDoc=createDoc(5),quotaJob=jobs.startDocumentGeneration(quotaDoc.id,options);await jobs.waitForDocumentGeneration(quotaJob.id);
  assert.equal(jobs.getDocumentGeneration(quotaDoc.id).status,'failed');assert.equal(batches.length,1,'Billing failures stop calls immediately');
  scenario='success';batches=[];pauseNext=true;paused=false;const canceledDoc=createDoc(3),old=jobs.startDocumentGeneration(canceledDoc.id,options);
  while(!paused)await new Promise(resolve=>setImmediate(resolve));
  db.clearMapping();const replacement=jobs.startDocumentGeneration(canceledDoc.id,options);await jobs.waitForDocumentGeneration(replacement.id);
  releasePause();await jobs.waitForDocumentGeneration(old.id);
  assert.equal(jobs.getDocumentGeneration(canceledDoc.id).id,replacement.id,'Canceled work cannot overwrite a replacement job');assert.equal(jobs.getDocumentGeneration(canceledDoc.id).status,'complete');
  const other=courses.createCourse('Other isolated course');
  const otherJob=scope.withCourse(other.id,()=>jobs.startDocumentGeneration(createDoc(2).id,options));await jobs.waitForDocumentGeneration(otherJob.id);
  assert.equal(batches.at(-1).course,other.id);assert.equal(scope.withCourse(other.id,()=>jobs.getDocumentGeneration(otherJob.documentId)).status,'complete');assert.equal(jobs.getDocumentGeneration(otherJob.documentId),undefined);
  let polls=0,updates=[];
  const initial={...done,status:'running'},fetcher=async()=>{if(++polls===1)throw new Error('Temporary browser connection loss');return new Response(JSON.stringify({job:done}));};
  await client.watchDocumentGeneration(fetcher,initial,j=>updates.push(j.status),()=>false,0);
  assert.deepEqual(updates,['running','complete']);assert.equal(polls,2,'Progress polling tolerates a temporary browser error without restarting generation');
  let detached=false,pollAfterDetach=0;
  await client.watchDocumentGeneration(async()=>{pollAfterDetach++;throw new Error('Must not poll after leaving');},initial,()=>{detached=true;},()=>detached,0);
  assert.equal(pollAfterDetach,0);
  let posted;
  await client.requestDocumentGeneration(async(url,init)=>{posted=JSON.parse(init.body);return new Response(JSON.stringify({job:initial}),{status:202});},doc.id,options);
  assert.equal(posted.background,true);
  process.env.MORROW_GENERATION_CONCURRENCY='3';
  const originalBatch=globalThis.__batch;let active=0,peak=0;
  globalThis.__batch=async(...args)=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,20));return await originalBatch(...args);}finally{active--;}};
  batches=[];const parallelDoc=createDoc(6),parallelJob=jobs.startDocumentGeneration(parallelDoc.id,options);await jobs.waitForDocumentGeneration(parallelJob.id);
  assert.equal(peak,3,'Cloud concurrency is bounded to the configured worker count');
  assert(batches.every(b=>b.pages.length<=3),'Parallel workers publish checked batches of at most three pages');
  assert.equal(jobs.getDocumentGeneration(parallelDoc.id).status,'complete');
  delete process.env.MORROW_GENERATION_CONCURRENCY;
  process.env.MORROW_GENERATION_EXECUTION='worker';
  batches=[];const durable=createDoc(3),queued=jobs.startDocumentGeneration(durable.id,options);
  assert.equal(queued.awaitingWorker,true);assert.equal(batches.length,0,'Next.js only enqueues work in worker mode');
  assert.equal(jobs.getDocumentGeneration(durable.id).status,'running');
  assert.deepEqual(jobs.resumeDocumentGenerations(),[queued.id]);assert.deepEqual(jobs.resumeDocumentGenerations(),[]);
  await jobs.waitForDocumentGeneration(queued.id);assert.equal(jobs.getDocumentGeneration(durable.id).status,'complete');
  const interrupted=createDoc(3),oldWorker=jobs.startDocumentGeneration(interrupted.id,options);
  oldWorker.awaitingWorker=false;oldWorker.workerPid=2147483647;
  db.openDb().prepare('UPDATE generation_jobs SET payload=? WHERE document_id=?').run(JSON.stringify(oldWorker),interrupted.id);
  assert.deepEqual(jobs.resumeDocumentGenerations(),[oldWorker.id]);await jobs.waitForDocumentGeneration(oldWorker.id);
  assert.equal(jobs.getDocumentGeneration(interrupted.id).recoveries,1);assert.equal(jobs.getDocumentGeneration(interrupted.id).status,'complete');
  const reusedPid=createDoc(1),orphan=jobs.startDocumentGeneration(reusedPid.id,options);
  orphan.awaitingWorker=false;orphan.workerPid=process.pid;
  db.openDb().prepare('UPDATE generation_jobs SET payload=? WHERE document_id=?').run(JSON.stringify(orphan),reusedPid.id);
  assert.deepEqual(jobs.resumeDocumentGenerations(),[orphan.id],'An orphan with a reused current PID must not wait forever');
  await jobs.waitForDocumentGeneration(orphan.id);assert.equal(jobs.getDocumentGeneration(reusedPid.id).status,'complete');
  const cleared=createDoc(2);jobs.startDocumentGeneration(cleared.id,options);db.clearMapping();
  assert.deepEqual(jobs.resumeDocumentGenerations(),[]);assert.equal(jobs.getDocumentGeneration(cleared.id).status,'canceled','A worker must never resurrect explicitly cleared work');
  delete process.env.MORROW_GENERATION_EXECUTION;
  console.log('PASS: server drains all pages, duplicate starts, incomplete-page retry, bounded transport recovery, billing stop, clear/replacement race, course isolation, browser reconnection and detachment. No model calls.');
} finally {for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
