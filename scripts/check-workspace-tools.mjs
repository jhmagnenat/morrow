import assert from 'node:assert/strict';
export async function checkWorkspaceTools(command){
  const evaluate=async(expression)=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  await evaluate(`(() => {window.__toolGrades=0;const original=window.fetch;window.fetch=(input,init)=>{if(String(input).includes('/grade'))window.__toolGrades++;return original(input,init);};[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Tools')).click();})()`);
  await evaluate('new Promise(r=>setTimeout(r,300))');
  assert(await evaluate(`document.querySelector('dialog').open`));
  assert(await evaluate(`!!document.activeElement.closest('dialog')`),'Modal receives keyboard focus');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3',windowsVirtualKeyCode:51});
  assert.equal(await evaluate('window.__toolGrades'),0,'Modal prevents background grading');
  await evaluate(`[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='backup').click()`);
  await evaluate('new Promise(r=>setTimeout(r,300))');
  assert(await evaluate(`document.querySelector('dialog').textContent.includes('Recovery points')`));
  await evaluate(`[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='study').click()`);
  assert(await evaluate(`document.querySelector('dialog').textContent.includes('Evaluate learning quality')`));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate(`document.querySelector('dialog').getBoundingClientRect().width<=390`),'Tools fits mobile viewport');
  await evaluate(`document.querySelector('dialog [aria-label="Close tools"]').click()`);
  await evaluate('new Promise(r=>setTimeout(r,100))');
  assert.equal(await evaluate(`document.querySelector('dialog').open`),false);
  assert(await evaluate(`document.documentElement.scrollWidth<=390`),'Mobile page has no horizontal overflow');
  console.log('PASS: Tools focus, background-shortcut protection, recovery/evaluation discovery, 390px modal and page without horizontal overflow. No user data changed.');
}
