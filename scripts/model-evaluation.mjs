import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import nextEnv from '@next/env';
import {isolatedModules} from './isolated-modules.mjs';
import {evaluationHtml} from './model-evaluation-report.mjs';

const root=process.cwd();nextEnv.loadEnvConfig(root,false,{info(){},error(){}});
const flags=new Map(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const command=process.argv[2]??'prepare';
const originalData=path.resolve(process.env.MORROW_DATA_DIR??path.join(root,'data'));
const directory=path.resolve(flags.get('--case')??path.join(originalData,'model-evaluation','pilot'));
const manifestFile=path.join(directory,'case.json');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
function json(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);}
const profiles={sol:{provider:'openai',model:'gpt-6.1-sol',input:2,output:10},sonnet:{provider:'anthropic',model:'claude-sonnet-5-5',input:2,output:10}};
async function runtime(){return isolatedModules(['llm','pdf','teacherEvaluation']);}
async function prepare(){
  if(fs.existsSync(manifestFile))throw Error('This case already exists. It is frozen for comparison; use --case=another-directory to prepare another.');
  const env=await runtime(),pdf=await env.load('pdf'),sections=await env.load('sourceSections');
  let pdfFile,title;
  if(flags.has('--pdf')){pdfFile=path.resolve(flags.get('--pdf'));title=path.basename(pdfFile);}
  else{
    const course=flags.get('--course')??'default';if(!/^[a-zA-Z0-9_-]+$/.test(course))throw Error('Invalid course identifier.');
    const filename=path.join(originalData,course==='default'?'encyclopedia.db':`${course}.db`);
    const db=new DatabaseSync(filename,{readOnly:true});
    let document;try{document=flags.has('--document')?db.prepare('SELECT id,title FROM documents WHERE id=?').get(flags.get('--document')):db.prepare('SELECT id,title FROM documents ORDER BY created_at DESC LIMIT 1').get();}finally{db.close();}
    if(!document)throw Error('No imported course found. Specify --pdf=path-to-slides.pdf or --course=course-id.');
    pdfFile=path.join(originalData,'uploads',course,document.id+'.pdf');title=document.title;
  }
  const bytes=fs.readFileSync(pdfFile),pages=await pdf.extractPdfPages(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const teaching=pages.filter(p=>!sections.administrativePageReason(p,pages));
  const selected=[];
  function pick(reason,predicate){const candidate=teaching.find(p=>!selected.some(s=>s.page===p.page)&&predicate(p));if(candidate)selected.push({page:candidate.page,reason});}
  if(flags.has('--pages'))for(const n of String(flags.get('--pages')).split(',').map(Number))selected.push({page:n,reason:'Selected by reviewer'});
  else{
    pick('Definition / recall',p=>/\b(?:definition|defined|means|refers to|définition)\b/i.test(p.text));
    pick('Mechanism / causal explanation',p=>/\b(?:because|process|mechanism|pooling|mécanisme|fonctionnement)\b/i.test(p.text));
    pick('Figure / visual reading',p=>sections.requiresSourceImage(p));
    pick('Calculation / application',p=>/[=<>]|\b(?:calculate|formula|premium|calcul|équation)\b/i.test(p.text));
    pick('Incomplete slide / missing context',p=>p.text.trim().length<500);
    for(const p of teaching)if(selected.length<5&&!selected.some(s=>s.page===p.page))selected.push({page:p.page,reason:'Additional teaching sample'});
  }
  if(!selected.length||selected.length>5||new Set(selected.map(p=>p.page)).size!==selected.length||selected.some(s=>!Number.isInteger(s.page)||!pages.some(p=>p.page===s.page)))throw Error('Choose 1–5 distinct existing PDF pages.');
  const manifest={version:1,id:randomUUID(),title,createdAt:new Date().toISOString(),pdfSha256:hash(bytes),pages,selected,
    profiles,pricingCheckedAt:'2026-10-11',budgetUsd:2,maxPaidCalls:40,outputTokenLimit:8192,reasoningEffort:'medium',coverage:'key-ideas',
    expectations:selected.map(s=>({page:s.page,objectives:[],requiredContext:[],mustNotInvent:[]})),
    note:'Fill expectations before comparing quality. Model judgments are not human acceptance.'};
  const referenceFile=path.join(root,'references','evaluation','teacher-pilot-expectations.json');
  if(fs.existsSync(referenceFile)){
    const reference=JSON.parse(fs.readFileSync(referenceFile,'utf8'));
    if(reference.pdfSha256===manifest.pdfSha256)manifest.expectations=manifest.expectations.map(e=>reference.expectations.find(r=>r.page===e.page)??e);
  }
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'source.pdf'),bytes);
  for(const selectedPage of selected){const image=await pdf.renderPdfPageAsDataUrl(bytes,selectedPage.page);const imageFile=path.join(directory,'images',`p${selectedPage.page}.png`);fs.mkdirSync(path.dirname(imageFile),{recursive:true});fs.writeFileSync(imageFile,Buffer.from(image.split(',')[1],'base64'));}
  json(manifestFile,manifest);
  fs.writeFileSync(path.join(directory,'slides.html'),evaluationHtml({runId:'not-generated',model:'Not generated',title:manifest.title,status:'prepared',usage:{requests:0},costUsd:0,outputs:[],lessons:[]},manifest,'.'));
  console.log(`Prepared ${selected.length} slides, zero API calls. Case: ${manifestFile}\nInspect slides.html and expectations in case.json, then run evaluation:check. The original course and review history were not modified.`);
}
function loadCase(){
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(hash(fs.readFileSync(path.join(directory,'source.pdf')))!==manifest.pdfSha256)throw Error('Frozen PDF changed; prepare a new case.');
  if(!manifest.selected.length||manifest.selected.length>5||new Set(manifest.selected.map(p=>p.page)).size!==manifest.selected.length||manifest.selected.some(p=>!manifest.pages.some(source=>source.page===p.page)))throw Error('Invalid sample.');
  if(!Number.isFinite(manifest.budgetUsd)||manifest.budgetUsd<=0||manifest.budgetUsd>5||!Number.isInteger(manifest.maxPaidCalls)||manifest.maxPaidCalls<1||manifest.maxPaidCalls>40||!Number.isInteger(manifest.outputTokenLimit)||manifest.outputTokenLimit<2048||manifest.outputTokenLimit>16384||!['low','medium','high'].includes(manifest.reasoningEffort)||!['key-ideas','comprehensive'].includes(manifest.coverage))throw Error('Invalid pilot limits (maximum $5 and 40 calls).');
  return manifest;
}
function check(manifest){
  for(const name of ['sol','sonnet']){const profile=profiles[name];console.log(`${name}: ${profile.model}; API key ${process.env[profile.provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY']?'present':'missing'} (balance not checked).`);}
  const missing=manifest.selected.filter(s=>!manifest.expectations.find(e=>e.page===s.page)?.objectives.some(o=>typeof o==='string'&&o.trim()));
  console.log(`Sample: ${manifest.selected.map(s=>s.page).join(', ')}; cumulative pilot ceiling $${manifest.budgetUsd}; ${manifest.maxPaidCalls} paid calls maximum.\nExpected objectives: ${missing.length?'missing for pages '+missing.map(s=>s.page).join(', '):'complete'}. No provider requests made.`);
  return missing.length===0;
}
async function run(manifest){
  if(flags.get('--live')!==true){check(manifest);console.log('Dry run only. Add --live explicitly to send this sample to the selected provider.');return;}
  const name=flags.get('--model');if(!profiles[name])throw Error('Select --model=sol or --model=sonnet.');
  if(!check(manifest))throw Error('Fill expected objectives for each selected slide before paid testing.');
  const profile=profiles[name],apiKey=profile.provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY';
  if(!process.env[apiKey])throw Error(`Missing ${apiKey} in .env.local; no requests sent.`);
  const env=await runtime();
  process.env.LLM_PROVIDER=profile.provider;
  process.env.OPENAI_MODEL=profile.model;process.env.ANTHROPIC_MODEL=profile.model;
  process.env.OPENAI_AUDIT_MODEL=profile.model;process.env.ANTHROPIC_AUDIT_MODEL=profile.model;
  process.env.MORROW_LLM_MAX_USD=String(manifest.budgetUsd);process.env.MORROW_LLM_BUDGET_SESSION=manifest.id;
  process.env.MORROW_INPUT_USD_PER_MILLION=String(profile.input);process.env.MORROW_OUTPUT_USD_PER_MILLION=String(profile.output);
  process.env.MORROW_MAX_OUTPUT_TOKENS=String(manifest.outputTokenLimit);process.env.MORROW_REASONING_EFFORT=manifest.reasoningEffort;
  process.env.MORROW_DATA_DIR=directory;
  const llm=await env.load('llm'),engine=await env.load('professorGeneration'),sections=await env.load('sourceSections');
  const catalog=await env.load('sourceCatalog'),pdf=await env.load('pdf'),telemetry=await env.load('llmTelemetry'),budget=await env.load('modelExperimentBudget');
  const promptsHash=hash(engine.professorPrompts),contract={source:manifest.pdfSha256,sourcePages:hash(manifest.pages),selected:manifest.selected,expectations:manifest.expectations,promptsHash,coverage:manifest.coverage,outputTokenLimit:manifest.outputTokenLimit,reasoningEffort:manifest.reasoningEffort};
  const protocolHash=hash(contract),lock=path.join(directory,'live.lock');
  const lockHandle=fs.openSync(lock,'wx');fs.writeFileSync(lockHandle,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  const runId=randomUUID(),runDir=path.join(directory,'runs',name+'-'+runId),stats={requests:0,inputTokens:0,outputTokens:0,elapsedMs:0,failures:0};
  const report={version:1,runId,profile:name,model:profile.model,pricing:{inputUsdPerMillion:profile.input,outputUsdPerMillion:profile.output,checkedAt:'2026-10-11'},protocolHash,promptsHash,caseId:manifest.id,title:manifest.title,status:'running',startedAt:new Date().toISOString(),outputs:[],lessons:[],usage:stats,costUsd:0,cardIds:[],objectiveIds:[],expectations:manifest.expectations};
  for(const e of manifest.expectations)for(const [index] of e.objectives.entries())report.objectiveIds.push(`p${e.page}o${index}`);
  function save(){json(path.join(runDir,'result.json'),report);fs.writeFileSync(path.join(runDir,'review.html'),evaluationHtml(report,manifest,path.relative(runDir,directory).replaceAll('\\','/')));}
  const protocolFile=path.join(directory,'protocol.json');
  try{
    if(fs.existsSync(protocolFile)&&JSON.parse(fs.readFileSync(protocolFile,'utf8')).hash!==protocolHash)throw Error('Source, expectations, prompts or generation settings changed. Use a new case to compare identical protocols.');
    if(!fs.existsSync(protocolFile))json(protocolFile,{hash:protocolHash,contract});
    const model={async complete(system,input,tool,description,schema,images){
      const cacheKey=hash({protocolHash,model:profile.model,system,input,tool,schema,images:images.map(hash)}),cacheFile=path.join(directory,'cache',cacheKey+'.json');
      if(fs.existsSync(cacheFile))return JSON.parse(fs.readFileSync(cacheFile,'utf8'));
      const sessionCalls=budget.budgetSnapshot().calls.filter(c=>c.session===manifest.id);
      if(sessionCalls.length>=manifest.maxPaidCalls)throw Error('Pilot request ceiling reached.');
      console.log(`${name}: ${tool}; ${stats.requests+1} new call this run.`);
      const value=await llm.structuredCompletion(system,JSON.stringify(input),tool,description,schema,images);
      json(cacheFile,value);return value;
    }};
    const bytes=fs.readFileSync(path.join(directory,'source.pdf'));
    const teachingPages=manifest.pages.filter(p=>!sections.administrativePageReason(p,manifest.pages));
    await telemetry.withLlmTelemetry(stats,async()=>{
      for(const batch of sections.planSourceBatches(manifest.selected.map(s=>s.page),manifest.pages)){
        const primary=teachingPages.filter(p=>batch.pages.includes(p.page));if(!primary.length)continue;
        const context=sections.sourceContext(primary.map(p=>p.page),teachingPages);
        const needsVisual=primary.some(p=>/top\s*\d|according to.{0,40}(?:chart|figure)|graphique|diagramme/i.test(p.text));
        const imagePages=[...new Set([...primary.filter(sections.requiresSourceImage),...(needsVisual?context.filter(p=>!primary.some(s=>s.page===p.page)&&sections.requiresSourceImage(p)):[])].map(p=>p.page))];
        const images=await pdf.renderPdfPagesAsDataUrls(bytes,imagePages);
        const source={documentId:manifest.id,title:manifest.title,pdfSha256:manifest.pdfSha256,revision:hash({pdf:manifest.pdfSha256,pages:manifest.pages}),reviewerLabel:llm.currentProviderLabel(true),courseOutline:manifest.pages.slice(0,3).map(p=>p.text).join('\n').slice(0,2000),primaryPages:primary.map(p=>p.page),snippets:catalog.sourceCatalog(context),imagePages,images,
          layouts:primary.filter(p=>p.layout).map(p=>({page:p.page,width:p.layout.width,height:p.layout.height,blocks:p.layout.blocks.map(({text,x,y,width,height})=>({text,x,y,width,height}))})),uncertainOcrPages:manifest.pages.filter(p=>p.layout?.origin==='ocr'&&p.layout.blocks.some(b=>(b.confidence??0)<80||/\d/.test(b.text)&&(b.confidence??0)<90)).map(p=>p.page)};
        const output=await engine.generateProfessorCourse(source,model,manifest.coverage,lesson=>{report.lessons.push(lesson);save();});
        report.outputs.push({pages:source.primaryPages,...output});save();
      }
    });
    report.status='complete';
  }catch(error){report.status='failed';report.error=error.message;console.error('Stopped:',error.message);process.exitCode=1;}
  finally{
    report.finishedAt=new Date().toISOString();report.cardIds=report.outputs.flatMap((o,b)=>o.cards.map((_,c)=>`b${b}c${c}`));
    report.newCostUsd=(stats.inputTokens*profile.input+stats.outputTokens*profile.output)/1e6;
    const snapshot=budget.budgetSnapshot();report.budget={...snapshot,calls:snapshot.calls.filter(c=>c.session===manifest.id)};
    const committed=report.budget.calls.reduce((sum,c)=>sum+Number(c.charged_usd),0);report.budget.committedUsd=committed;
    // Attribute the original model cost to cached results as well. A free replay
    // must not make a model appear cheaper than the run that paid for its output.
    report.costUsd=report.budget.calls.filter(c=>c.model===profile.model).reduce((sum,c)=>sum+Number(c.charged_usd),0);
    save();fs.closeSync(lockHandle);fs.unlinkSync(lock);
    console.log(`Report: ${path.join(runDir,'review.html')}\nNew reported tokens this run: $${report.newCostUsd.toFixed(4)}. Model cost attributed to this pilot: $${report.costUsd.toFixed(4)}. Pilot committed (unknown reservations included): $${committed.toFixed(4)}. Human evaluation pending.`);
  }
}
async function score(){
  const runFile=path.resolve(flags.get('--run')??'');const reviewFile=path.resolve(flags.get('--review')??'');
  if(!flags.has('--run')||!flags.has('--review'))throw Error('Use score --run=path/result.json --review=path/human-review.json.');
  const report=JSON.parse(fs.readFileSync(runFile,'utf8')),review=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
  const env=await runtime(),evaluator=await env.load('teacherEvaluation');
  const summary=evaluator.evaluateTeacherRun(report,review);json(path.join(path.dirname(runFile),'human-summary.json'),{runId:report.runId,...summary});console.log(JSON.stringify(summary,null,2));
}
try{if(command==='prepare')await prepare();else if(command==='check')check(loadCase());else if(command==='run')await run(loadCase());else if(command==='score')await score();else throw Error('Commands: prepare, check, run, score.');}
catch(error){console.error(error.message);process.exitCode=1;}
