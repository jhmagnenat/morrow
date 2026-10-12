import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const root=process.cwd(),documentId=flag('document'),courseId=flag('course'),pages=(flag('pages')??'').split(',').map(Number);
if(!documentId||!courseId||!pages.length||pages.some(p=>!Number.isInteger(p)||p<1))throw Error('Required: --document=id --course=id --pages=22,24,26');
let calls=0;
const env=await isolatedModules(DATABASE_MODULES,{llm:`export function currentProviderLabel(){return 'zero-provider-reuse-check';}export async function structuredCompletion(){globalThis.__reuseProviderAttempt();throw Error('Provider calls forbidden in this check');}`,pdf:`export async function renderPdfPagesAsDataUrls(){throw Error('Rendering forbidden for unchanged inspected sources');}`});
globalThis.__reuseProviderAttempt=()=>calls++;
process.env.MORROW_DATA_DIR=path.join(root,'data');
const scope=await env.load('courseScope'),db=await env.load('db'),q=await env.load('qualityDb'),adapter=await env.load('directCardGeneration'),repo=await env.load('generationRepository'),recovery=await env.load('recovery');
await scope.withCourse(courseId,async()=>{
 const {source}=repo.readGenerationDocument(documentId),analyses=q.pageAnalyses(documentId),before=q.getDocumentStudyCards(documentId),history=db.exportSnapshot().reviewState;
 if(db.openDb().prepare("SELECT 1 FROM generation_jobs WHERE document_id=? AND status='running'").get(documentId))throw Error('A generation job is already running');
 for(const page of pages){const audit=analyses.find(a=>a.page===page);if(audit?.version!=='source-inspection-v1'||audit.sourceRevision!==source.revision||!['complete','skipped'].includes(audit.status))throw Error('Page lacks a current explicit source inspection: '+page);}
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({sourceMatches:true,pages,apply:false,providerCalls:0}));return;}
 const recoveryPoint=recovery.createRecoveryPoint('before-inspected-reuse-check'),results=[];
 for(let i=0;i<pages.length;i+=3){const batch=pages.slice(i,i+3);q.retryPages(documentId,batch);const result=await adapter.generateDirectCards(documentId,{mode:'strict',enrichment:false,cardDetail:'key-ideas',pages:batch});assert.equal(calls,0);assert.equal(result.usage.requests,0);assert.deepEqual(result.warnings,[]);results.push({pages:batch,readyCards:result.readyCards,requests:result.usage.requests});}
 assert.deepEqual(q.getDocumentStudyCards(documentId),before,'Regeneration must preserve every saved card and proof');assert.deepEqual(db.exportSnapshot().reviewState,history,'Learning history must remain unchanged');
 for(const page of pages)assert.equal(q.pageAnalyses(documentId).find(a=>a.page===page)?.status,analyses.find(a=>a.page===page)?.status);
 const report={checkedAt:new Date().toISOString(),documentId,courseId,pdfSha256:source.pdfSha256,results,providerCalls:calls,cardsUnchanged:true,historyUnchanged:true,recovery:recoveryPoint};
 fs.writeFileSync(path.join(root,'references/evaluation/inspected-reuse-latest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
