import fs from 'node:fs';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const historyOnly=process.argv.includes('--history');
const root=process.cwd(),reportPath=flag('report'),documentId=flag('document'),courseId=flag('course'),pdfSha256=flag('pdf-sha256'),pages=(flag('pages')??'').split(',').map(Number);
if(!reportPath||!documentId||!courseId||!pdfSha256||pages.some(p=>!Number.isInteger(p)||p<1))throw Error('Required: --report=path --document=id --course=id --pdf-sha256=hash --pages=27,32,33,34; --apply restores missing historical audits only');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.job?.documentId!==documentId||!['complete','needs_review'].includes(report.job?.status))throw Error('A completed original-document report is required');
const original=report.quality?.documents?.find(d=>d.id===documentId)?.pages;if(!original)throw Error('Original document audits absent');
const env=await isolatedModules(DATABASE_MODULES);process.env.MORROW_DATA_DIR=path.join(root,'data');
const scope=await env.load('courseScope'),q=await env.load('qualityDb'),db=await env.load('db'),repo=await env.load('generationRepository'),recovery=await env.load('recovery');
scope.withCourse(courseId,()=>{
 const {source}=repo.readGenerationDocument(documentId);if(source.pdfSha256!==pdfSha256)throw Error('Original PDF changed');
 if(db.openDb().prepare("SELECT 1 FROM generation_jobs WHERE document_id=? AND status='running'").get(documentId))throw Error('Generation is running');
 const existing=q.pageAnalyses(documentId),cards=q.getDocumentStudyCards(documentId);
 const restored=pages.map(page=>{
  const current=existing.find(p=>p.page===page);
  if(historyOnly?(!current||current.status!=='retry'||current.previousAnalysis):Boolean(current))throw Error('Existing page state or historical analysis must not be overwritten: '+page);
  const originalPage=original.find(p=>p.page===page);
  if(originalPage?.status!=='complete'||originalPage.sourceRevision!==source.revision||!originalPage.knowledgeCoverage?.length||originalPage.knowledgeCoverage.some(k=>k.status!=='covered'))throw Error('Historical audit is not complete for the unchanged source: '+page);
  const coverage=originalPage.knowledgeCoverage.map(k=>{const matches=cards.filter(c=>c.status==='ready'&&!c.userEdited&&c.accuracyReview&&c.promptVersion===originalPage.version&&c.objective===k.claim&&c.evidence.some(e=>e.documentId===documentId&&e.page===page));if(matches.length!==1)throw Error('Historical claim lacks one unchanged, independently reviewed ready card: '+k.claim);return {...k,cardKeys:[matches[0].id]};});
  const preserved={...originalPage,knowledgeCoverage:coverage,reason:`Restored preserved ${originalPage.version} audit for the unchanged original source and current review-bound cards. No new model evaluation was performed. ${originalPage.reason}`};
  return historyOnly?{...current,previousAnalysis:preserved}:preserved;
 });
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({pages,providerCalls:0,apply:false}));return;}
 const recoveryPoint=recovery.createRecoveryPoint('before-restoring-preserved-page-audits'),connection=db.openDb();connection.exec('BEGIN IMMEDIATE');
 try{repo.assertGenerationSource(source,undefined,true);for(const audit of restored)q.savePageAnalysis(documentId,audit);connection.exec('COMMIT');}catch(error){connection.exec('ROLLBACK');throw error;}
 const result={restoredAt:new Date().toISOString(),documentId,courseId,pdfSha256,pages,historyOnly,versions:restored.map(p=>historyOnly?p.previousAnalysis.version:p.version),providerCalls:0,recovery:recoveryPoint};fs.writeFileSync(path.join(root,`references/evaluation/restored-page-${historyOnly?'history':'audits'}-latest.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
