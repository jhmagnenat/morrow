import assert from 'node:assert/strict';
export async function checkQaGenerator(command){
  const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=expression=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(${expression})resolve();else if(Date.now()>end)reject(Error('Q&A UI timeout'));else setTimeout(check,50);};check();})`);
  const backup=await evaluate(`Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('encyclopedia:study:')))`);
  assert.equal(await evaluate(`fetch('/api/export').then(r=>r.json()).then(s=>s.documents[0]?.title)`),'Disposable offline integration fixture');
  try{
    await evaluate(`(()=>{window.__qaCalls=[];window.__originalFetch=window.fetch;window.fetch=async(input,init)=>{if(String(input)==='/api/qa/generate'){window.__qaCalls.push(JSON.parse(init.body));return Response.json({created:1,ready:1,draft:0,duplicates:0});}const response=await window.__originalFetch(input,init);if(String(input)==='/api/review/queue'&&window.__qaCalls.length){const data=await response.json();data.cards.push({...data.cards[0],cardId:'qa-browser-generated',question:'What does this course notion mean?'});return Response.json(data);}return response;};[...document.querySelectorAll('button')].find(b=>b.textContent==='Q&A').click();})()`);
    await waitFor(`document.body.innerText.includes('Q&A ·')`);
    assert.equal(await evaluate('window.__qaCalls.length'),0,'Opening Q&A never launches generation');
    await evaluate(`document.querySelector('[data-no-review-shortcuts] summary').click()`);
    await evaluate(`(()=>{const select=document.querySelector('[data-no-review-shortcuts] select');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`!([...document.querySelectorAll('button')].find(b=>b.textContent==='Generate questions').disabled)`);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Generate questions').click()`);
    await waitFor(`document.body.innerText.includes('1 questions ready')`);
    assert.equal(await evaluate('window.__qaCalls.length'),1);assert.equal(await evaluate('window.__qaCalls[0].count'),3);
    assert(await evaluate(`Object.entries(localStorage).some(([key,value])=>key.endsWith(':qa')&&JSON.parse(value).cards.some(c=>c.cardId==='qa-browser-generated'))`),'Generated questions append to the persisted queue');
    console.log('PASS: Q&A notion selector, explicit generation only, three-question request, result feedback and appended durable session queue. Synthetic HTTP response; no model calls.');
  }finally{
    await evaluate(`(()=>{window.fetch=window.__originalFetch;Object.keys(localStorage).filter(key=>key.startsWith('encyclopedia:study:')).forEach(key=>localStorage.removeItem(key));for(const [key,value] of Object.entries(${JSON.stringify(backup)}))localStorage.setItem(key,value);})()`);
  }
}
