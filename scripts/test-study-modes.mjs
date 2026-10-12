import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const source=await readFile('lib/studyModes.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {notionRecallCards}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
const make=(id,kind,extra={})=>({cardId:id,notion:{id:'topic',domain:'Insurance'},card:{kind,...extra}});
const definition=make('definition','definition'),mechanism=make('mechanism','mechanism'),comparison=make('comparison','comparison'),application=make('application','application'),imported=make('imported','definition',{presentation:{packageHash:'a'.repeat(64)}});
const input=[definition,mechanism,comparison,application,imported];
assert.deepEqual(notionRecallCards(input),[definition]);
assert.equal(notionRecallCards(input)[0],definition,'Presentation reuses the exact card identity and scheduling');
assert.equal(input.length,5,'Q&A retains all original questions without mutation');
const env=await isolatedModules(DATABASE_MODULES),db=await env.load('db'),quality=await env.load('qualityDb');
try{
  const notion=db.insertNotion({label:'Adverse selection',domain:'Insurance',definition:'Higher-risk buyers are more likely to seek coverage.',status:'validated',sources:[]});
  for(const [id,kind] of [['a-mechanism','mechanism'],['z-definition','definition']])quality.saveStudyCard({id,cardType:'notion',notionId:notion.id,kind,question:kind==='definition'?'What is adverse selection?':'Why does adverse selection affect an insurer?',answer:notion.definition,example:'',objective:id,status:'ready',evidence:[],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
  assert.deepEqual(db.getDueNotions(1,'notions').map(c=>c.cardId),['z-definition'],'Notions is filtered before applying the session limit');
  assert.equal(db.getDueNotions(10).length,2,'Q&A retains definitions and mechanisms');
  db.gradeCard('notion','z-definition','good');
  assert.equal(db.getDueNotions(10,'notions').length,0);
  assert.deepEqual(db.getDueNotions(10).map(c=>c.cardId),['a-mechanism'],'Grading a definition updates the shared Q&A schedule');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
console.log('PASS: pure definition selection before session limits, shared review scheduling, preserved identities and imported/reasoning questions retained in Q&A.');
