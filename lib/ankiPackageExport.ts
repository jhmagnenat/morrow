import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {packageAnkiDatabase,parseAnkiPackage} from '@/lib/ankiPackage';
import {openDb,exportSnapshot} from '@/lib/db';
import {reliabilityReport,type ReliabilityInput} from '@/lib/reliabilityReport';
import {replayFsrs} from '@/lib/fsrs';
import {getFsrsWeights} from '@/lib/qualityDb';
import {teachingOriginLabel} from '@/lib/teachingCourse';

const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
const numberId=(id:string)=>parseInt(createHash('sha256').update(id).digest('hex').slice(0,12),16);
// Legacy schema-11 transport, compatible with Anki's "older versions" format.
export function exportAnkiPackage(input:ReliabilityInput,progress=false){
  const approved=new Set(reliabilityReport(input).cards.filter(c=>c.status==='ready'&&!c.issues.length&&!c.warnings.length).map(c=>c.id)),cards=input.cards.filter(c=>approved.has(c.id));
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'morrow-anki-export-'));let db:DatabaseSync|undefined;
  try{
    const file=path.join(temporary,'collection.db');db=new DatabaseSync(file);
    db.exec(`CREATE TABLE col(id INTEGER PRIMARY KEY,crt INTEGER,mod INTEGER,scm INTEGER,ver INTEGER,dty INTEGER,usn INTEGER,ls INTEGER,conf TEXT,models TEXT,decks TEXT,dconf TEXT,tags TEXT);
      CREATE TABLE notes(id INTEGER PRIMARY KEY,guid TEXT,mid INTEGER,mod INTEGER,usn INTEGER,tags TEXT,flds TEXT,sfld INTEGER,csum INTEGER,flags INTEGER,data TEXT);
      CREATE TABLE cards(id INTEGER PRIMARY KEY,nid INTEGER,did INTEGER,ord INTEGER,mod INTEGER,usn INTEGER,type INTEGER,queue INTEGER,due INTEGER,ivl INTEGER,factor INTEGER,reps INTEGER,lapses INTEGER,left INTEGER,odue INTEGER,odid INTEGER,flags INTEGER,data TEXT);
      CREATE TABLE revlog(id INTEGER PRIMARY KEY,cid INTEGER,usn INTEGER,ease INTEGER,ivl INTEGER,lastIvl INTEGER,factor INTEGER,time INTEGER,type INTEGER);
      CREATE TABLE graves(usn INTEGER,oid INTEGER,type INTEGER);
      CREATE INDEX ix_cards_nid ON cards(nid);CREATE INDEX ix_cards_sched ON cards(did,queue,due);CREATE INDEX ix_revlog_cid ON revlog(cid);`);
    const now=Date.now(),seconds=Math.floor(now/1000),anchor=Math.floor(now/86400000)*86400;
    const model={id:1,name:'Morrow Basic',type:0,mod:seconds,usn:-1,sortf:0,did:1,latexPre:'',latexPost:'',css:'.card { font-family: Arial; font-size: 20px; }',flds:[{name:'Front',ord:0},{name:'Back',ord:1}],tmpls:[{name:'Recall',ord:0,qfmt:'{{Front}}',afmt:'{{FrontSide}}<hr id="answer">{{Back}}',did:null,bqfmt:'',bafmt:''}],req:[[0,'all',[0]]]};
    const deck={id:1,name:'Morrow',mod:seconds,usn:-1,desc:'Exported Morrow cards',dyn:0,collapsed:false,conf:1,extendNew:0,extendRev:0};
    db.prepare('INSERT INTO col VALUES(1,?,?,?,11,0,-1,0,?,?,?,?,?)').run(anchor,now,now,JSON.stringify({nextPos:cards.length+1,curDeck:1,activeDecks:[1],curModel:'1',schedVer:2}),JSON.stringify({'1':model}),JSON.stringify({'1':deck}),JSON.stringify({'1':{id:1,name:'Default',mod:seconds,usn:-1,maxTaken:60,new:{delays:[1,10],ints:[1,4,7],initialFactor:2500,order:1,perDay:20},rev:{perDay:200,ease4:1.3,fuzz:.05,ivlFct:1,maxIvl:36500,hardFactor:1.2},lapse:{delays:[10],mult:0,minInt:1,leechFails:8,leechAction:0}}}),'{}');
    const snapshot=exportSnapshot(),media=new Map<string,Buffer>(),packages=new Set<string>(),usedIds=new Set<number>(),usedReviewIds=new Set<number>();
    const states=new Map(snapshot.reviewState.map(state=>[`${state.cardType}:${state.cardId}`,state]));
    const histories=new Map<string,typeof snapshot.reviewLog>();
    for(const review of snapshot.reviewLog){const key=`${review.cardType}:${review.cardId}`,history=histories.get(key)??[];history.push(review);histories.set(key,history);}
    const weights=getFsrsWeights();
    for(const [index,card] of cards.entries()){
      const id=numberId(card.id);if(usedIds.has(id))throw Error('Anki export identifier collision');usedIds.add(id);
      const row=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`anki-card:${card.id}`),original=row?JSON.parse(String(row.value)):undefined;
      const unchanged=original&&original.question===card.question&&original.answer===card.answer;
      const front=unchanged?original.frontHtml:escape(card.question),back=unchanged?original.backHtml:escape(card.answer)+(card.explanation?`<br><br>Explanation: ${escape(card.explanation)}`:'')+(card.example?`<br><br>${escape(card.example)}`:'')+(card.teaching?`<br><br>${escape(teachingOriginLabel(card.teaching.origin))}<br>${card.teaching.claims.map(c=>escape(c.statement)).join('<br>')}`:'');
      if(unchanged)packages.add(original.packageHash);
      const epoch=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`review-epoch:${card.cardType}:${card.id}`);
      db.prepare('INSERT INTO notes VALUES(?,?,1,?,-1,?,?,?, ?,0,?)').run(id,`morrow-${card.id}`,seconds,unchanged?original.tags:' morrow ',`${front}\x1f${back}`,card.question,parseInt(createHash('sha1').update(card.question).digest('hex').slice(0,8),16),JSON.stringify({morrowCardId:card.id,morrowReviewEpoch:progress&&epoch?JSON.parse(String(epoch.value)).at:undefined}));
      const state=progress?states.get(`${card.cardType}:${card.id}`):undefined;
      const learning=!!state&&state.intervalDays<1;
      const interval=state?Math.round(state.intervalDays):0,due=state?(learning?Math.ceil(Date.parse(state.dueAt)/1000):Math.floor((Date.parse(state.dueAt)/1000-anchor)/86400)):index+1;
      const history=progress?(histories.get(`${card.cardType}:${card.id}`)??[]).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)):[];
      const memory=history.length?replayFsrs(history,.9,weights):undefined;
      db.prepare('INSERT INTO cards VALUES(?,?,1,0,?,-1,?,?,?,?,?,?,?,?,0,0,0,?)').run(id,id,seconds,state?(learning?1:2):0,state?(learning?1:2):0,due,interval,Math.round((state?.easeFactor??2.5)*1000),state?.repetitions??0,memory?.lapses??0,learning?1001:0,'');
      // The legacy Morrow log records grades/dates, not past intervals or
      // response duration. Do not fabricate those unavailable measurements.
      for(const review of history){
        let reviewId=Date.parse(review.reviewedAt);while(usedReviewIds.has(reviewId))reviewId++;usedReviewIds.add(reviewId);
        db.prepare('INSERT INTO revlog VALUES(?,?,-1,?,0,0,2500,0,1)').run(reviewId,id,['again','hard','good','easy'].indexOf(review.grade)+1);
      }
    }
    for(const packageHash of packages){
      const stored=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`anki-package:${packageHash}`);if(!stored)continue;
      const original=parseAnkiPackage(Buffer.from(JSON.parse(String(stored.value)).base64,'base64'));
      for(const item of original.media){const previous=media.get(item.name);if(previous&&!previous.equals(item.bytes))throw Error(`Conflicting media filename: ${item.name}`);media.set(item.name,item.bytes);}
    }
    db.close();db=undefined;
    return {bytes:packageAnkiDatabase(fs.readFileSync(file),[...media].map(([name,bytes])=>({name,bytes}))),exported:cards.length,excluded:input.cards.length-cards.length,progress};
  }finally{db?.close();if(!path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Invalid temporary directory');fs.rmSync(temporary,{recursive:true,force:true});}
}
