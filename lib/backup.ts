import { exportSnapshot, importSnapshot, withDatabaseSnapshot, type Snapshot } from "@/lib/db";
import { deletePdfFile, readPdfFile, savePdfFile } from "@/lib/pdfStorage";
import {createRecoveryPoint} from '@/lib/recovery';
export function snapshotWithPdfs(): Snapshot {
  return withDatabaseSnapshot(()=>{
    const snapshot=exportSnapshot();
    return {...snapshot,documents:snapshot.documents.map(d=>({...d,pdfBase64:readPdfFile(d.id)?.toString("base64")}))};
  },true);
}
export function restoreWithPdfs(snapshot:Snapshot,assertCurrent?:()=>void) {
  return withDatabaseSnapshot(()=>{
  const previous=exportSnapshot(), originals=new Map(previous.documents.map(d=>[d.id,readPdfFile(d.id)]));
  const decoded=new Map<string,Buffer>();
  for(const doc of snapshot.documents){
    if(!/^[a-zA-Z0-9_-]+$/.test(doc.id))throw new Error("Invalid document identifier");
    if(doc.pdfBase64!==undefined){
      if(typeof doc.pdfBase64!=="string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(doc.pdfBase64))throw new Error("Invalid encoded PDF");
      const bytes=Buffer.from(doc.pdfBase64,"base64");
      if(bytes.subarray(0,5).toString()!=="%PDF-")throw new Error("Backup contains an invalid PDF");
      decoded.set(doc.id,bytes);
    }
  }
  createRecoveryPoint('before-restore');
  importSnapshot(snapshot,assertCurrent); // Validate preconditions under the SQLite write lock.
  try {
    for(const [id,bytes] of decoded)savePdfFile(id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
    const retained=new Set(snapshot.documents.map(d=>d.id));
    for(const id of originals.keys())if(!retained.has(id))deletePdfFile(id);
  }catch(error){
    importSnapshot(previous);
    for(const doc of snapshot.documents)if(!originals.has(doc.id))deletePdfFile(doc.id);
    for(const [id,bytes] of originals)if(bytes)savePdfFile(id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
    throw error;
  }
  },true);
}
