import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {applyRepair,repairs,DOCUMENT,sourceAnchors} from './repair-understand-content.mjs';
mkdirSync('.next',{recursive:true});const workspace=mkdtempSync(resolve('.next/understand-repair-'));
const file=resolve(workspace,'fixture.db'),db=new DatabaseSync(file);
db.exec(`CREATE TABLE notions(id TEXT PRIMARY KEY,label TEXT,status TEXT,definition TEXT,explanation TEXT,course_context TEXT,grounding TEXT);
CREATE TABLE notion_metadata(notion_id TEXT PRIMARY KEY,user_edited INTEGER,clair TEXT,evidence TEXT,generation_version TEXT,source_notes TEXT);
CREATE TABLE notion_sources(notion_id TEXT,document_id TEXT,page INTEGER);
CREATE TABLE passages(document_id TEXT,page INTEGER,ordinal INTEGER,text TEXT);
CREATE TABLE study_cards(id TEXT PRIMARY KEY,card_type TEXT,notion_id TEXT,link_id TEXT,payload TEXT);
CREATE TABLE links(id TEXT PRIMARY KEY,source_id TEXT,target_id TEXT);
CREATE TABLE review_state(card_id TEXT,state TEXT);
CREATE TABLE review_log(card_id TEXT,grade TEXT);`);
for(const [i,r] of repairs.entries()){
  const id=`n${i}`;db.prepare('INSERT INTO notions VALUES(?,?,?,?,?,?,?)').run(id,r.label,'draft','Old wrong definition','Old wrong explanation','','inferred');
  db.prepare('INSERT INTO notion_metadata VALUES(?,?,?,?,?,?)').run(id,0,null,'[]','slides-v12','[]');
  const card={id,cardType:'notion',notionId:id,question:'Old question',answer:'Old answer',status:'ready',warnings:[],userEdited:false};db.prepare('INSERT INTO study_cards VALUES(?,?,?,?,?)').run(id,'notion',id,null,JSON.stringify(card));
}
for(const page of new Set(repairs.flatMap(r=>r.pages)))db.prepare('INSERT INTO passages VALUES(?,?,?,?)').run(DOCUMENT,page,0,sourceAnchors[page]);
db.prepare('INSERT INTO review_state VALUES(?,?)').run('n0','Existing FSRS state');db.prepare('INSERT INTO review_log VALUES(?,?)').run('n0','good');
const before=JSON.stringify(db.prepare('SELECT * FROM notions').all());
assert.equal(applyRepair(file).concepts,8);assert.equal(JSON.stringify(db.prepare('SELECT * FROM notions').all()),before,'Preview is read-only');
const originalCwd=process.cwd();process.chdir(workspace);
try{
  const result=applyRepair(file,{dryRun:false});assert.equal(result.concepts,8);assert.equal(result.rewrittenCards,8);assert.equal(result.newCards,16);
  const backup=new DatabaseSync(result.backup,{readOnly:true});assert.equal(JSON.stringify(backup.prepare('SELECT * FROM notions').all()),before);backup.close();
  assert.equal(db.prepare('SELECT state FROM review_state WHERE card_id=?').get('n0').state,'Existing FSRS state');assert.equal(db.prepare('SELECT count(*) AS n FROM review_log').get().n,1);
  for(const {label} of repairs){const n=db.prepare('SELECT * FROM notions WHERE label=?').get(label),c=JSON.parse(db.prepare('SELECT clair FROM notion_metadata WHERE notion_id=?').get(n.id).clair);assert.equal(c.conceptLabel,label);assert.equal(c.depth,'deep');assert(c.practice.length);assert(c.implications.setup.startsWith('Hypothetical exercise:'));}
  assert.equal(db.prepare('SELECT count(*) AS n FROM study_cards').get().n,24);
  applyRepair(file,{dryRun:false});assert.equal(db.prepare('SELECT count(*) AS n FROM study_cards').get().n,24,'Repeated repair does not duplicate cards');
  db.prepare('UPDATE notion_metadata SET user_edited=1 WHERE notion_id=?').run('n0');const protectedBefore=JSON.stringify(db.prepare('SELECT * FROM notions').all());assert.throws(()=>applyRepair(file,{dryRun:false}),/protected/);assert.equal(JSON.stringify(db.prepare('SELECT * FROM notions').all()),protectedBefore);
  console.log('PASS: source-specific correction, read-only preview, recoverable backup, stable card IDs, untouched FSRS/history, repeat safety and protected edits.');
}finally{process.chdir(originalCwd);db.close();}
