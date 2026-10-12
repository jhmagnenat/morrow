import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';

const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb');
const connection=db.openDb(),originalPrepare=connection.prepare.bind(connection),originalExec=connection.exec.bind(connection);
try{
  db.insertNotion({label:'Original concept',domain:'Test',definition:'An existing concept.',sources:[],status:'draft'});
  let written=false;
  connection.prepare=sql=>{
    if(sql==='SELECT * FROM passages'&&!written){
      written=true;
      const code=`const db=await import(${JSON.stringify(pathToFileURL(path.join(env.workspace,'db.mjs')).href)});const q=await import(${JSON.stringify(pathToFileURL(path.join(env.workspace,'qualityDb.mjs')).href)});const n=db.insertNotion({label:'Concurrent concept',domain:'Test',definition:'Inserted by another process.',sources:[],status:'draft'});q.saveStudyCard({id:'concurrent-card',cardType:'notion',notionId:n.id,question:'What is concurrent?',answer:'Another process wrote it.',example:'',kind:'definition',objective:'Concurrency',status:'draft',evidence:[],warnings:[],userEdited:false,model:'fixture',promptVersion:'fixture'});for(const conn of globalThis.__courseDbs.values())conn.close();`;
      const writer=spawnSync(process.execPath,['--input-type=module','-e',code],{env:process.env,encoding:'utf8',timeout:10000});
      assert.equal(writer.status,0,writer.stderr);
    }
    return originalPrepare(sql);
  };
  const snapshot=db.exportSnapshot();connection.prepare=originalPrepare;
  assert(written);assert.equal(snapshot.notions.length,1);
  assert.equal(snapshot.quality.study_cards.length,0,'A backup cannot mix old concepts with cards from a newer SQLite commit');
  assert.equal(db.getGraph().notions.length,2);assert.equal(quality.getStudyCards().length,1,'The concurrent writer succeeds while the WAL reader is open');
  const before=db.exportSnapshot();
  connection.exec=sql=>{if(sql==='DELETE FROM vocabulary_cards;')throw Error('fixture reset failure');return originalExec(sql);};
  assert.throws(()=>db.resetAllData(),/fixture reset failure/);connection.exec=originalExec;
  const after=db.exportSnapshot();assert.deepEqual(after.notions,before.notions);assert.deepEqual(after.quality,before.quality,'A partial reset rolls back cards, receipts and claims together');
  assert.equal(connection.isTransaction,false);
  connection.exec('BEGIN IMMEDIATE');db.exportSnapshot();assert.equal(connection.isTransaction,true,'Snapshot does not commit its caller transaction');connection.exec('ROLLBACK');
  console.log('PASS: real concurrent-process WAL writes, internally consistent backup, writer progress, atomic reset rollback and preserved outer transactions. No model calls.');
}finally{connection.prepare=originalPrepare;connection.exec=originalExec;for(const conn of globalThis.__courseDbs?.values()??[])conn.close();process.chdir(env.root);}
