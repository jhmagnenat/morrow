import assert from 'node:assert/strict';
import {isolatedModules} from './isolated-modules.mjs';
process.env.LLM_PROVIDER='ollama';
process.env.OPENAI_API_KEY='unused-cloud-key';
process.env.OLLAMA_MODEL='qwen3.5:4b';
process.env.OLLAMA_AUDIT_MODEL='local-review';
process.env.OLLAMA_ACCURACY_MODEL='local-accuracy';
process.env.OLLAMA_BASE_URL='http://127.0.0.1:11434';
const requests=[];
let content='{"ok":true}',doneReason='stop',offline=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/chat','No request may reach a paid provider');
  if(offline)throw new TypeError('Local server unavailable');
  requests.push(JSON.parse(options.body));
  return Response.json({message:{content},done_reason:doneReason,prompt_eval_count:12,eval_count:4});
};
try {
  const env=await isolatedModules(['llm']);
  const llm=await env.load('llm');
  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
  const generate=(name='direct_cards',images=[])=>llm.structuredCompletion('System','Source',name,'Generate',schema,images);
  assert.deepEqual(await generate('direct_cards',['data:image/png;base64,aGVsbG8=']),{ok:true});
  assert.deepEqual(requests[0].format,schema);
  assert.deepEqual(requests[0].messages[1].images,['aGVsbG8=']);
  assert.equal(requests[0].think,false);
  assert.equal(requests[0].options.temperature,0);
  assert.equal(requests[0].tools,undefined);
  assert.equal(requests[0].model,'qwen3.5:4b');
  await generate('audit_visual_cards');assert.equal(requests.at(-1).model,'local-review');
  await generate('audit_accuracy');assert.equal(requests.at(-1).model,'local-accuracy');
  content='{"ok":"wrong"}';await assert.rejects(generate(),/expected shape/);
  content='not JSON';await assert.rejects(generate(),/valid structured JSON/);
  content='{"ok":true}';doneReason='length';await assert.rejects(generate(),/truncated/);
  offline=true;await assert.rejects(generate(),/Could not reach Ollama/);
  assert.equal(llm.currentProviderLabel(),'Ollama (qwen3.5:4b)');
  console.log('Ollama adapter tests passed: native schemas, vision, model routing, rejection and no cloud fallback (simulated responses).');
} finally {globalThis.fetch=originalFetch;}
