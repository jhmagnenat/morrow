import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';

// Actual HTTP proxy, multipart parser, PDF.js and disk/SQLite persistence.
// A valid PDF above the proxy's former 10 MiB default reproduces the incident.
const root=process.cwd();await mkdir(path.join(root,'.next'),{recursive:true});
const workspace=await mkdtemp(path.join(root,'.next','upload-runtime-'));
const child=spawn(process.execPath,['scripts/start.mjs','--port','3005'],{env:{...process.env,MORROW_DATA_DIR:path.join(workspace,'data'),MORROW_AUTH:'off'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
let output='';const children=[];child.on('message',message=>{if(message.pid)children.push(message.pid);});child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
const exited=new Promise(resolve=>child.once('exit',resolve));
const base='http://localhost:3005';
function largePdf(){
  const parts=[Buffer.from('%PDF-1.7\n')],offsets=[0];let length=parts[0].length;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',null,
  ];
  const content='BT /F1 12 Tf 72 720 Td (PDF upload regression fixture.) Tj ET';
  objects[3]=`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  const padding=Buffer.alloc(11*1024*1024,65);
  objects[5]=Buffer.concat([Buffer.from(`<< /Length ${padding.length} >>\nstream\n`),padding,Buffer.from('\nendstream')]);
  for(const [index,object] of objects.entries()){
    offsets.push(length);const bytes=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),Buffer.isBuffer(object)?object:Buffer.from(object),Buffer.from('\nendobj\n')]);parts.push(bytes);length+=bytes.length;
  }
  const xref=length;
  parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(parts);
}
async function upload(bytes,name='fixture.pdf'){
  const form=new FormData();form.append('file',new File([bytes],name,{type:'application/pdf'}));form.append('title','Disposable large-upload fixture');
  return fetch(base+'/api/documents',{method:'POST',body:form});
}
try{
  const deadline=Date.now()+20000;while(true){if(await fetch(base+'/api/documents').then(r=>r.ok).catch(()=>false))break;if(Date.now()>deadline)throw Error(output);await new Promise(resolve=>setTimeout(resolve,100));}
  const bytes=largePdf();assert(bytes.length>10*1024*1024);
  const response=await upload(bytes);const body=await response.json();assert.equal(response.status,201,JSON.stringify(body)+'\n'+output);
  assert.equal(body.document.pageCount,1);assert.equal(body.document.passageCount,1);
  const stored=await fetch(`${base}/api/documents/${body.document.id}/file`);assert.equal(stored.status,200);assert.deepEqual(Buffer.from(await stored.arrayBuffer()),bytes,'Full PDF bytes survive proxy buffering and PDF.js detachment');
  const page=await(await fetch(`${base}/api/documents/${body.document.id}/pages/1`)).json();assert(page.text.includes('PDF upload regression fixture.'),'Original text is extracted from the uploaded PDF');
  const broken=await upload(Buffer.from('%PDF-1.7\nnot a readable PDF'));assert.equal(broken.status,422);assert((await broken.json()).error.includes('could not be opened'));
  const malformed=await fetch(base+'/api/documents',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=missing'},body:'truncated multipart upload'});assert.equal(malformed.status,400);assert((await malformed.json()).error.includes('could not be read'));
  const documents=(await(await fetch(base+'/api/documents')).json()).documents;assert.equal(documents.length,1,'Rejected uploads leave no partial document');
  assert(!output.includes('Request body exceeded'),'Upload is no longer truncated by the proxy');
  console.log('PASS: real production upload above 10 MiB, complete PDF storage, actual PDF text extraction, readable 422/400 JSON errors and no partial documents. Disposable data; no model calls.');
}finally{
  if(child.connected)child.send('shutdown');let timeout;await Promise.race([exited,new Promise(resolve=>{timeout=setTimeout(resolve,7000);})]);clearTimeout(timeout);
  if(child.exitCode===null){for(const pid of children)try{process.kill(pid,'SIGKILL');}catch{}child.kill('SIGKILL');}
}
