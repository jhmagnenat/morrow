import {createHash} from 'node:crypto';
import {getReviewState,openDb,type CardType} from '@/lib/db';
import {getStudyCard} from '@/lib/qualityDb';

// Includes content and reset epoch: an offline answer to an edited/reset card
// cannot silently grade the replacement, even if its due date is unchanged.
export function reviewRevision(type:CardType,id:string):string {
  const db=openDb();
  const content=type==='notion'||type==='link'?getStudyCard(id):db.prepare(
    type==='vocabulary'?'SELECT * FROM vocabulary_cards WHERE id=?':'SELECT * FROM pronunciation_cards WHERE id=?').get(id);
  const state=db.prepare('SELECT * FROM review_state WHERE card_type=? AND card_id=?').get(type,id);
  const epoch=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`review-epoch:${type}:${id}`);
  return createHash('sha256').update(JSON.stringify({content,state,epoch})).digest('hex');
}
export function offlineReviewState(type:CardType,id:string){
  const row=openDb().prepare('SELECT due_at FROM review_state WHERE card_type=? AND card_id=?').get(type,id);
  return {revision:reviewRevision(type,id),state:getReviewState(type,id),dueAt:row?String(row.due_at):null};
}
