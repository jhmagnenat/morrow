// Real local-server evaluation in a separate course. No automatic quality score.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const root=process.cwd(),base='http://127.0.0.1:3000';
const selected=(process.argv.find(a=>a.startsWith('--pages='))?.slice(8)??'20,23').split(',').map(Number);
if(selected.length>38||selected.some(p=>!Number.isInteger(p)||p<1))throw Error('Select valid source pages');
if(!process.argv.includes('--live')){console.log(JSON.stringify({pages:selected,maximumCalls:selected.length*5,isolated:true}));process.exit(0);}
const original=new DatabaseSync(path.join(root,'data/encyclopedia.db'),{readOnly:true});
const document=original.prepare('SELECT id,title,page_count FROM documents ORDER BY created_at DESC LIMIT 1').get();
const pages=original.prepare('SELECT page,text,layout FROM source_pages WHERE document_id=? ORDER BY page').all(document.id).map(p=>({...p,layout:p.layout?JSON.parse(p.layout):undefined}));original.close();
const active=(await (await fetch(base+'/api/courses')).json()).activeCourseId;
const env=await isolatedModules([...DATABASE_MODULES,'sourceDocument']);
process.env.MORROW_DATA_DIR=path.join(root,'data');
const courses=await env.load('courses'),scope=await env.load('courseScope'),db=await env.load('db'),storage=await env.load('pdfStorage'),source=await env.load('sourceDocument');
const course=courses.createCourse('Temporary direct-card quality evaluation '+Date.now());
const headers={'X-Course-Id':course.id,'Content-Type':'application/json'};
const report={version:'direct-cards-v7-selected-knowledge',selected,activeBefore:active,startedAt:new Date().toISOString(),complete:false,humanQualityScore:null};
const api=async(url,init={})=>{const response=await fetch(base+url,{signal:AbortSignal.timeout(60000),...init,headers:{...headers,...init.headers}});const result=await response.json();if(!response.ok)throw Error(result.error??'HTTP '+response.status);return result;};
try{
 let doc;scope.withCourse(course.id,()=>{
  doc=db.insertDocument({title:document.title,kind:'course',pageCount:Number(document.page_count)});
  db.insertPassages(pages.map(p=>({documentId:doc.id,page:p.page,ordinal:0,text:p.text})));
  const pdf=fs.readFileSync(path.join(root,'data/uploads/default',document.id+'.pdf'));
  storage.savePdfFile(doc.id,Uint8Array.from(pdf).buffer);source.storeSourceDocument(db.openDb(),doc.id,pages,source.originalPdfHash(pdf));
 });
 const started=Date.now();report.jobs=[];
 for(let offset=0;offset<selected.length;offset+=3){
  const chunk=selected.slice(offset,offset+3),chunkStarted=Date.now();let {job}=await api('/api/documents/'+doc.id+'/generate',{method:'POST',body:JSON.stringify({mode:'strict',enrichment:false,background:true,pages:chunk,cardDetail:process.argv.includes('--comprehensive')?'comprehensive':'key-ideas'})});
  if(!job)throw Error('Expected durable generation job');let last='';
  while(job.status==='running'){
   if(Date.now()-chunkStarted>240000)throw Error('Evaluation deadline; temporary course retained until job stops');
   await new Promise(r=>setTimeout(r,2000));({job}=await api('/api/documents/'+doc.id+'/generate'));
   if(job.updatedAt!==last){last=job.updatedAt;console.log(JSON.stringify({pages:chunk,status:job.status,requests:job.requests,ready:job.readyCards,covered:job.coveredPages}));}
  }
  report.jobs.push(job);report.job=job;
 }
 report.elapsedMs=Date.now()-started;
 const result=new DatabaseSync(path.join(root,'data',course.id+'.db'),{readOnly:true});
 report.runs=result.prepare('SELECT payload FROM generation_runs').all().map(r=>JSON.parse(r.payload));report.cards=result.prepare('SELECT payload FROM study_cards').all().map(r=>JSON.parse(r.payload));report.pages=result.prepare('SELECT payload FROM page_analysis').all().map(r=>JSON.parse(r.payload));report.artifacts=result.prepare("SELECT value FROM quality_settings WHERE key LIKE 'direct-card-run:%'").all().map(r=>JSON.parse(r.value));result.close();
 report.complete=true;report.activeAfter=(await (await fetch(base+'/api/courses')).json()).activeCourseId;
 if(report.activeAfter!==active)throw Error('Active course changed');
}catch(error){report.error=error.message;console.log(report.error);}
finally{
 fs.writeFileSync(path.join(root,'references/evaluation/direct-server-latest.json'),JSON.stringify(report,null,2));
 for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
 if(report.complete){fs.writeFileSync(path.join(root,'references/evaluation/direct-server-'+Date.now()+'.json'),JSON.stringify(report,null,2));}
 if(report.complete)await api('/api/courses/'+course.id,{method:'DELETE'});
}
if(!report.complete)process.exitCode=1;
