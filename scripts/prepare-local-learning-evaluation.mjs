import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules} from './isolated-modules.mjs';

// Read-only preparation, including all visible course concepts by default.
const root=process.cwd(),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0)return;const value=args[i+1];if(!value||value.startsWith('--'))throw Error(`${name} requires a value`);return value;};
const file=path.resolve(option('--database')??'data/encyclopedia.db'),course=option('--course')??(path.basename(file)==='encyclopedia.db'?'default':path.basename(file,'.db'));
if(!/^[a-zA-Z0-9_-]+$/.test(course))throw Error('Invalid course identifier');
const limit=Number(option('--limit')??100);
const env=await isolatedModules(['learningEvaluation']);
const {buildLearningEvaluation,scoreLearningEvaluation}=await env.load('learningEvaluation');
const db=new DatabaseSync(file,{readOnly:true});
let evaluation;
try{
  db.exec('BEGIN');
  const meta=new Map(db.prepare('SELECT * FROM notion_metadata').all().map(m=>[m.notion_id,m]));
  const refs=db.prepare('SELECT notion_id,document_id,page FROM notion_sources').all();
  const notions=db.prepare('SELECT id,label,definition,explanation,course_context courseContext FROM notions WHERE mapping_visible=1').all().map(n=>{const m=meta.get(n.id);return {...n,layer:m?.layer,evidence:m?.evidence?JSON.parse(m.evidence):[],clair:m?.clair?JSON.parse(m.clair):undefined,sources:refs.filter(r=>r.notion_id===n.id).map(r=>({documentId:r.document_id,page:r.page}))};});
  const docs=db.prepare('SELECT id,title,page_count pageCount FROM documents').all();
  const passages=db.prepare('SELECT document_id,page,ordinal,text,generated FROM passages ORDER BY document_id,page,ordinal').all();
  for(const doc of docs){doc.passages=passages.filter(p=>p.document_id===doc.id);try{doc.pdfBase64=(await readFile(path.join(path.dirname(file),'uploads',course,`${doc.id}.pdf`))).toString('base64');}catch(error){if(error.code!=='ENOENT')throw error;}}
  evaluation=buildLearningEvaluation({notions,documents:docs,quality:{study_cards:db.prepare('SELECT payload FROM study_cards').all()}},course,limit);
  db.exec('COMMIT');
}finally{db.close();}
const output=path.join(root,'data','reports',`independent-learning-evaluation-${Date.now()}.json`);
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evaluation,null,2),{flag:'wx'});
console.log(JSON.stringify({file:output,cases:evaluation.cases.length,unresolvedProvenanceCases:evaluation.cases.filter(c=>c.provenanceIssues.length).length,score:scoreLearningEvaluation(evaluation),instruction:'Ratings and criticalErrors are intentionally empty. A competent independent reviewer must fill them; preparation assigns no quality score.'},null,2));
