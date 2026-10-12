import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),backup=await env.load('backup'),storage=await env.load('pdfStorage');
const originalRename=fs.renameSync;
try{
  const notion=db.insertNotion({label:'Original lesson',domain:'Backup',definition:'The original lesson.',sources:[],status:'draft'});
  const documents=[1,2].map(i=>db.insertDocument({title:`Original PDF ${i}`,kind:'course',pageCount:1}));
  const originals=documents.map((d,i)=>Buffer.from(`%PDF-1.7\noriginal-${i}`));
  for(let i=0;i<documents.length;i++)storage.savePdfFile(documents[i].id,originals[i].buffer.slice(originals[i].byteOffset,originals[i].byteOffset+originals[i].byteLength));
  const beforeDb=db.exportSnapshot(),before=backup.snapshotWithPdfs();
  const replacement={...before,notions:before.notions.map(n=>({...n,label:'Replacement lesson'})),documents:before.documents.map((d,i)=>({...d,title:`Replacement PDF ${i}`,pdfBase64:Buffer.from(`%PDF-1.7\nreplacement-${i}`).toString('base64')}))};
  let failed=false;
  fs.renameSync=(source,target)=>{
    if(!failed&&String(target).endsWith(`${documents[1].id}.pdf`)){failed=true;throw Object.assign(Error('fixture disk permission failure'),{code:'EACCES'});}
    return originalRename(source,target);
  };
  assert.throws(()=>backup.restoreWithPdfs(replacement),/fixture disk permission failure/);fs.renameSync=originalRename;
  assert(failed);
  const after=db.exportSnapshot();assert.equal(after.notions.find(n=>n.id===notion.id).label,'Original lesson');
  assert.deepEqual(after.documents,beforeDb.documents);
  for(let i=0;i<documents.length;i++)assert.deepEqual(storage.readPdfFile(documents[i].id),originals[i],'Previously replaced PDF is restored after a later asset fails');
  assert.equal(db.openDb().isTransaction,false);
  assert.throws(()=>backup.restoreWithPdfs(replacement,()=>{throw Error('stale revision');}),/stale revision/);
  assert.deepEqual(storage.readPdfFile(documents[0].id),originals[0],'A failed precondition never changes an asset');
  backup.restoreWithPdfs(replacement);assert.equal(db.getGraph().notions[0].label,'Replacement lesson');
  assert.equal(storage.readPdfFile(documents[0].id).toString(),'%PDF-1.7\nreplacement-0');
  console.log('PASS: real PDF writes, injected second-file failure, database and first-file rollback, precondition protection and complete successful restoration. No model calls.');
}finally{fs.renameSync=originalRename;for(const connection of globalThis.__courseDbs?.values()??[])connection.close();process.chdir(env.root);}
