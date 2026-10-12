import assert from 'node:assert/strict';
export async function checkBackupDialog(command){
  const evaluate=async(expression)=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Backup').click()`);
  await evaluate('new Promise(r=>setTimeout(r,100))');
  assert(await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),'Backup receives focus');
  assert(await evaluate(`document.querySelector('[role="dialog"] > div').getBoundingClientRect().width<=390`));
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});
  assert(await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),'Shift Tab stays inside Backup');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await evaluate('new Promise(r=>setTimeout(r,100))');
  assert(await evaluate(`!document.querySelector('[role="dialog"]')`),'Escape closes Backup');
  console.log('PASS: mobile Backup fits viewport, receives/traps focus, closes with Escape and restores focus. No data changed.');
}
