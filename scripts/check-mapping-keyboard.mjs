import assert from 'node:assert/strict';
export async function checkMappingKeyboard(command) {
  const evaluate=async expression=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result.value;
  };
  const settle=()=>evaluate('new Promise(resolve=>setTimeout(resolve,160))');
  const key=async(key,repeat=false)=>{
    const codes={ArrowRight:39,ArrowLeft:37,ArrowUp:38,ArrowDown:40,Enter:13,Backspace:8,Escape:27};
    await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:codes[key],autoRepeat:repeat});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key]});
    await settle();
  };
  const ids=()=>evaluate(`[...document.querySelectorAll('[data-map-topic]')].map(b=>b.dataset.mapTopic)`);
  const selected=()=>evaluate(`document.querySelector('[data-map-topic][aria-pressed="true"]')?.dataset.mapTopic??null`);
  const camera=()=>evaluate(`getComputedStyle(document.querySelector('.react-flow__viewport')).transform`);
  await evaluate(`document.querySelector('[data-testid="compact-mapping"]').focus()`);
  await key('Escape');
  const overview=await ids();assert(overview.length>=2);
  await key('ArrowRight');assert.equal(await selected(),overview[0]);
  const initialCamera=await camera();
  await key('ArrowRight');assert.equal(await selected(),overview[1]);
  await key('ArrowLeft');assert.equal(await selected(),overview[0]);
  const columns=overview.length>9?4:3;
  if(overview.length>columns){await key('ArrowDown');assert.equal(await selected(),overview[columns]);await key('ArrowUp');assert.equal(await selected(),overview[0]);}
  for(let i=1;i<Math.min(5,overview.length);i++)await key('ArrowRight',true);
  assert.equal(await selected(),overview[Math.min(4,overview.length-1)],'Held arrows do not skip or stall on stale state');
  assert.equal(await camera(),initialCamera,'Keyboard movement keeps the map camera stable');
  const branch=await evaluate(`(() => {const b=[...document.querySelectorAll('[data-map-topic]')].find(b=>b.innerText.includes('subtopics'));b?.focus();return b?.dataset.mapTopic})()`);
  assert(branch);await settle();await key('Enter');
  assert(!((await ids()).includes(branch)),'Enter opens the selected branch rather than only its detail panel');
  const path=await evaluate(`document.querySelector('[aria-label="Mapping path"]').innerText`);
  await key('Enter',true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Mapping path"]').innerText`),path,'Repeated Enter cannot drill through multiple levels');
  await key('ArrowRight');assert.equal(await selected(),(await ids())[0]);
  await key('Escape');assert.deepEqual(await ids(),overview);
  assert.equal(await selected(),branch,'Escape returns to the parent with the rubric still selected');
  await key('Enter');assert(!((await ids()).includes(branch)),'Enter reopens the rubric after Escape');
  await key('Backspace');assert.deepEqual(await ids(),overview);
  const largeBranch=await evaluate(`(() => {const b=[...document.querySelectorAll('[data-map-topic]')].find(b=>Number(b.innerText.match(/([0-9]+) subtopics/)?.[1])>16);b?.focus();return b?.dataset.mapTopic})()`);
  if(largeBranch){
    await settle();await key('Enter');
    const firstPage=await ids();assert.equal(firstPage.length,16);
    await key('ArrowRight');
    for(let i=0;i<16;i++)await key('ArrowRight',true);
    const secondPage=await ids();assert.notEqual(secondPage[0],firstPage[0]);assert.equal(await selected(),secondPage[0]);
    await key('ArrowLeft');assert.deepEqual(await ids(),firstPage);assert.equal(await selected(),firstPage[15]);
    await key('Backspace');assert.deepEqual(await ids(),overview);
  }
  const input=await evaluate(`(() => {const input=document.querySelector('input');if(!input)return false;input.focus();return true;})()`);
  if(input){const before=await selected();await key('ArrowRight');assert.equal(await selected(),before,'Typing/search fields do not navigate the map');}
  console.log('PASS: browser grid arrows, held keys, stable camera, Enter opens a branch, Escape/Backspace return and inputs are protected. No paid API call.');
}
