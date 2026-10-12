import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=new URL(process.argv[2]??'http://localhost:3004');
assert(['localhost','127.0.0.1'].includes(base.hostname),'Local preview only');
const graph=await(await fetch(new URL('/api/graph',base))).json();
assert.equal(graph.documents[0]?.title,'Disposable teacher-course preview','Never run this check against personal courses');
const target=await(await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let sequence=0;const pending=new Map(),errors=[];
socket.addEventListener('message',({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);if(message.error)p.reject(Error(message.error.message));else p.resolve(message.result);}});
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
const waitFor=expression=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+12000;function poll(){if(${expression})resolve(true);else if(Date.now()>end)reject(Error('Preview condition did not appear'));else setTimeout(poll,80);}poll();})`);
const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.innerText.trim().startsWith(${JSON.stringify(label)}));if(!b)throw Error('Missing visible button');b.click();})()`);
await mkdir('.next/teacher-ui',{recursive:true});
const screenshots=[];
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const file=`.next/teacher-ui/${name}.png`;await writeFile(file,Buffer.from(r.data,'base64'));screenshots.push(file);}
try{
  await command('Runtime.enable');await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1360,height:980,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:new URL('/study',base).href});
  await waitFor("Object.keys(document.querySelector('.study-modes button')??{}).some(k=>k.startsWith('__reactProps'))");await click('Course');
  await waitFor("document.body.innerText.includes('Your explained course')&&document.body.innerText.includes('Illustrative exercise')");
  assert((await evaluate('document.body.innerText')).includes('Added teaching context'));
  assert((await evaluate('document.body.innerText')).includes('Illustrative exercise'));
  await screenshot('course-desktop');
  await click('Review');await waitFor("document.body.innerText.includes('Card 1 /')");
  if(await evaluate("[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&b.innerText.trim().startsWith('Reveal'))"))await click('Reveal');
  await waitFor("document.body.innerText.includes('Added teaching context')");
  await screenshot('review-desktop');
  await click('Course');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await waitFor("document.body.innerText.includes('Your explained course')");
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'),'Course must not overflow horizontally on mobile');
  await screenshot('course-mobile');
  await evaluate("document.querySelector('.study-modes details').open=true");
  assert(await evaluate("document.querySelector('.study-modes details div').getBoundingClientRect().right<=innerWidth+1"),'Additional practice menu stays within viewport');
  await click('Vocab');await waitFor("document.body.innerText.includes('Vocab')");
  await command('Page.navigate',{url:new URL('/browse',base).href});await waitFor("document.body.innerText.includes('What is the difference between area and perimeter?')");
  assert.equal(errors.length,0,'No browser runtime exception');
  const exports=await fetch(new URL('/api/export?format=anki',base));assert.equal(exports.status,200);assert.equal(exports.headers.get('X-Exported-Cards'),'3');assert((await exports.text()).includes('Added teaching context'));
  console.log(JSON.stringify({passed:true,checked:['desktop course','desktop review and reveal','mobile course','additional practice menu','cards','Anki export'],screenshots,modelCalls:0},null,2));
}finally{await command('Page.close').catch(()=>{});socket.close();}
