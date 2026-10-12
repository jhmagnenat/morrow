import {NextResponse} from 'next/server';
import {courseRoute,scopedCourseId} from '@/lib/courseScope';
import {getAllCardsForBrowse,openDb,type CardType} from '@/lib/db';
import {offlineReviewState} from '@/lib/reviewSync';
import {createHash} from 'node:crypto';
import {ACCURACY_VERSION} from '@/lib/contentAccuracy';

export const GET=courseRoute(async(request:Request)=>{
  const db=openDb();
  db.exec('SAVEPOINT offline_inventory');
  try{
  // Hash the persisted inputs before expensive FSRS replay/serialization.
  // A read snapshot keeps worker writes from mixing inventory versions.
  const inputs=['study_cards','vocabulary_cards','pronunciation_cards','review_state'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const contentInputs=[ACCURACY_VERSION,inputs[0],db.prepare('SELECT id,label,definition,explanation,mapping_visible FROM notions ORDER BY id').all(),db.prepare('SELECT notion_id,layer,evidence,clair FROM notion_metadata ORDER BY notion_id').all(),db.prepare('SELECT * FROM links ORDER BY id').all(),db.prepare('SELECT document_id,page,ordinal,text FROM passages ORDER BY document_id,page,ordinal').all(),db.prepare("SELECT value FROM quality_settings WHERE key='course-learning-curriculum'").all()];
  const contentVersion=createHash('sha256').update(JSON.stringify(contentInputs)).digest('hex');
  inputs.push([{contentVersion}]);
  inputs.push(db.prepare("SELECT * FROM quality_settings WHERE key IN ('review','scheduler-profile') OR key LIKE 'review-epoch:%' OR key LIKE 'fsrs:%' ORDER BY key").all());
  const etag='"'+createHash('sha256').update(JSON.stringify([scopedCourseId(),...inputs])).digest('hex')+'"';
  const headers={'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie, X-Course-Id'};
  if(request.headers.get('If-None-Match')===etag){db.exec('RELEASE offline_inventory');return new Response(null,{status:304,headers});}
  const cards=getAllCardsForBrowse();
  const reviews=Object.fromEntries(cards.filter(c=>!c.studyCard||c.studyCard.status==='ready').map(c=>[
    `${c.cardType}:${c.cardId}`,{...offlineReviewState(c.cardType as CardType,c.cardId),...(c.studyCard?{content:{question:c.studyCard.question,answer:c.studyCard.answer}}:{})}]));
  db.exec('RELEASE offline_inventory');
  return NextResponse.json({version:1,courseId:scopedCourseId(),savedAt:Date.now(),contentVersion,reviews},{headers});
  }catch(error){db.exec('ROLLBACK TO offline_inventory; RELEASE offline_inventory');throw error;}
});
