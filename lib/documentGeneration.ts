import {randomUUID} from 'node:crypto';
import {getUngeneratedPassages,openDb} from '@/lib/db';
import {claimDocument,ownsClaim,renewClaim,releaseClaim,pageAnalyses,ensureDocumentPages,getDocumentStudyCards,retryPages} from '@/lib/qualityDb';
import {createRecoveryPoint} from '@/lib/recovery';
import {generationLocks} from '@/lib/generationLocks';
import {generateConfiguredSection} from '@/lib/generationDispatch';
import {scopedCourseId,withCourse} from '@/lib/courseScope';
import type {GenerationMode,CardDetail} from '@/lib/types';
import {generationConcurrency} from '@/lib/generationPolicy';
import {planSourceBatches} from '@/lib/sourceSections';
import {findGenerationDocument,readGenerationDocument} from '@/lib/generationRepository';
import {withGenerationBudget} from '@/lib/llmTelemetry';
import {estimatedGenerationCost} from '@/lib/generationLimits';

export interface DocumentGenerationJob {
  id:string;documentId:string;courseId:string;workerPid:number;
  status:'running'|'complete'|'needs_review'|'failed'|'canceled'|'interrupted';
  mode:GenerationMode;enrichment:boolean;cardDetail?:CardDetail;pages?:number[];
  startedAt:string;updatedAt:string;totalPages:number;attemptedPages:number[];
  completedPages:number;reviewPages:number[];notionsCreated:number;cardsCreated:number;
  requests:number;inputTokens:number;outputTokens:number;warnings:string[];error?:string;
  estimatedCostUsd?:number|null;
  activeStages?:Record<string,string>;elapsedMs?:number;firstReadyAt?:string;concurrency?:number;
  firstReadyMs?:number;readyCards?:number;sectionsCompleted?:number;sectionCount?:number;pipeline?:'teacher'|'direct'|'progressive'|'page';
  processedPages?:number;draftCards?:number;coveredPages?:number;skippedPages?:number;
  execution?:'inline'|'worker';awaitingWorker?:boolean;recoveries?:number;
}
declare global {var __documentGenerationTasks:Map<string,Promise<void>>|undefined;}
const tasks=()=>globalThis.__documentGenerationTasks??=new Map<string,Promise<void>>();
const save=(job:DocumentGenerationJob,replace=false)=>{
  job.updatedAt=new Date().toISOString();
  openDb().prepare('INSERT INTO generation_jobs VALUES(?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET run_id=excluded.run_id,status=excluded.status,payload=excluded.payload WHERE generation_jobs.run_id=excluded.run_id OR ?=1').run(job.documentId,job.id,job.status,JSON.stringify(job),Number(replace));
};
function workerAlive(pid:number){try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}}
export function getDocumentGeneration(documentId:string):DocumentGenerationJob|undefined {
  const row=openDb().prepare('SELECT payload FROM generation_jobs WHERE document_id=?').get(documentId);
  if(!row)return;
  const job=JSON.parse(String(row.payload)) as DocumentGenerationJob;
  if(job.status==='running' && (!ownsClaim(documentId,job.id) || !job.awaitingWorker && !tasks().has(job.id) && (job.workerPid===process.pid || !workerAlive(job.workerPid)))){
    // A durable worker owns restart recovery. Polling must not cancel its
    // queued work merely because the old process no longer exists.
    if(job.execution==='worker'&&ownsClaim(documentId,job.id))return job;
    job.status=ownsClaim(documentId,job.id)?'interrupted':'canceled';
    job.error=job.status==='interrupted'?'The server stopped. Starting generation again resumes the saved pages.':'Generation canceled because the course data changed.';
    releaseClaim(documentId,job.id);save(job);
  }
  return job;
}

export function startDocumentGeneration(documentId:string,options:{mode:GenerationMode;enrichment:boolean;cardDetail?:CardDetail;pages?:number[];reprocess?:boolean}) {
  const document=findGenerationDocument(documentId);
  if(!document)throw new Error('Document not found in this course');
  ensureDocumentPages(documentId,document.pageCount??0);
  const existing=getDocumentGeneration(documentId);
  if(existing?.status==='running')return existing;
  const courseId=scopedCourseId(),id=randomUUID(),lock=`${courseId}:${documentId}`;
  if(generationLocks().has(lock) && !openDb().prepare('SELECT 1 FROM generation_claims WHERE document_id=? AND expires_at>?').get(documentId,new Date().toISOString()))generationLocks().delete(lock);
  if(generationLocks().has(lock) || !claimDocument(documentId,id))throw new Error('Generation already running');
  generationLocks().add(lock);
  if(options.reprocess){
    try{
      createRecoveryPoint('before-card-regeneration');
      const pages=options.pages??openDb().prepare('SELECT DISTINCT page FROM passages WHERE document_id=? ORDER BY page').all(documentId).map(r=>Number(r.page));
      retryPages(documentId,pages);
    }catch(error){releaseClaim(documentId,id);generationLocks().delete(lock);throw error;}
  }
  const pending=[...new Set(getUngeneratedPassages(documentId).map(p=>p.page))].filter(p=>!options.pages || options.pages.includes(p)).sort((a,b)=>a-b);
  const selected=options.pages??[...new Set(openDb().prepare('SELECT page FROM passages WHERE document_id=?').all(documentId).map(r=>Number(r.page)))];
  const job:DocumentGenerationJob={id,documentId,courseId,workerPid:process.pid,status:'running',...options,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),totalPages:selected.length,attemptedPages:[],completedPages:0,reviewPages:[],notionsCreated:0,cardsCreated:0,requests:0,inputTokens:0,outputTokens:0,warnings:[]};
  job.execution=process.env.MORROW_GENERATION_EXECUTION==='worker'?'worker':'inline';
  if(job.execution==='worker'){job.awaitingWorker=true;job.workerPid=0;}
  save(job,true);
  if(job.awaitingWorker){generationLocks().delete(lock);return job;}
  launch(job,pending,selected);
  return job;
}

function launch(job:DocumentGenerationJob,pending:number[],selected:number[]){
  const {courseId,documentId,id}=job,lock=`${courseId}:${documentId}`;
  // Work belongs to the server, not to a mounted browser tab or an HTTP
  // request. The durable record and per-page commits make polling/reload safe.
  const task=new Promise<void>(resolve=>setImmediate(resolve)).then(()=>withCourse(courseId,()=>withGenerationBudget(job,()=>run(job,pending,selected)))).catch(error=>withCourse(courseId,()=>{
    if(Boolean(findGenerationDocument(documentId))){job.status='failed';job.error=error instanceof Error?error.message:'Generation failed';save(job);}
  })).finally(()=>withCourse(courseId,()=>{releaseClaim(documentId,id);generationLocks().delete(lock);tasks().delete(id);}));
  tasks().set(id,task);
}

// Called by an independent supervised process, not by an HTTP request.
// Adoption is serialized under SQLite's write lock. Missing/replaced claims
// mean an explicit clear/reset and must never resurrect canceled content.
export function resumeDocumentGenerations(limit=1):string[]{
  const db=openDb(),resumed:string[]=[];
  const rows=db.prepare("SELECT payload FROM generation_jobs WHERE status='running'").all();
  for(const row of rows){
    if(resumed.length>=limit)break;
    const job=JSON.parse(String(row.payload)) as DocumentGenerationJob;
    if(job.status!=='running'||job.execution!=='worker'||tasks().has(job.id))continue;
    if(!job.awaitingWorker&&job.workerPid!==process.pid&&workerAlive(job.workerPid))continue;
    db.exec('BEGIN IMMEDIATE');
    try{
      const current=JSON.parse(String(db.prepare('SELECT payload FROM generation_jobs WHERE document_id=?').get(job.documentId)!.payload)) as DocumentGenerationJob;
      if(current.id!==job.id||current.status!=='running'||!current.awaitingWorker&&current.workerPid!==process.pid&&workerAlive(current.workerPid)) {db.exec('COMMIT');continue;}
      if(!ownsClaim(job.documentId,job.id)||!Boolean(findGenerationDocument(job.documentId))){
        job.status='canceled';job.error='Course data changed before the worker resumed';save(job);db.exec('COMMIT');continue;
      }
      renewClaim(job.documentId,job.id);
      job.recoveries=(job.recoveries??0)+(job.awaitingWorker?0:1);
      job.awaitingWorker=false;job.workerPid=process.pid;save(job);db.exec('COMMIT');
      const pending=[...new Set(getUngeneratedPassages(job.documentId).map(p=>p.page))].filter(p=>!job.pages||job.pages.includes(p)).sort((a,b)=>a-b);
      const selected=job.pages??db.prepare('SELECT DISTINCT page FROM passages WHERE document_id=? ORDER BY page').all(job.documentId).map(p=>Number(p.page));
      generationLocks().add(`${job.courseId}:${job.documentId}`);launch(job,pending,selected);resumed.push(job.id);
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }
  return resumed;
}

function refreshCounts(job:DocumentGenerationJob,selected:number[]) {
  const cards=getDocumentStudyCards(job.documentId,selected);
  job.readyCards=cards.filter(c=>c.status==='ready').length;
  job.draftCards=cards.filter(c=>c.status==='draft').length;
  const analyses=pageAnalyses(job.documentId).filter(p=>selected.includes(p.page));
  job.coveredPages=analyses.filter(p=>p.status==='complete').length;
  job.skippedPages=analyses.filter(p=>p.status==='skipped').length;
  job.completedPages=analyses.filter(p=>p.status==='complete'||p.status==='skipped').length;
  job.processedPages=analyses.filter(p=>p.generationComplete||p.status==='complete'||p.status==='skipped').length;
  job.reviewPages=analyses.filter(p=>p.status==='retry').map(p=>p.page);
}
const transient=(reason:string)=>/connection error|timed? ?out|timeout|temporar|rate limit|request failed \((?:408|500|502|503|504)\)/i.test(reason) && !/\bquota\b|\bbilling\b|invalid.*key|unauthoriz/i.test(reason);
const fatal=(reason:string)=>/\bquota\b|\bbilling\b|no credits remaining|insufficient[_ ](?:quota|credits)|credit balance|invalid.*key|unauthoriz|request failed \((?:401|403)\)/i.test(reason);
async function run(job:DocumentGenerationJob,pending:number[],selected:number[]) {
  const heartbeat=setInterval(()=>withCourse(job.courseId,()=>renewClaim(job.documentId,job.id)),60_000);heartbeat.unref();
  try {
    const processPages=async(pages:number[])=>{
      if(!ownsClaim(job.documentId,job.id) || !Boolean(findGenerationDocument(job.documentId))){job.status='canceled';return false;}
      const result=await generateConfiguredSection(job.documentId,{mode:job.mode,enrichment:job.enrichment,cardDetail:job.cardDetail,pages,skipRetried:false,claimId:job.id,onProgress:(page,stage)=>{
        if(!ownsClaim(job.documentId,job.id))return;
        job.activeStages={...job.activeStages,[page]:stage};job.elapsedMs=Date.now()-Date.parse(job.startedAt);save(job);
      }});
      if(!ownsClaim(job.documentId,job.id)){job.status='canceled';return false;}
      job.attemptedPages=[...new Set([...job.attemptedPages,...pages])];
      job.notionsCreated+=result.notions.length;job.cardsCreated+=result.cardsCreated;
      job.requests+=result.usage.requests;job.inputTokens+=result.usage.inputTokens;job.outputTokens+=result.usage.outputTokens;
      job.estimatedCostUsd=estimatedGenerationCost(job.inputTokens,job.outputTokens);
      job.warnings=[...new Set([...job.warnings,...result.warnings])].slice(-8);
      for(const page of pages)if(job.activeStages)delete job.activeStages[page];
      if(!job.firstReadyAt&&result.readyCards>0){job.firstReadyAt=new Date().toISOString();job.firstReadyMs=Date.now()-Date.parse(job.startedAt);}
      job.sectionsCompleted=(job.sectionsCompleted??0)+1;
      job.elapsedMs=Date.now()-Date.parse(job.startedAt);
      refreshCounts(job,selected);save(job);
      const blocked=result.warnings.find(fatal);
      if(blocked){job.status='failed';job.error=blocked;return false;}
      return true;
    };
    const concurrency=generationConcurrency();
    job.concurrency=concurrency;save(job);
    job.pipeline='teacher';
    const source=readGenerationDocument(job.documentId).source;
    const sections=planSourceBatches(pending,source.pages);
    job.sectionCount=sections.length;save(job);
    let stopped=false,cursor=0;
    const workers=Array.from({length:Math.min(concurrency,sections.length)},async()=>{
      while(!stopped&&job.status==='running'&&cursor<sections.length){
        const section=sections[cursor++];
        try{if(!await processPages(section.pages))stopped=true;}catch(error){stopped=true;throw error;}
      }
    });
    const outcomes=await Promise.allSettled(workers),failure=outcomes.find(r=>r.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
    // Retry only temporary transport/provider failures, once, at most three
    // pages. A semantic/source rejection never causes an unlimited paid loop.
    if(job.status==='running'){
      const retry=pageAnalyses(job.documentId).filter(p=>pending.includes(p.page)&&p.status==='retry'&&transient(p.reason)).slice(0,3).map(p=>p.page);
      for(const page of retry)if(!await processPages([page]))break;
    }
    refreshCounts(job,selected);
    if(job.status==='running')job.status=job.reviewPages.length||job.completedPages<job.totalPages?'needs_review':'complete';
    const technicalFailures=pageAnalyses(job.documentId).filter(p=>selected.includes(p.page)&&p.status==='retry'&&p.failureKind);
    if(job.status==='needs_review'&&technicalFailures.length){
      job.error=`${technicalFailures.length} page(s) could not be processed: ${technicalFailures[0].reason}. Saved cards are preserved.`;
      if(!job.processedPages)job.status='failed';
    }
    if(job.status==='complete')job.warnings=[];
    if(Boolean(findGenerationDocument(job.documentId)))save(job);
  } finally {clearInterval(heartbeat);}
}

// Tests can await completion without imposing that lifecycle on an HTTP call.
export async function waitForDocumentGeneration(id:string){await tasks().get(id);}
