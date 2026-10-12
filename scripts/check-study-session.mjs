import assert from 'node:assert/strict';

// Run on seed-offline-preview.mjs only. Grades and language queues are mocked.
export async function checkStudySession(command) {
  const evaluate=async expression=>{
    const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor=expression=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const poll=()=>{if(${expression})resolve(true);else if(Date.now()>end)reject(Error('Study condition timed out: '+${JSON.stringify(expression)}));else setTimeout(poll,50);};poll();})`);
  const settle=()=>evaluate('new Promise(resolve=>setTimeout(resolve,250))');
  const text=()=>evaluate('document.body.innerText');
  const queue=name=>evaluate(`(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('encyclopedia:study:')&&k.endsWith(':${name}'));return key?JSON.parse(localStorage.getItem(key)):null;})()`);
  const cardKey=card=>`${card.kind??(card.notion?'notion':'link')}:${card.cardId??(card.notion??card.link??card.card).id}`;
  const currentKey=async name=>{const q=await queue(name);return cardKey(q.cards[q.index]);};
  const click=async label=>{
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.innerText.trim().startsWith(${JSON.stringify(label)}));if(!b)throw Error('Missing visible button: '+${JSON.stringify(label)});b.click();})()`);
    await settle();
  };
  const reveal=async()=>{if(await evaluate("[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&b.innerText.trim().startsWith('Reveal'))"))await click('Reveal');};
  const origin=await evaluate('location.origin');
  const snapshot=await evaluate("fetch('/api/export').then(r=>r.json())");
  assert.equal(snapshot.documents[0]?.title,'Disposable offline integration fixture','Never run simulated study grades on real courses');
  const backup=await evaluate("Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('encyclopedia:study:')))");
  const installStub=()=>evaluate(`(()=>{
    const original=window.fetch.bind(window);window.testGradeCalls=[];window.testFailGrade=false;window.testGradeDelay=0;
    window.fetch=async(...args)=>{
      const url=String(args[0]);
      if(url.startsWith('/api/review/')&&url.endsWith('/grade')){
        window.testGradeCalls.push(url);await new Promise(r=>setTimeout(r,window.testGradeDelay));
        return Response.json({dueAt:new Date(Date.now()+86400000).toISOString(),intervalDays:1},{status:window.testFailGrade?500:200});
      }
      if(url.endsWith('/intervals'))return Response.json({labels:[]});
      if(url==='/api/pronunciation/queue')return Response.json({cards:[1,2,3].map(i=>({card:{id:'test-pronounce-'+i,text:'Practice sentence '+i,words:[]},isNew:true}))});
      if(url==='/api/vocabulary/queue')return Response.json({cards:[1,2,3].map(i=>({card:{id:'test-vocab-'+i,phrase:'Phrase '+i,translationFr:'Traduction '+i},isNew:true}))});
      return original(...args);
    };
  })()`);
  try{
    await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('encyclopedia:study:')).forEach(k=>localStorage.removeItem(k))");
    await evaluate('window.testReloadMarker=true');await command('Page.reload');await waitFor("!window.testReloadMarker&&[...document.querySelectorAll('button')].some(b=>b.innerText==='Q&A')");
    await installStub();await click('Q&A');await waitFor("document.body.innerText.includes('Card 1 /')");
    await click('Notions');await reveal();
    assert.match(await text(),/Area equals width multiplied by height/,'Notions reveals the definition, not a mechanism answer');
    await click('Q&A');await reveal();await click('Good');assert.equal((await queue('qa')).index,1);
    await click('Notions');assert.match(await text(),/Nothing due right now/,'Definition graded in Q&A is not due a second time in Notions');
    await click('Q&A');
    await reveal();const drillBefore=await queue('qa'),target=await currentKey('qa');
    await click('Connect');await reveal();await click('Good');const connectBefore=await queue('connect');
    await click('Q&A');assert.deepEqual(await queue('qa'),drillBefore,'Unrelated tab preserves the current card and answer');
    await click('Today');
    // Today interleaves card types. Locate the actual target rather than
    // assuming its position in a different queue.
    for(let i=0;await currentKey('today')!==target;i++){
      assert(i<7,'Drill target must occur in Today');await reveal();await click('Good');
    }
    await reveal();await click('Good');await click('Q&A');
    assert.notEqual(await currentKey('qa'),target,'A card reviewed in Today disappears from Drill');
    await reveal();const drillAfter=await queue('qa');
    await click('Today');const shortcutTarget=await currentKey('today'),calls=await evaluate('window.testGradeCalls.length');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await settle();
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3',windowsVirtualKeyCode:51});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'3',code:'Digit3',windowsVirtualKeyCode:51});await settle();
    assert.equal(await evaluate('window.testGradeCalls.length'),calls+1,'Only the visible tab handles the shortcut');
    await click('Q&A');
    if(!shortcutTarget.startsWith('notion:'))assert.deepEqual(await queue('qa'),drillAfter,'Hidden Drill stays on the same card');
    await click('Pronounce');if((await text()).includes('Check again'))await click('Check again');await reveal();
    await evaluate('window.testFailGrade=true');await click('Good');
    assert.match(await text(),/Your review could not be saved/);assert.equal((await queue('pronounce')).index,0,'Failed online save keeps the card');
    await evaluate('window.testFailGrade=false');await click('Good');assert.equal((await queue('pronounce')).index,1);
    const typeDraft=async value=>{await evaluate(`(()=>{const t=[...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();};
    await typeDraft('My pronunciation draft');await click('Vocab');if((await text()).includes('Check again'))await click('Check again');await reveal();await click('Good');
    assert.equal((await queue('vocab')).index,1);await click('Pronounce');
    assert.equal(await evaluate("[...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length).value"),'My pronunciation draft');
    await click('Explain');await evaluate(`(()=>{const i=[...document.querySelectorAll('input')].find(e=>e.getClientRects().length&&e.placeholder.startsWith('Search a notion'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(snapshot.notions[0].label)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor("document.querySelector('li button')!==null");await evaluate("document.querySelector('li button').click()");
    await waitFor("[...document.querySelectorAll('textarea')].some(e=>e.getClientRects().length)");await typeDraft('My explanation draft');
    await click('Today');const todaySaved=await queue('today');await click('Explain');
    assert.equal(await evaluate("[...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length).value"),'My explanation draft');
    await click('Q&A');const drillSaved=await queue('qa');await evaluate('window.testReloadMarker=true');await command('Page.reload');
    await waitFor("!window.testReloadMarker&&document.body.innerText.includes('Card ')&&document.body.innerText.includes('Good')");
    assert.deepEqual(await queue('qa'),drillSaved);
    await command('Page.navigate',{url:`${origin}/browse`});await waitFor("location.pathname==='/browse'&&document.querySelector('h1')?.textContent==='Browse'");
    await command('Page.navigate',{url:`${origin}/study`});await waitFor("document.body.innerText.includes('Card ')&&document.body.innerText.includes('Good')");
    assert.deepEqual(await queue('qa'),drillSaved);await click('Today');assert.deepEqual(await queue('today'),todaySaved);
    await click('Connect');assert.equal((await queue('connect')).index,connectBefore.index);
    await click('Explain');await waitFor("[...document.querySelectorAll('textarea')].some(e=>e.getClientRects().length)");
    assert.equal(await evaluate("[...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length).value"),'My explanation draft');
    await click('Q&A');await installStub();await evaluate('window.testGradeDelay=700');
    const before=await queue('qa');await click('Good');await click('Today');await evaluate('new Promise(r=>setTimeout(r,900))');await click('Q&A');
    assert.equal((await queue('qa')).index,before.index+1,'Review completes after changing tabs');
    const after=await evaluate("fetch('/api/export').then(r=>r.json())");assert.equal(after.reviewLog.length,snapshot.reviewLog.length,'No actual review is submitted');
    console.log('PASS: eight tabs, shared card identities, interleaving, visible keyboard shortcuts, failed save, drafts, reload, Browse return and in-flight review. Disposable fixture; no real grades.');
  }finally{
    await evaluate(`(()=>{Object.keys(localStorage).filter(k=>k.startsWith('encyclopedia:study:')).forEach(k=>localStorage.removeItem(k));for(const[k,v]of Object.entries(${JSON.stringify(backup)}))localStorage.setItem(k,v);})()`);
  }
}
