import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
import {notes,groups,excludedLabels} from './insurance-notes-reviewed.mjs';
const baseline=JSON.parse(await readFile('data/reports/pedagogy-audit-snapshot.json','utf8'));
const documentIds={intro:'4fe379c0-a193-4ddb-acae-60f003af1972',finance:'216268ae-dbe2-4935-8b65-7e7c5dfbed87'};
const plan={notes:notes.map(n=>{
  const old=baseline.graph.notions.find(v=>v.label===n.label);
  const references=[...n.intro.map(page=>({documentId:documentIds.intro,page})),...n.finance.map(page=>({documentId:documentIds.finance,page}))];
  const evidence=references.map(s=>{
    const document=baseline.snapshot.documents.find(d=>d.id===s.documentId);
    const quote=document.passages.filter(p=>p.page===s.page).map(p=>p.text).join('\n');
    return {...s,quote,...(s.documentId===documentIds.intro && n.visual.includes(s.page)?{visualDescription:'Full slide image reviewed against the chart title, axes, labels, figures and source note in this course audit.'}:{})};
  });
  const renamed={'Insurers and Their Market Shares':'European Insurers by Premium Income (2022)','Insurance Company Structure and Functions':'How Insurance Company Functions Work Together','Insurance Products in Practice':'Reading the Insurance Product Map'};
  return {originalLabel:n.label,label:renamed[n.label]??n.label,definition:n.definition,explanation:`${n.intuition}\n\nIn the workflow: ${n.workflow}\n\nMore precisely: ${n.technical}\n\nDo not confuse:\n\n${n.confusions.map(c=>'• '+c).join('\n\n')}`,courseContext:n.workflow,evidence,expectedExplanation:old?.explanation,create:!old};
}),exclude:baseline.graph.notions.filter(n=>excludedLabels.includes(n.label)).map(n=>({id:n.id,expectedExplanation:n.explanation??''})),groups};
await mkdir('data/backups',{recursive:true});
const backup=await fetch('http://localhost:3000/api/export',{headers:{'X-Course-Id':'default'}});
if(!backup.ok)throw Error('Cannot save full backup');
await writeFile(`data/backups/before-intuition-review-${Date.now()}.json`,await backup.text(),'utf8');
await writeFile('data/reports/reviewed-insurance-plan.json',JSON.stringify(plan,null,2),'utf8');
// Transpilation only; the real course is selected explicitly below. No chdir.
const env=await isolatedModules([...DATABASE_MODULES,'reviewedCourseNotes']);
const scope=await env.load('courseScope');
const review=await env.load('reviewedCourseNotes');
try{
  const result=scope.withCourse('default',()=>review.applyReviewedCourseNotes(plan));
  await writeFile('data/reports/reviewed-insurance-result.json',JSON.stringify(result,null,2),'utf8');
  console.log(JSON.stringify(result));
}finally{for(const db of globalThis.__courseDbs?.values()??[])db.close();}
