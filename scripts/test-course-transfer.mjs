import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),scope=await env.load('courseScope'),courses=await env.load('courses'),transfer=await env.load('courseTransfer'),zip=await env.load('zipArchive'),pdf=await env.load('pdfStorage'),backup=await env.load('backup');
try{
  const document=db.insertDocument({title:'Transfer PDF',kind:'course',pageCount:1});db.insertPassages([{documentId:document.id,page:1,ordinal:0,text:'Original sourced learning material.'}]);
  const notion=db.insertNotion({label:'Transfer notion',domain:'Testing',definition:'A preserved course concept.',status:'draft',sources:[{documentId:document.id,page:1}]});
  const bytes=Buffer.from('%PDF-1.4\ntransfer fixture');pdf.savePdfFile(document.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const source=transfer.exportCourseTransfer();
  assert.equal(transfer.snapshotRevision({...backup.snapshotWithPdfs(),exportedAt:'2030-01-01'}),source.revision,'Export clock is not a content revision');
  const other=courses.createCourse('Destination');
  let first;
  scope.withCourse(other.id,()=>{
    const empty=transfer.courseTransferStatus();assert(empty.empty);
    const result=transfer.importCourseTransfer(source.bytes,empty.revision);assert.equal(result.notions,1);assert.deepEqual(pdf.readPdfFile(document.id),bytes);
    first=result.revision;assert.equal(first,source.revision,'Restore retains the semantic revision');
    assert(transfer.importCourseTransfer(source.bytes,first).unchanged,'Retransfer is idempotent');
    db.insertNotion({label:'Independent change',domain:'Testing',definition:'Must not be overwritten.',status:'draft',sources:[]});
    assert.throws(()=>transfer.importCourseTransfer(source.bytes,first),transfer.TransferConflict);assert.equal(db.exportSnapshot().notions.length,2);
    const file=zip.readZip(source.bytes),manifest=JSON.parse(file.get('manifest.json'));manifest.snapshot.notions[0].definition='Tampered';file.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
    assert.throws(()=>transfer.readCourseTransfer(zip.writeZip(file)),/checksum/);assert.equal(db.exportSnapshot().notions.length,2);
    const pdfFile=[...file.keys()].find(name=>name.startsWith('pdfs/'));file.set(pdfFile,Buffer.from('bad'));assert.throws(()=>transfer.readCourseTransfer(zip.writeZip(file)),/PDF transfer checksum/);
  });
  // A precondition checked under the DB lock can abort without clearing data.
  assert.throws(()=>db.importSnapshot(db.exportSnapshot(),()=>{throw Error('Concurrent modification');}),/Concurrent/);assert.equal(db.exportSnapshot().notions[0].id,notion.id);
  const route=await env.route('app/api/transfer/route.ts','transfer-route');
  delete process.env.MORROW_TRANSFER_TOKEN;assert.equal((await route.GET(new Request('http://localhost/api/transfer'))).status,503);
  process.env.MORROW_TRANSFER_TOKEN='test-only-transfer-token-with-32-characters';
  assert.equal((await route.GET(new Request('http://localhost/api/transfer'))).status,401);
  const headers={Authorization:`Bearer ${process.env.MORROW_TRANSFER_TOKEN}`,'X-Course-Id':other.id};
  assert.equal((await route.POST(new Request('http://localhost/api/transfer',{method:'POST',headers,body:source.bytes}))).status,428);
  assert.equal((await route.POST(new Request('http://localhost/api/transfer',{method:'POST',headers:{...headers,'If-Match':first},body:source.bytes}))).status,409);
  const state=scope.withCourse(other.id,transfer.courseTransferStatus);
  const preview=await route.POST(new Request('http://localhost/api/transfer?preview=true',{method:'POST',headers:{...headers,'If-Match':state.revision},body:source.bytes}));assert.equal(preview.status,200);
  assert.equal(scope.withCourse(other.id,()=>db.exportSnapshot().notions.length),2,'Preview does not replace destination');
  const restored=await route.POST(new Request('http://localhost/api/transfer',{method:'POST',headers:{...headers,'If-Match':state.revision},body:source.bytes}));assert.equal(restored.status,200);
  assert.equal(scope.withCourse(other.id,()=>db.exportSnapshot().notions.length),1);
  console.log('PASS: portable verified PDF transfer, stable revisions, idempotency, concurrent-change rejection under SQLite lock, corruption rejection, preview, authentication, required precondition and course isolation. No network/model calls.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
