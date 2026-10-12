import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

process.env.MORROW_BENCHMARK_DIR=path.resolve('.next',`benchmark-test-${randomUUID()}`);
const core=await import('./core.mjs'),methods=await import('./methods.mjs'),runner=await import('./runner.mjs'),provider=await import('./provider.mjs');
await fs.mkdir(core.LAB,{recursive:true});
// A real minimal PDF exercises the reused parser and renderer, entirely offline.
function fixturePdf(){
  const stream='BT /F1 18 Tf 30 140 Td (Rectangle area is width multiplied by height.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n',offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(text);
}
const file=path.join(core.LAB,'fixture.pdf');await fs.writeFile(file,fixturePdf());
const manifest=await core.prepareDocument(file);manifest.implementationHash=await runner.implementationHash();
const directory=core.experimentDir(manifest.id);await core.writeJson(path.join(directory,'manifest.json'),manifest);
assert.equal(manifest.document.pages.length,1);assert(manifest.document.pages[0].text.includes('Rectangle'));
assert.equal(core.imageTokens(1024,1024),765);
const quote=provider.estimate(manifest);assert.deepEqual(quote.methods.map(m=>m.maximumCalls),[1,2,4]);assert(quote.conservativeCeilingUsd>quote.estimatedUsd);assert.equal(quote.approvalId,provider.estimate(manifest).approvalId);
await core.writeJson(path.join(directory,'quote.json'),quote);
await assert.rejects(runner.runExperiment(manifest.id,{approve:'wrong',maxUsd:10}),/explicit approval/);
await assert.rejects(runner.runExperiment(manifest.id,{approve:quote.approvalId,maxUsd:0}),/conservative allowance/);
await assert.rejects(runner.runExperiment(manifest.id,{approve:quote.approvalId,maxUsd:10}),/Validate essential knowledge/);
const pages=manifest.document.pages,ref={page:1,quote:'Rectangle area is width multiplied by height.',region:{x:0,y:0,width:0,height:0}};
const extraction={knowledge:['fact','rule','comparison'].map((kind,index)=>({statement:`Source fixture ${kind}`,conditions:[],kind,importance:3-index,sources:[ref]}))};
for(const method of ['A','B','C']){
  const stages=[],inputs=[];
  await methods.generateBatch(method,pages,{config:manifest.config,artifact:async()=>{},onCards:async()=>{},call:async req=>{stages.push(req.stage);inputs.push(req.pages);return req.stage==='extract'?extraction:{cards:[]};}});
  assert(stages.length===(method==='A'?1:method==='B'?2:4));assert(inputs.every(input=>input===pages),'Every stage receives exactly the same source batch');
}
assert.deepEqual(core.provenanceIssues([ref],pages),[]);
assert(core.provenanceIssues([{...ref,quote:'A fabricated guarantee'}],pages).length);
assert(core.provenanceIssues([{...ref,page:2}],pages).length);
assert(core.provenanceIssues([{...ref,quote:'',region:{x:.9,y:0,width:.3,height:1}}],pages).length);
const badIR=methods.compileKnowledge([{...extraction.knowledge[0],sources:[{...ref,quote:'Invented'}]}],pages);assert.equal(badIR.units.length,0);assert.equal(badIR.rejected.length,1);
const traces=[],transportCalls=[];
const caller=await provider.createCaller(manifest,directory,{budget:{remaining:10},onTrace:async trace=>traces.push(trace),transport:async input=>{
  transportCalls.push(input);return {model:manifest.config.model,system_fingerprint:'test-fingerprint',usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:40}},choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{arguments:JSON.stringify({cards:[]})}}]}}]};
}});
await caller({pages,input:{source:'fixture'},instruction:'Offline transport test',stage:'direct',schema:methods.cardSchema(pages,8)});
assert.equal(transportCalls[0].model,manifest.config.model);assert.equal(transportCalls[0].seed,manifest.config.seed);assert.equal(transportCalls[0].max_completion_tokens,manifest.config.maxOutputTokens);assert.equal(transportCalls[0].messages[1].content.filter(c=>c.type==='image_url').length,1);
assert.equal(traces[0].inputTokens,100);assert.equal(traces[0].cachedInputTokens,40);assert.equal(traces[0].costUsd,.0004);assert.equal(traces[0].uncachedEquivalentCostUsd,.00045);
let contacted=false;
const blocked=await provider.createCaller(manifest,directory,{budget:{remaining:0},onTrace:async()=>{},transport:async()=>{contacted=true;}});
await assert.rejects(blocked({pages,input:{},instruction:'Offline budget test',stage:'direct',schema:methods.cardSchema(pages,8)}),/allowance exhausted/);assert.equal(contacted,false);
const gold={version:1,validated:true,items:[{id:'K1',statement:'The area rule',pages:[1],essential:true}]};core.validateGold(gold,manifest);await core.writeJson(path.join(directory,'gold.json'),gold);
const demo=await runner.runExperiment(manifest.id,{simulate:true});assert(demo.simulated);assert.equal(demo.status,'complete');assert.equal(Object.keys(demo.methods).length,3);
assert(Object.values(demo.methods).every(m=>m.cards.length&&m.inputTokens===0&&m.costUsd===0));
const {startServer}=await import('./server.mjs'),port=43000+Math.floor(Math.random()*10000),server=await startServer({port});
try{
  const url=`http://127.0.0.1:${port}/api/experiments/${manifest.id}`,runUrl=`${url}/runs/${demo.runId}`;
  const blind=await (await fetch(runUrl+'/blind')).json();assert.equal(blind.cards.length,3);
  assert(!JSON.stringify(blind).includes('"method"'),'Blind response contains no method mapping');assert(!blind.cards.some(c=>c.id==='A'||c.id==='B'||c.id==='C'));
  assert.equal((await fetch(runUrl+'/summary')).status,403,'Metrics cannot leak the method before reveal');
  const post=(suffix,body,origin)=>fetch(runUrl+suffix,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  const annotation={cardId:blind.cards[0].id,reviewer:'offline tester',relevance:5,accuracy:5,usability:4,criticalError:false,comment:'Synthetic interface exercise, not real quality.',coveredKnowledge:['K1']};
  assert.equal((await post('/reviews',annotation,'https://foreign.example')).status,403);
  assert.equal((await post('/reviews',{...annotation,accuracy:6})).status,400);
  assert.equal((await post('/reviews',annotation)).status,200);
  const privateBlind=await core.readJson(path.join(directory,'runs',demo.runId,'blind-private.json')),reviews=await core.readJson(path.join(directory,'runs',demo.runId,'reviews.json'));
  const summary=runner.reviewSummary(demo,privateBlind,reviews);assert.equal(summary.reduce((s,m)=>s+m.reviewed,0),1);assert(summary.filter(m=>!m.reviewed).every(m=>m.accuracy===null),'Unreviewed outputs have no invented score');
  assert.equal((await post('/reveal',{confirm:true})).status,200);assert.equal((await fetch(runUrl+'/summary')).status,200);
  assert.equal((await post('/reviews',annotation)).status,200);const updated=await core.readJson(path.join(directory,'runs',demo.runId,'reviews.json'));assert.equal(updated.cards[annotation.cardId].blindAtReview,false,'Reviews after reveal are explicitly flagged');
  assert.equal((await fetch(url+'/images/2.png')).status,404);assert((await fs.readFile(path.join(directory,'runs',demo.runId,'review-history.jsonl'),'utf8')).split('\n').filter(Boolean).length===2);
}finally{await new Promise(resolve=>server.close(resolve));}
console.log('PASS: real offline PDF preparation, shared inputs, distinct architectures, quote approval and budget locks, provenance checks, stored artifacts, blinded HTTP projection, manual coverage, unknown scores, CSRF checks and explicit unblinding. No paid API calls; no pedagogical quality demonstrated.');
