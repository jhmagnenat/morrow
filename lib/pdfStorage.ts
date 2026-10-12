import fs from "node:fs";
import path from "node:path";
import {randomUUID} from 'node:crypto';
import { scopedCourseId } from "@/lib/courseScope";
import { dataDirectory } from '@/lib/dataDirectory';

// The original PDF bytes, kept on disk per course/document — needed so
// generation can later render a page as an IMAGE and show it to a
// vision-capable LLM (text extraction alone throws away every diagram).
// Mirrors the data/<courseId>.db path convention used for the SQLite files.
function courseUploadsDir(courseId: string): string {
  const root=path.resolve(dataDirectory(),"uploads"),target=path.resolve(root,courseId);
  if(!target.startsWith(root+path.sep))throw new Error("Invalid course upload directory");
  return target;
}

function pdfPath(documentId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(documentId)) throw new Error("Invalid document identifier");
  return path.join(courseUploadsDir(scopedCourseId()), `${documentId}.pdf`);
}

export function savePdfFile(documentId: string, buffer: ArrayBuffer) {
  const filePath = pdfPath(documentId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary=`${filePath}.${randomUUID()}.tmp`;
  try{fs.writeFileSync(temporary,Buffer.from(buffer),{flag:'wx'});fs.renameSync(temporary,filePath);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

export function readPdfFile(documentId: string): Buffer | null {
  const filePath = pdfPath(documentId);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function deletePdfFile(documentId: string) {
  const filePath = pdfPath(documentId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// Wipes every stored PDF for the current (active) course — used by the
// Backup panel's "Reset" and "Restore" actions, which already clear every
// document from the DB.
export function deleteAllPdfFiles() {
  const dir = courseUploadsDir(scopedCourseId());
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// Same, but for a specific (possibly non-active) course — used when
// deleting a course outright from the course bar.
export function deletePdfFilesForCourse(courseId: string) {
  const dir = courseUploadsDir(courseId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
