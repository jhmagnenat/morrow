// Explicit --live: exercise the real running server on two source pages, in a
// temporary course. The active course and user's documents are untouched.
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules} from './isolated-modules.mjs';
if(!process.argv.includes('--live'))throw new Error('Explicit --live required for model calls.');
const base='http://127.0.0.1:3000',root=process.cwd(),env=await isolatedModules(['courses','courseScope','db','qualityDb','contentQuality','coursePedagogy','srs','xp','mastery']),courses=await env.load('courses');
const fixture=process.argv.includes('--fixture=calculus');
const capability=await fetch(`${base}/api/documents/unknown/generate`);
if(capability.status!==404)throw new Error('Restart the server: background generation route is not loaded. No model calls made.');
const sourceDb=new DatabaseSync('data/encyclopedia.db',{readOnly:true}),source=sourceDb.prepare('SELECT * FROM documents ORDER BY rowid LIMIT 1').get();sourceDb.close();
if(!source || !/^[a-zA-Z0-9_-]+$/.test(source.id))throw new Error('No valid source document.');
const bytes=fixture?null:await readFile(path.join(root,'data/uploads/default',`${source.id}.pdf`));
const activeBefore=(await (await fetch(`${base}/api/courses`,{signal:AbortSignal.timeout(30000)})).json()).activeCourseId;
const selectedPages=(process.argv.find(arg=>arg.startsWith('--pages='))?.slice(8)??(fixture?'1':'23,32')).split(',').map(Number);
if(!selectedPages.length || selectedPages.length>3 || selectedPages.some(p=>!Number.isInteger(p)||p<1||p>source.page_count))throw new Error('Select 1 to 3 valid pages.');
const course=courses.createCourse(`Temporary generation evaluation ${Date.now()}`);
const headers={'X-Course-Id':course.id};
const report={isolated:true,sourceTitle:fixture?'Derivative: average and local rate':source.title,selectedPages,startedAt:new Date().toISOString(),activeBefore};
const api=async(url,init={})=>{const res=await fetch(base+url,{signal:AbortSignal.timeout(60000),...init,headers:{...headers,...init.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error??`HTTP ${res.status}`);return data;};
try {
  let document;
  if(fixture){
    const db=await env.load('db'),scope=await env.load('courseScope');
    scope.withCourse(course.id,()=>{
      document=db.insertDocument({title:report.sourceTitle,kind:'course',pageCount:1});
      report.fixtureSource='For f(x)=x², the average rate over a nonzero increment h is [f(x+h)-f(x)]/h = 2x+h. The derivative is the limit as h tends to zero: f′(x)=2x. At x=3, the local rate is 6. The derivative is not the exact output change for every finite increment: Δf=2xh+h²; the linear approximation 2xh omits h². x and h are real numbers; the quotient requires h≠0 before taking its limit.';
      db.insertPassages([{documentId:document.id,page:1,ordinal:0,text:report.fixtureSource}]);
    });
  }else{
    const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),'source.pdf');form.append('title',source.title);form.append('kind','course');
    ({document}=await api('/api/documents',{method:'POST',body:form}));
  }
  const started=Date.now(),{job:initial}=await api(`/api/documents/${document.id}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'strict',enrichment:false,background:true,pages:report.selectedPages})});
  if(!initial)throw new Error('Server did not return a background job.');
  report.acknowledgedMs=Date.now()-started;console.log(JSON.stringify({status:initial.status,acknowledgedMs:report.acknowledgedMs}));
  let job=initial,last='';
  while(job.status==='running'){
    if(Date.now()-started>8*60_000)throw new Error('Evaluation deadline reached; inspect the saved server job before starting more model calls.');
    await new Promise(resolve=>setTimeout(resolve,2000));
    ({job}=await api(`/api/documents/${document.id}/generate`));
    if(job.updatedAt!==last){last=job.updatedAt;console.log(JSON.stringify({status:job.status,ready:job.completedPages,reviewPages:job.reviewPages,requests:job.requests}));}
  }
  report.elapsedMs=Date.now()-started;report.job=job;
  const generatedDb=new DatabaseSync(path.join(root,'data',`${course.id}.db`),{readOnly:true});
  try{report.cards=generatedDb.prepare('SELECT payload FROM study_cards').all().map(row=>JSON.parse(row.payload));}finally{generatedDb.close();}
  report.graph=await api('/api/graph');report.quality=await api('/api/quality');
  report.activeAfter=(await (await fetch(`${base}/api/courses`)).json()).activeCourseId;
  if(report.activeAfter!==activeBefore)throw new Error('Active course changed during evaluation.');
}catch(error){report.error=error instanceof Error?error.message:String(error);console.log(report.error);}
finally {
  await writeFile(path.join(root,`data/reports/generation-v11-${fixture?'calculus':'server'}-evaluation.json`),JSON.stringify(report,null,2).replace(/\bsk-[A-Za-z0-9_-]+/g,'[redacted]'));
  // Delete only the explicitly created temporary course through its scoped API.
  const found=courses.listCourses().find(c=>c.id===course.id);
  if(report.error && found)await api('/api/graph/clear',{method:'POST'});
  if(found?.name.startsWith('Temporary generation evaluation '))await api(`/api/courses/${course.id}`,{method:'DELETE'});
}
