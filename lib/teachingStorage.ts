import {openDb} from '@/lib/db';
import {TEACHING_VERSION,type TeachingLesson} from '@/lib/teachingCourse';
import {validTeachingLesson} from '@/lib/teachingIntegrity';
import {loadSourceDocument,originalPdfHash} from '@/lib/sourceDocument';
import {readPdfFile} from '@/lib/pdfStorage';

export function saveTeachingLesson(lesson:TeachingLesson) {
  if(!validTeachingLesson(lesson))throw Error('Invalid reconstructed teaching lesson');
  openDb().prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`teaching-lesson:${lesson.id}`,JSON.stringify(lesson));
}
export function getTeachingLessons():TeachingLesson[] {
  const db=openDb();
  const originals=new Map<string,ReturnType<typeof loadSourceDocument>>();
  return db.prepare("SELECT value FROM quality_settings WHERE key LIKE 'teaching-lesson:%'").all().flatMap(r=>{
    try{
      const lesson=JSON.parse(String(r.value)) as TeachingLesson;
      if(!validTeachingLesson(lesson)||lesson.version!==TEACHING_VERSION)return [];
      if(!originals.has(lesson.documentId)){
        const original=loadSourceDocument(db,lesson.documentId);
        originals.set(lesson.documentId,original?.pdfSha256&&originalPdfHash(readPdfFile(lesson.documentId))!==original.pdfSha256?undefined:original);
      }
      if(originals.get(lesson.documentId)?.revision!==lesson.sourceRevision)return [];
      return [lesson];
    }catch{return [];}
  }).sort((a,b)=>a.documentId.localeCompare(b.documentId)||Math.min(...a.pages)-Math.min(...b.pages)||b.reviewedAt.localeCompare(a.reviewedAt));
}

export {teachingLessonHash,validTeachingTrace,teachingTraceIssues} from '@/lib/teachingIntegrity';
