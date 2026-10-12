import assert from 'node:assert/strict';
import {zstdCompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),zip=await env.load('zipArchive'),anki=await env.load('ankiPackage'),exporter=await env.load('ankiPackageExport'),importer=await env.load('ankiImport'),scope=await env.load('courseScope'),courses=await env.load('courses');
try{
  const source='A rectangle has area equal to its width multiplied by its height.';
  const document=db.insertDocument({title:'Fixture',kind:'course',pageCount:1});
  db.insertPassages([{documentId:document.id,page:1,ordinal:0,text:source}]);
  const notion=db.insertNotion({label:'Rectangle area',domain:'Geometry',definition:source,sources:[{documentId:document.id,page:1}],status:'validated'});
  quality.saveStudyCard({id:'portable-card',cardType:'notion',notionId:notion.id,question:'How do you calculate the area of a rectangle?',answer:source,example:'',kind:'definition',objective:'Area calculation',status:'ready',evidence:[{documentId:document.id,page:1,quote:source}],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
  db.gradeCard('notion','portable-card','easy');
  const graph=db.getGraph(),input={...graph,cards:quality.getStudyCards(),passages:db.getPassagesForDocument(document.id)};
  const exported=exporter.exportAnkiPackage(input,true);assert.equal(exported.exported,1);
  const parsed=anki.parseAnkiPackage(exported.bytes);assert.equal(parsed.cards[0].key,'portable-card');assert.equal(parsed.cards[0].reviews.length,1);assert.equal(parsed.cards[0].answer,source);
  assert.equal(anki.parseAnkiPackage(exporter.exportAnkiPackage(input).bytes).cards[0].reviews.length,0);
  db.resetCardProgress('notion','portable-card');
  const forgotten=exporter.exportAnkiPackage(input,true),forgottenCourse=courses.createCourse('Forgotten destination');
  scope.withCourse(forgottenCourse.id,()=>{
    importer.importAnkiPackage(forgotten.bytes,'forgotten.apkg',{progress:true});
    assert.equal(db.getReviewState('notion','portable-card').fsrs,undefined);
    assert.equal(db.exportSnapshot().reviewLog.length,1,'Forgetting preserves historical reviews without reviving scheduling');
    db.gradeCard('notion','portable-card','good');assert.equal(db.getReviewState('notion','portable-card').fsrs.reps,1);
  });
  db.gradeCard('notion','portable-card','good');
  const learning=anki.parseAnkiPackage(exporter.exportAnkiPackage(input,true).bytes).cards[0];
  assert(Math.abs(Date.parse(learning.dueAt)-Date.parse(db.exportSnapshot().reviewState[0].dueAt))<1000,'Learning due times retain sub-day scheduling');
  assert(learning.reviewEpoch,'Reset boundary survives APKG transport');
  const other=courses.createCourse('Anki destination');
  scope.withCourse(other.id,()=>{
    assert.equal(importer.previewAnkiPackage(exported.bytes).newCards,1);
    assert.equal(db.exportSnapshot().notions.length,0,'Preview does not mutate data');
    assert.equal(importer.importAnkiPackage(exported.bytes,'fixture.apkg',{progress:true}).imported,1);
    assert.equal(db.exportSnapshot().reviewLog.length,1);
    assert.equal(db.exportSnapshot().masterySignals.length,0,'Imported grades do not invent comprehension evidence');
    const importedGraph=db.getGraph(),again=exporter.exportAnkiPackage({...importedGraph,cards:quality.getStudyCards(),passages:importedGraph.documents.flatMap(doc=>db.getPassagesForDocument(doc.id))},true);
    assert.equal(anki.parseAnkiPackage(again.bytes).cards[0].answer,source,'Reexport does not duplicate FrontSide in the answer');
    const before=db.getReviewState('notion','portable-card');
    quality.saveStudyCard({...quality.getStudyCards()[0],answer:'A local correction that must be retained.'});
    const repeated=importer.importAnkiPackage(exported.bytes,'fixture.apkg',{progress:true});
    assert.deepEqual(repeated.conflicts,['portable-card']);assert.equal(repeated.imported,0);assert.equal(db.exportSnapshot().reviewLog.length,1);assert.deepEqual(db.getReviewState('notion','portable-card'),before);
    const saved=db.exportSnapshot();db.importSnapshot(saved);assert(saved.quality.quality_settings.some(row=>row.key.startsWith('anki-package:')));
  });
  // Exercise independent Basic, reverse, cloze and media fixtures rather than
  // testing the writer against itself exclusively.
  const files=zip.readZip(exported.bytes),file=path.join(env.workspace,'fixture-anki.db');fs.writeFileSync(file,files.get('collection.anki2'));
  const fixture=new DatabaseSync(file),basic=JSON.parse(fixture.prepare('SELECT models FROM col').get().models)['1'];
  basic.tmpls.push({ord:1,qfmt:'{{Back}}',afmt:'{{FrontSide}}<hr>{{Front}}'});
  const cloze={...basic,id:2,name:'Cloze',type:1,flds:[{name:'Text',ord:0}],tmpls:[{ord:0,qfmt:'{{cloze:Text}}',afmt:'{{cloze:Text}}'}]};
  fixture.prepare('UPDATE col SET models=?').run(JSON.stringify({'1':basic,'2':cloze}));
  fixture.prepare('UPDATE notes SET guid=?,data=?,flds=?').run('basic-guid','',`A <b>basic</b> question\x1fA clear answer`);
  const first=fixture.prepare('SELECT * FROM cards').get();
  fixture.prepare('INSERT INTO cards SELECT ?,nid,did,1,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data FROM cards WHERE id=?').run(first.id+1,first.id);
  fixture.prepare('INSERT INTO notes VALUES(2,?,2,0,-1,?,?,?,0,0,?)').run('cloze-guid',' biology ','The {{c1::cell::unit}} contains {{c2::DNA}}.','The cell','');
  fixture.prepare('INSERT INTO cards VALUES(2,2,1,0,0,-1,0,0,0,0,2500,0,0,0,0,0,0,?)').run('');
  fixture.prepare('INSERT INTO cards VALUES(3,2,1,1,0,-1,0,0,0,0,2500,0,0,0,0,0,0,?)').run('');
  fixture.prepare('INSERT INTO notes VALUES(4,?,1,0,-1,?,?,?,0,0,?)').run('media-guid',' visual ','Which structure is shown? <img src="diagram.png">\x1fA cell structure','Image','');
  fixture.prepare('INSERT INTO cards VALUES(4,4,1,0,0,-1,0,0,0,0,2500,0,0,0,0,0,0,?)').run('');fixture.close();
  const custom=anki.packageAnkiDatabase(fs.readFileSync(file),[{name:'diagram.png',bytes:Buffer.from('image fixture')}]),converted=anki.parseAnkiPackage(custom);
  assert.equal(converted.cards.length,5);assert(converted.cards.some(c=>c.question==='A clear answer'&&c.answer==='A basic question'));
  assert(converted.cards.some(c=>c.question==='The [unit] contains DNA.'));assert(converted.cards.some(c=>c.question==='The cell contains […].'));
  assert.equal(converted.media.length,1);assert(converted.cards.find(c=>c.question.includes('[image:')).warnings.length);
  // Independent normalized-schema fixture with Anki's published protobuf
  // configs, zstd collection/media and verified SHA-1 attachment metadata.
  const varint=n=>{const out=[];do{out.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(out);};
  const field=(n,value)=>typeof value==='number'?Buffer.concat([varint(n*8),varint(value)]):Buffer.concat([varint(n*8+2),varint(Buffer.byteLength(value)),Buffer.from(value)]);
  const modernDb=new DatabaseSync(file);
  modernDb.exec('CREATE TABLE notetypes(id INTEGER PRIMARY KEY,name TEXT,config BLOB); CREATE TABLE fields(ntid INTEGER,ord INTEGER,name TEXT); CREATE TABLE templates(ntid INTEGER,ord INTEGER,config BLOB); CREATE TABLE decks(id INTEGER PRIMARY KEY,name TEXT)');
  modernDb.prepare('INSERT INTO decks VALUES(?,?)').run(1,'Science\x1fBiology');
  for(const [id,model] of [[1,basic],[2,cloze]]){
    modernDb.prepare('INSERT INTO notetypes VALUES(?,?,?)').run(id,model.name,field(1,model.type));
    for(const f of model.flds)modernDb.prepare('INSERT INTO fields VALUES(?,?,?)').run(id,f.ord,f.name);
    for(const t of model.tmpls)modernDb.prepare('INSERT INTO templates VALUES(?,?,?)').run(id,t.ord,Buffer.concat([field(1,t.qfmt),field(2,t.afmt)]));
  }
  modernDb.prepare('UPDATE col SET models=?,decks=?').run('{}','{}');modernDb.close();
  const mediaBytes=Buffer.from('image fixture');
  const entry=Buffer.concat([field(1,'diagram.png'),field(2,mediaBytes.length),field(3,createHash('sha1').update(mediaBytes).digest())]);
  const modernFiles=new Map([['meta',field(1,3)],['collection.anki21b',zstdCompressSync(fs.readFileSync(file))],['media',zstdCompressSync(field(1,entry))],['0',zstdCompressSync(mediaBytes)]]);
  const modern=anki.parseAnkiPackage(zip.writeZip(modernFiles));
  assert.equal(modern.cards.length,5);assert.deepEqual(modern.cards.map(c=>c.question),converted.cards.map(c=>c.question));assert.deepEqual(modern.media[0].bytes,mediaBytes);assert.equal(modern.cards[0].deck,'Science::Biology');
  modernFiles.set('0',zstdCompressSync(Buffer.from('corrupt media')));assert.throws(()=>anki.parseAnkiPackage(zip.writeZip(modernFiles)),/checksum/);
  const destination=courses.createCourse('Defaults');scope.withCourse(destination.id,()=>{
    const result=importer.importAnkiPackage(custom,'custom.apkg');assert.equal(result.requiresVerification,1);assert.equal(db.exportSnapshot().reviewLog.length,0);
    assert.equal(quality.getStudyCards().filter(c=>c.status==='draft').length,1);
  });
  const mediaStore=await env.load('ankiMedia');
  const mediaRoute=await env.route('app/api/anki/packages/[hash]/media/[name]/route.ts','media-route');
  const imported=scope.withCourse(destination.id,()=>quality.getStudyCards().find(card=>card.presentation?.frontHtml.includes('diagram.png')));
  assert(imported?.presentation,'Imported HTML is retained for safe rich rendering');
  const hash=imported.presentation.packageHash;
  scope.withCourse(destination.id,()=>{
    assert.equal(mediaStore.ankiMedia(hash,'diagram.png').bytes.toString(),'image fixture');
    assert.equal(mediaStore.ankiMedia(hash,'../diagram.png'),undefined);
    assert.equal(mediaStore.ankiMedia(hash,'evil.html'),undefined);
  });
  const mediaResponse=await mediaRoute.GET(new Request(`http://localhost/api/anki/packages/${hash}/media/diagram.png?courseId=${destination.id}`),{params:Promise.resolve({hash,name:'diagram.png'})});
  assert.equal(mediaResponse.status,200);assert.equal(mediaResponse.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(await mediaResponse.text(),'image fixture');
  assert.equal((await mediaRoute.GET(new Request(`http://localhost/api/anki/packages/${hash}/media/diagram.png?courseId=${other.id}`),{params:Promise.resolve({hash,name:'diagram.png'})})).status,404,'A package cannot leak into another course');
  scope.withCourse(destination.id,()=>{quality.saveStudyCard({...imported,answer:'My corrected answer'});assert.equal(quality.getStudyCards().find(c=>c.id===imported.id).presentation,undefined,'Editing text invalidates stale imported HTML');});
  assert.throws(()=>zip.readZip(zip.writeZip(new Map([['../escape',Buffer.from('x')]]))),/Unsafe/);
  const corrupted=Buffer.from(exported.bytes);corrupted[35]^=1;assert.throws(()=>zip.readZip(corrupted));
  assert.throws(()=>zip.readZip(exported.bytes,10),/limit/);
  assert.throws(()=>anki.parseAnkiPackage(zip.writeZip(new Map([['collection.anki21b',Buffer.from('new format')]]))),/older versions/);
  const importRoute=await env.route('app/api/anki/import/route.ts','anki-route');
  const form=new FormData();form.set('file',new File([exported.bytes],'fixture.apkg'));form.set('preview','true');
  assert.equal((await importRoute.POST(new Request('http://localhost/api/anki/import',{method:'POST',body:form}))).status,200);
  console.log('PASS: bounded ZIP/CRC, APKG transport, Basic/reverse/cloze, media quarantine and preservation, explicit unsupported format, optional histories, stable IDs, protected reimports, preview, rollback-compatible backups and course isolation. No model calls.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
