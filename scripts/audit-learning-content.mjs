import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isolatedModules} from './isolated-modules.mjs';

// Read-only review of the real course, without migrations or provider calls.
// Usage: node scripts/audit-learning-content.mjs [--database path/to/course.db]
const root=process.cwd(),args=process.argv.slice(2),index=args.indexOf('--database');
if(index>=0&&!args[index+1])throw Error('--database requires a SQLite file');
const file=path.resolve(index>=0?args[index+1]:path.join(root,'data','encyclopedia.db'));
const env=await isolatedModules(['reliabilityReport']);
const {reliabilityReport}=await env.load('reliabilityReport');
const db=new DatabaseSync(file,{readOnly:true});
let report;
try{
  db.exec('BEGIN');
  const metadata=new Map(db.prepare('SELECT notion_id,clair FROM notion_metadata').all().map(row=>[row.notion_id,row.clair?JSON.parse(row.clair):undefined]));
  const notions=db.prepare('SELECT id,label,definition,explanation FROM notions WHERE mapping_visible=1').all().map(n=>({...n,clair:metadata.get(n.id)}));
  const documents=db.prepare('SELECT id,title,page_count pageCount FROM documents').all();
  const course=path.basename(file)==='encyclopedia.db'?'default':path.basename(file,'.db');
  for(const document of documents)try{const bytes=await readFile(path.join(path.dirname(file),'uploads',course,`${document.id}.pdf`));document.pdfSha256=createHash('sha256').update(bytes).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;}
  const passages=db.prepare('SELECT document_id documentId,page,text FROM passages ORDER BY document_id,page,ordinal').all();
  const cards=db.prepare('SELECT payload FROM study_cards').all().map(row=>JSON.parse(row.payload));
  report=reliabilityReport({notions,documents,passages,cards});
  db.exec('COMMIT');
}finally{db.close();}
const output=path.join(root,'data','reports',`learning-content-audit-${Date.now()}.json`);
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({summary:report.summary,lessons:report.lessons,report:output,limitations:report.limitations},null,2));
