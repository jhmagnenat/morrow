import {createHash} from 'node:crypto';
import {openDb,insertDocument,insertNotion,insertPassages} from '@/lib/db';
import {getStudyCards,saveStudyCard,setNotionMetadata} from '@/lib/qualityDb';
import {createRecoveryPoint} from '@/lib/recovery';
import {parseAnkiPackage,type AnkiPackage} from '@/lib/ankiPackage';

export function previewAnkiPackage(bytes:Buffer){
  const parsed=parseAnkiPackage(bytes),existing=new Set(getStudyCards().map(c=>c.id));
  return {cards:parsed.cards.length,newCards:parsed.cards.filter(c=>!existing.has(c.key)).length,existingCards:parsed.cards.filter(c=>existing.has(c.key)).length,requiresVerification:parsed.cards.filter(c=>c.warnings.length).length,media:parsed.media.length,reviews:parsed.cards.reduce((n,c)=>n+c.reviews.length,0),warnings:parsed.warnings};
}
export function importAnkiPackage(bytes:Buffer,name:string,options:{progress?:boolean}={}){
  const parsed:AnkiPackage=parseAnkiPackage(bytes),hash=createHash('sha256').update(bytes).digest('hex'),database=openDb(),existing=new Map(getStudyCards().map(c=>[c.id,c]));
  const candidates=parsed.cards.filter(c=>!existing.has(c.key));
  // Reimports preserve local edits, suspension and reviews. Changed cards
  // become explicit conflicts instead of being silently replaced.
  const conflicts=parsed.cards.filter(c=>{const old=existing.get(c.key);return old&&(old.question!==c.question||old.answer!==c.answer);}).map(c=>c.key);
  if(!candidates.length)return {imported:0,unchanged:parsed.cards.length-conflicts.length,conflicts,requiresVerification:0,media:parsed.media.length,warnings:parsed.warnings};
  createRecoveryPoint('before-anki-import');
  database.exec('BEGIN IMMEDIATE');
  try{
    const document=insertDocument({title:`Anki import: ${name.slice(0,160)}`,filename:name.slice(0,240),kind:'course',pageCount:candidates.length});
    const importedNotions=new Set<string>();
    for(let index=0;index<candidates.length;index++){
      const card=candidates[index],page=index+1,quote=`Imported Anki card\n${card.question}\n${card.answer}`;
      insertPassages([{documentId:document.id,page,ordinal:0,text:quote}]);
      const evidence=[{documentId:document.id,page,quote}];
      if(!importedNotions.has(card.noteKey)&&!database.prepare('SELECT id FROM notions WHERE id=?').get(card.noteKey)){
        insertNotion({id:card.noteKey,label:card.question.slice(0,100)||'Imported Anki note',domain:card.deck,status:'validated',definition:card.answer,sources:[{documentId:document.id,page}],courseContext:'Imported user-supplied Anki content. It has not undergone a slide-source or AI truth audit.'});
        setNotionMetadata(card.noteKey,'course',evidence,'anki-import-v1');
        importedNotions.add(card.noteKey);
      }
      saveStudyCard({id:card.key,cardType:'notion',notionId:card.noteKey,question:card.question,answer:card.answer,example:'',kind:'definition',objective:card.question,status:card.suspended?'suspended':card.warnings.length?'draft':'ready',evidence,warnings:card.warnings,userEdited:true,model:'Anki user-supplied content',promptVersion:'anki-import-v1',presentation:{packageHash:hash,frontHtml:card.frontHtml,backHtml:card.backHtml}});
      database.prepare('INSERT INTO quality_settings VALUES(?,?)').run(`anki-card:${card.key}`,JSON.stringify({packageHash:hash,frontHtml:card.frontHtml,backHtml:card.backHtml,tags:card.tags,deck:card.deck,question:card.question,answer:card.answer}));
      if(options.progress&&(card.reviews.length||card.dueAt)){
        for(const review of card.reviews)database.prepare('INSERT INTO review_log(id,card_type,card_id,grade,reviewed_at) VALUES(lower(hex(randomblob(16))),?,?,?,?)').run('notion',card.key,review.grade,review.reviewedAt);
        const last=card.reviews.at(-1)?.reviewedAt??null;
        const epoch=card.reviewEpoch??(card.isNew?last:undefined);
        if(epoch)database.prepare('INSERT INTO quality_settings VALUES(?,?)').run(`review-epoch:notion:${card.key}`,JSON.stringify({at:epoch}));
        if(!card.isNew)database.prepare('INSERT INTO review_state(card_type,card_id,interval_days,ease_factor,repetitions,due_at,last_reviewed_at) VALUES(?,?,?,?,?,?,?)').run('notion',card.key,card.intervalDays??0,2.5,card.repetitions,card.dueAt??last,last);
      }
    }
    database.prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(`anki-package:${hash}`,JSON.stringify({name:name.slice(0,240),base64:bytes.toString('base64')}));
    database.exec('COMMIT');
    return {imported:candidates.length,unchanged:parsed.cards.length-candidates.length-conflicts.length,conflicts,requiresVerification:candidates.filter(c=>c.warnings.length).length,media:parsed.media.length,warnings:parsed.warnings,progressImported:Boolean(options.progress)};
  }catch(error){database.exec('ROLLBACK');throw error;}
}
