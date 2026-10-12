import {openDb} from '@/lib/db';
import {getTeachingLessons} from '@/lib/teachingStorage';
export function reliabilityContext() {
  const db=openDb();
  return {teachingLessons:getTeachingLessons(),originalSources:{
    revisions:new Map(db.prepare('SELECT document_id,revision FROM source_documents').all().map(r=>[String(r.document_id),String(r.revision)])),
    text:new Map(db.prepare('SELECT document_id,page,text FROM source_pages').all().map(r=>[`${r.document_id}:${r.page}`,String(r.text)])),
  }};
}
