import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES,{generateSlides:`const locks=new Set();export function generationLocks(){return locks;}export async function generateSlides(){throw Error('No generation during upload');}`,pdf:`export async function extractPdfPages(buffer){globalThis.__extractions++;if(globalThis.__pdfFailure)throw Error(globalThis.__pdfFailure);structuredClone(buffer,{transfer:[buffer]});return [{page:1,text:'Original PDF page.',layout:{requiresVisualReview:false}}];}export function chunkPagesIntoPassages(pages){return pages.map(p=>({page:p.page,ordinal:0,text:p.text}));}`});
process.chdir(env.workspace);
const db=await env.load('db'),storage=await env.load('pdfStorage'),{MAX_PDF_UPLOAD_BODY_BYTES}=await env.load('documentUpload');
const route=await env.route('app/api/documents/route.ts','document-upload-route');
globalThis.__extractions=0;
const bytes=Buffer.from('%PDF-1.7\nfixture original bytes');
const request=(content=bytes)=>{const form=new FormData();form.append('file',new File([content],'fixture.pdf',{type:'application/pdf'}));return new Request('http://localhost/api/documents',{method:'POST',body:form});};
try{
  const oversized=await route.POST(new Request('http://localhost/api/documents',{method:'POST',headers:{'Content-Length':String(MAX_PDF_UPLOAD_BODY_BYTES+1)},body:'too large'}));assert.equal(oversized.status,413);assert.equal(globalThis.__extractions,0);
  const malformed=await route.POST(new Request('http://localhost/api/documents',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=missing'},body:'truncated'}));assert.equal(malformed.status,400);assert((await malformed.json()).error.includes('could not be read'));assert.equal(globalThis.__extractions,0);
  const invalid=await route.POST(request(Buffer.from('not a PDF')));assert.equal(invalid.status,400);assert.equal(globalThis.__extractions,0);
  for(const [reason,expected] of [['No password given','password-protected'],['Invalid PDF structure','could not be opened'],['PDF exceeds 2,000 pages','2,000-page limit']]){
    globalThis.__pdfFailure=reason;const response=await route.POST(request());assert.equal(response.status,422);assert((await response.json()).error.includes(expected));assert.equal(db.getGraph().documents.length,0);
  }
  delete globalThis.__pdfFailure;const response=await route.POST(request());assert.equal(response.status,201);const {document}=await response.json();assert.deepEqual(storage.readPdfFile(document.id),bytes,'Original bytes survive a parser that detaches its input');assert.equal(db.getPassagesForDocument(document.id)[0].text,'Original PDF page.');
  const {loadSourceDocument,originalPdfHash}=await env.load('sourceDocument');
  const source=loadSourceDocument(db.openDb(),document.id);
  assert.equal(source.pages[0].text,'Original PDF page.');assert.equal(source.origin,'pdf');assert.equal(source.pdfSha256,originalPdfHash(bytes));
  db.openDb().prepare('UPDATE passages SET generated=1 WHERE document_id=?').run(document.id);
  const backup=await env.load('backup'),snapshot=backup.snapshotWithPdfs();
  backup.restoreWithPdfs(snapshot);assert.deepEqual(loadSourceDocument(db.openDb(),document.id),source,'Authoritative source survives real backup restore');
  assert.equal(db.openDb().prepare('SELECT generated FROM passages WHERE document_id=?').get(document.id).generated,1,'Restoring the same source preserves saved progress');
  const damaged=structuredClone(snapshot);damaged.quality.source_pages[0].text='corrupted backup text';
  assert.throws(()=>backup.restoreWithPdfs(damaged),/changed authoritative source page/);
  assert.deepEqual(loadSourceDocument(db.openDb(),document.id),source,'Rejected source corruption rolls back the restore');
  console.log('PASS: upload limits before parsing, malformed forms, invalid signatures, actionable encrypted/invalid/overlong PDF errors, no partial documents and original-byte preservation across buffer detachment. Disposable data; no model calls.');
}finally{delete globalThis.__extractions;delete globalThis.__pdfFailure;for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
