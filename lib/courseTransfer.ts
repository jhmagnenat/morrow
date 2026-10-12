import {createHash} from 'node:crypto';
import type {Snapshot} from '@/lib/db';
import {snapshotWithPdfs,restoreWithPdfs} from '@/lib/backup';
import {scopedCourseId} from '@/lib/courseScope';
import {readZip,writeZip} from '@/lib/zipArchive';

const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function snapshotRevision(snapshot:Snapshot):string{
  const {exportedAt:_,...data}=snapshot;void _;
  const sorted:Record<string,unknown>={...data};
  // Sort unordered DB collections; preserve causal step/order arrays inside
  // lessons, questions and templates, where ordering changes meaning.
  for(const [key,value] of Object.entries(sorted))if(Array.isArray(value))sorted[key]=[...value].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
  if(snapshot.quality)sorted.quality=Object.fromEntries(Object.entries(snapshot.quality).map(([table,rows])=>[table,[...rows].sort((a,b)=>canonical(a).localeCompare(canonical(b)))]));
  return digest(canonical(sorted));
}
export function courseTransferStatus(){
  const snapshot=snapshotWithPdfs();return {courseId:scopedCourseId(),revision:snapshotRevision(snapshot),notions:snapshot.notions.length,cards:snapshot.quality?.study_cards?.length??0,documents:snapshot.documents.length,reviews:snapshot.reviewLog.length,empty:!snapshot.notions.length&&!snapshot.documents.length&&!snapshot.reviewLog.length&&!snapshot.vocabularyCards.length&&!snapshot.pronunciationCards.length&&!snapshot.interviewSessions.length&&!snapshot.reviewState.length&&!snapshot.explainAttempts.length&&!snapshot.quality?.study_cards?.length};
}
export function exportCourseTransfer(){
  const snapshot=snapshotWithPdfs(),revision=snapshotRevision(snapshot),files=new Map<string,Buffer>();
  const pdfs:Record<string,string>={};
  const documents=snapshot.documents.map(document=>{
    const {pdfBase64,...data}=document;
    if(pdfBase64){const bytes=Buffer.from(pdfBase64,'base64'),hash=digest(bytes);pdfs[document.id]=hash;files.set(`pdfs/${hash}.pdf`,bytes);}
    return data;
  });
  files.set('manifest.json',Buffer.from(JSON.stringify({version:1,courseId:scopedCourseId(),revision,snapshot:{...snapshot,documents},pdfs})));
  return {bytes:writeZip(files),revision};
}
export function readCourseTransfer(bytes:Buffer){
  const files=readZip(bytes),content=files.get('manifest.json');if(!content)throw Error('Missing transfer manifest');
  const manifest=JSON.parse(content.toString());
  if(manifest.version!==1||typeof manifest.courseId!=='string'||typeof manifest.revision!=='string'||!/^[a-f0-9]{64}$/.test(manifest.revision)||!manifest.snapshot||!Array.isArray(manifest.snapshot.documents)||!Array.isArray(manifest.snapshot.notions)||!Array.isArray(manifest.snapshot.links)||!Array.isArray(manifest.snapshot.reviewLog)||!Array.isArray(manifest.snapshot.reviewState)||typeof manifest.pdfs!=='object'||!manifest.pdfs)throw Error('Invalid transfer manifest');
  const snapshot:Snapshot={...manifest.snapshot,documents:manifest.snapshot.documents.map((document:Snapshot['documents'][number])=>{
    if(document.pdfBase64!==undefined)throw Error('PDFs must use verified transfer attachments');
    const hash=manifest.pdfs[document.id];if(hash===undefined)return document;
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid PDF transfer reference');
    const pdf=files.get(`pdfs/${hash}.pdf`);if(!pdf||digest(pdf)!==hash)throw Error('PDF transfer checksum mismatch');
    return {...document,pdfBase64:pdf.toString('base64')};
  })};
  if(snapshotRevision(snapshot)!==manifest.revision)throw Error('Course transfer checksum mismatch');
  return {snapshot,revision:manifest.revision,sourceCourseId:manifest.courseId};
}
export class TransferConflict extends Error{}
export function importCourseTransfer(bytes:Buffer,expectedRevision:string){
  const incoming=readCourseTransfer(bytes),current=courseTransferStatus();
  if(current.revision!==expectedRevision)throw new TransferConflict('Destination changed since the last shared state. Both copies are preserved; export them before resolving the conflict.');
  if(incoming.revision===current.revision)return {...current,unchanged:true};
  // No await between the compare and transactional restore: another request
  // cannot change this process's course between the guard and the mutation.
  restoreWithPdfs(incoming.snapshot,()=>{
    if(snapshotRevision(snapshotWithPdfs())!==expectedRevision)throw new TransferConflict('Destination changed before the write lock was acquired; current data is preserved.');
  });
  return {...courseTransferStatus(),unchanged:false,sourceCourseId:incoming.sourceCourseId};
}
