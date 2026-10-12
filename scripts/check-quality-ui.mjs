import assert from 'node:assert/strict';
export async function checkQualityUI(command){
  const evaluate=async(expression)=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description);return result.result.value;};
  const settle=()=>evaluate('new Promise(resolve=>setTimeout(resolve,250))');
  await evaluate(`document.querySelector('details summary').click()`);await settle();
  assert.equal(await evaluate(`Boolean(document.querySelector('input[aria-label="New cards per day"]'))`),true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText==='Verify / edit').click()`);await settle();
  assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`),true);
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.qualityEditCalls=0;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/cards/') && args[1]?.method==='PATCH'){window.qualityEditCalls++;const body=JSON.parse(args[1].body);return new Response(JSON.stringify({card:{id:String(args[0]).split('/').pop(),cardType:'notion',question:body.question,answer:body.answer,example:body.example,status:body.status,kind:'definition',objective:'Fixture',evidence:[],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'}}));}return original(...args);};const input=document.querySelector('[role="dialog"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Temporary UI test question about insurance coverage?');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();
  await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.innerText==='Save draft').click()`);await settle();
  assert.equal(await evaluate('window.qualityEditCalls'),1);
  assert.equal(await evaluate(`document.body.innerText.includes('Temporary UI test question about insurance coverage?')`),true);
  assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`),false);
  await command('Page.reload');await evaluate('new Promise(resolve=>setTimeout(resolve,1000))');
  assert.equal(await evaluate(`document.body.innerText.includes('Temporary UI test question about insurance coverage?')`),false,'Stubbed editor must never modify real cards');
  console.log('PASS: quality panel, review settings, source/card editor, draft save and reload. No real edit submitted.');
}
