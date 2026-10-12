import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);
const db=await env.load('db'),quality=await env.load('qualityDb');
const doc=db.insertDocument({title:'Disposable generation interface fixture',kind:'course',pageCount:1});
const quote='Underwriting decides whether to accept a risk and on what terms. Pricing estimates the premium.';
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:quote}]);
const notion=db.insertNotion({label:'Underwriting',domain:'Insurance',definition:'Underwriting decides whether to accept a risk and on what terms.',status:'draft',sources:[{documentId:doc.id,page:1}]});
quality.saveStudyCard({id:'generation-runtime-card',notionId:notion.id,cardType:'notion',question:'Which function decides whether to accept a risk?',answer:'Underwriting.',explanation:'Pricing instead estimates the premium.',example:'',kind:'mechanism',objective:'Distinguish acceptance and pricing',status:'ready',evidence:[{documentId:doc.id,page:1,quote}],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
const port=3007,debugPort=9223;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',String(port)],{env:{...process.env,MORROW_DATA_DIR:path.join(env.workspace,'data'),MORROW_AUTH:'off',MORROW_GENERATION_EXECUTION:'inline'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
let chrome,socket;const pending=new Map();let sequence=0;
const waitFor=async(fn)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Runtime condition timed out. '+output);};
const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const click=text=>evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button');button.click();})()`);
try{
  await waitFor(()=>fetch(`http://localhost:${port}`).then(r=>r.ok).catch(()=>false));
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f=>fs.existsSync(f));if(!executable)throw Error('Chrome or Edge is required for this optional browser check.');
  chrome=spawn(executable,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(env.workspace,'browser-profile')}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  await waitFor(()=>fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.ok).catch(()=>false));
  const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',({data})=>{const r=JSON.parse(data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);if(r.error)p.reject(Error(r.error.message));else p.resolve(r.result);});
  await command('Page.enable');await command('Runtime.enable');await command('Page.navigate',{url:`http://localhost:${port}`});
  await waitFor(()=>evaluate(`document.readyState==='complete'&&!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Documents'&&Object.keys(b).some(k=>k.startsWith('__reactProps')))`));
  // Intercept generation only. No request can reach the configured model.
  await evaluate(`window.__generationRequests=[];window.__originalFetch=window.fetch;window.fetch=async(input,init)=>{if(String(input).endsWith('/generate')&&init?.method==='POST'){const options=JSON.parse(init.body);window.__generationRequests.push(options);return new Response(JSON.stringify({job:{id:'runtime-job',documentId:${JSON.stringify(doc.id)},courseId:'default',status:'complete',totalPages:1,processedPages:1,completedPages:1,readyCards:1,draftCards:0,reviewPages:[],warnings:[],requests:0,inputTokens:0,outputTokens:0,notionsCreated:0,cardsCreated:0}}),{status:200,headers:{'Content-Type':'application/json'}});}return window.__originalFetch(input,init);};`);
  await click('Documents');
  await waitFor(()=>evaluate(`!!document.querySelector('select')`));
  await evaluate(`(()=>{const select=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'comprehensive');select.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('input[placeholder="All, or e.g. 19,20"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('Generate cards');await waitFor(()=>evaluate('window.__generationRequests.length===1'));
  assert.deepEqual(await evaluate('window.__generationRequests[0]'),{mode:'strict',enrichment:false,cardDetail:'comprehensive',pages:[1],reprocess:true,background:true});
  await evaluate(`(()=>{const input=document.querySelector('input[placeholder="All, or e.g. 19,20"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'9');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('Generate cards');assert.equal(await evaluate('window.__generationRequests.length'),1);assert(await evaluate(`document.body.innerText.includes('Choose up to 3 page numbers')`));
  await command('Page.navigate',{url:`http://localhost:${port}/browse`});
  await waitFor(()=>evaluate(`document.body.innerText.includes('Content quality')&&document.body.innerText.includes('Which function decides whether to accept a risk?')`));
  await evaluate(`window.__retryRequests=[];window.__browseRefreshes=0;window.__originalFetch=window.fetch;window.fetch=async(input,init)=>{if(String(input).endsWith('/generate')&&init?.method==='POST'){window.__retryRequests.push(JSON.parse(init.body));return new Response(JSON.stringify({job:{id:'runtime-retry-job',documentId:${JSON.stringify(doc.id)},courseId:'default',status:'complete',totalPages:1,processedPages:1,completedPages:1,readyCards:1,draftCards:0,reviewPages:[],warnings:[],requests:0,inputTokens:0,outputTokens:0,notionsCreated:0,cardsCreated:0}}),{status:200,headers:{'Content-Type':'application/json'}});}if(String(input)==='/api/browse'){window.__browseRefreshes++;const response=await window.__originalFetch(input,init);const data=await response.json();data.cards[0].label='Freshly regenerated acceptance question';return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}return window.__originalFetch(input,init);};document.querySelectorAll('details').forEach(d=>d.open=true);`);
  await click('Reprocess');
  await waitFor(()=>evaluate(`window.__browseRefreshes===1&&document.body.innerText.includes('Freshly regenerated acceptance question')`));
  assert.deepEqual(await evaluate('window.__retryRequests'),[{mode:'strict',enrichment:false,cardDetail:'key-ideas',pages:[1],reprocess:true,background:true}]);
  assert(await evaluate(`document.body.innerText.includes('Regeneration completed; saved cards refreshed.')`));
  await command('Page.navigate',{url:`http://localhost:${port}/study`});
  await waitFor(()=>evaluate(`document.body.innerText.includes('Today')&&Object.keys([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Today')??{}).some(k=>k.startsWith('__reactProps'))`));
  await click('Today');await click('Reveal (space)');assert(await evaluate(`document.body.innerText.includes('Why / more context')`));
  fs.mkdirSync(path.join(env.root,'references/evaluation'),{recursive:true});
  fs.writeFileSync(path.join(env.root,'references/evaluation/generation-browser-latest.json'),JSON.stringify({checkedAt:new Date().toISOString(),result:'pass',checks:['generation coverage and page options','invalid page rejection','Reprocess starts generation','Browse refreshes saved cards','separate study explanation'],disposableData:true,providerRequestsIntercepted:true,pedagogicalQualityScore:null},null,2));
  console.log('PASS: production browser sends coverage/pages/regeneration choices, rejects invalid pages, Reprocess starts generation and refreshes visible cards, and study shows separate explanation. Disposable data; provider requests intercepted.');
}catch(error){
  if(socket?.readyState===WebSocket.OPEN)console.error(await evaluate(`(async()=>JSON.stringify({url:location.href,text:document.body.innerText.slice(0,2500),quality:await fetch('/api/quality').then(async r=>({status:r.status,data:await r.text()}))}))()`).catch(()=>''));
  throw error;
}finally{
  if(socket?.readyState===WebSocket.OPEN){await command('Browser.close').catch(()=>{});socket.close();}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}pending.clear();
  chrome?.kill();server.kill();
}
