import assert from 'node:assert/strict';
import {isolatedModules} from './isolated-modules.mjs';
import {evaluationHtml} from './model-evaluation-report.mjs';

const env=await isolatedModules(['llm','teacherEvaluation']);
const budget=await env.load('modelExperimentBudget');
process.env.MORROW_LLM_MAX_USD='0.1';
delete process.env.MORROW_INPUT_USD_PER_MILLION;delete process.env.MORROW_OUTPUT_USD_PER_MILLION;
const metadata={model:'gpt-6.1-sol',tool:'test',maxOutput:8192};
let sent=0;
const call=work=>budget.budgetedModelCall(metadata,async()=>100,async()=>{sent++;return work();},r=>r);
process.env.MORROW_LLM_BUDGET_SESSION='concurrent';
let release;const pending=call(()=>new Promise(resolve=>{release=resolve;}));
await new Promise(resolve=>setTimeout(resolve,20));
await assert.rejects(call(()=>({input:100,output:100})),/budget reached/);
assert.equal(sent,1,'Concurrent calls cannot both spend the last reservation.');
release({input:100,output:100});await pending;
await call(()=>({input:100,output:100}));
assert.equal(sent,2,'Unused output reservation is released after reported usage.');
process.env.MORROW_LLM_BUDGET_SESSION='failure';
await assert.rejects(call(()=>{throw Error('transport timeout');}),/timeout/);
const afterFailure=sent;await assert.rejects(call(()=>({input:0,output:0})),/budget reached/);
assert.equal(sent,afterFailure,'Timeout retains reservation and halts the persistent session.');
process.env.MORROW_LLM_MAX_USD='10';
await assert.rejects(call(()=>({input:0,output:0})),/budget reached/);
assert.equal(budget.budgetSnapshot().sessions.find(s=>s.id==='failure').limit_usd,0.1,'Environment changes cannot enlarge an existing session.');
process.env.MORROW_LLM_BUDGET_SESSION='counter-failure';
await assert.rejects(budget.budgetedModelCall(metadata,async()=>{throw Error('count unavailable');},async()=>{sent++;},r=>r),/unavailable/);
assert.equal(sent,afterFailure,'Token counter failure never falls back to an unbudgeted paid call.');
process.env.MORROW_LLM_BUDGET_SESSION='unknown-price';
await assert.rejects(budget.budgetedModelCall({...metadata,model:'unknown'},async()=>100,async()=>{sent++;},r=>r),/Unknown model pricing/);
process.env.MORROW_LLM_BUDGET_SESSION='missing-usage';
await assert.rejects(call(()=>({input:NaN,output:1})),/Missing billable usage/);
assert.equal(budget.budgetSnapshot().sessions.find(s=>s.id==='missing-usage').halted,1);

// SDK request contracts are exercised through a fake transport: never network.
process.env.OPENAI_API_KEY='test-only';process.env.ANTHROPIC_API_KEY='test-only';
process.env.OPENAI_MODEL='gpt-6.1-sol';process.env.ANTHROPIC_MODEL='claude-sonnet-5-5';
delete process.env.OPENAI_AUDIT_MODEL;delete process.env.ANTHROPIC_AUDIT_MODEL;
process.env.MORROW_LLM_BUDGET_SESSION='adapters';process.env.MORROW_LLM_MAX_USD='2';
const realFetch=globalThis.fetch,captured=[];let scenario='valid';
globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input),body=JSON.parse(init?.body??await input.text());captured.push({url,body});
  let value;
  if(url.endsWith('/input_tokens')||url.includes('count_tokens'))value={input_tokens:100};
  else if(url.endsWith('/responses'))value={id:'resp_test',object:'response',created_at:1,model:body.model,status:scenario==='truncated'?'incomplete':'completed',incomplete_details:scenario==='truncated'?{reason:'max_output_tokens'}:null,
    output:[{type:'message',id:'msg_1',role:'assistant',status:'completed',content:scenario==='refused'?[{type:'refusal',refusal:'No'}]:[{type:'output_text',text:scenario==='invalid'?'{"answer":3}':'{"answer":"OK"}',annotations:[]}]}],usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:10}}};
  else if(url.includes('/messages'))value={id:'msg_test',type:'message',role:'assistant',model:body.model,content:[{type:'text',text:'{"answer":"OK"}'}],stop_reason:scenario==='truncated'?'max_tokens':'end_turn',stop_sequence:null,usage:{input_tokens:100,output_tokens:50}};
  else throw Error('Unexpected network endpoint: '+url);
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const llm=await env.load('llm'),telemetry=await env.load('llmTelemetry');
  const schema={type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false};
  process.env.LLM_PROVIDER='openai';const usage={requests:0,inputTokens:0,outputTokens:0,elapsedMs:0,failures:0};
  const result=await telemetry.withLlmTelemetry(usage,()=>llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema,['data:image/png;base64,aGVsbG8=']));
  assert.equal(result.answer,'OK');assert.equal(usage.callTraces[0].reasoningOutputTokens,10);assert.equal(usage.callTraces[0].cachedInputTokens,20);
  const openai=captured.find(c=>c.url.endsWith('/responses')).body;
  assert.equal(openai.model,'gpt-6.1-sol');assert.equal(openai.store,false);assert.equal(openai.reasoning.effort,'medium');assert.equal(openai.text.format.strict,true);assert(!openai.tools);assert(openai.input[0].content.some(c=>c.type==='input_image'));
  scenario='truncated';await assert.rejects(llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema),/incomplete/);
  scenario='refused';await assert.rejects(llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema),/refused/);
  scenario='invalid';await assert.rejects(llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema),/violates schema/);
  assert(budget.budgetSnapshot().calls.filter(c=>c.session==='adapters').every(c=>c.status==='settled'),'Rejected content is still recorded as billed output.');
  scenario='valid';process.env.LLM_PROVIDER='anthropic';
  assert.equal((await llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema)).answer,'OK');
  const anthropic=captured.find(c=>c.url.includes('/messages')&&!c.url.includes('count_tokens')).body;
  assert.equal(anthropic.model,'claude-sonnet-5-5');assert(!anthropic.tool_choice);assert(!anthropic.tools);assert.equal(anthropic.output_config.format.type,'json_schema');
  assert(!captured.find(c=>c.url.includes('count_tokens')).body.max_tokens,'Counter receives only supported parameters.');
  scenario='truncated';await assert.rejects(llm.structuredCompletion('teacher','slides','reconstruct_teaching','teach',schema),/incomplete/);
  const helper=await env.load('providerStructuredOutput'),bounded={type:'object',properties:{minItems:{type:'array',minItems:1,maxItems:2,items:{type:'string',maxLength:10}}},required:['minItems'],additionalProperties:false};
  const normalized=helper.anthropicOutputSchema(bounded);assert(normalized.properties.minItems);assert.equal(normalized.properties.minItems.maxItems,undefined);assert.equal(bounded.properties.minItems.maxItems,2);
}finally{globalThis.fetch=realFetch;}

const evaluate=(await env.load('teacherEvaluation')).evaluateTeacherRun;
const run={runId:'test',status:'complete',cardIds:['a','b'],objectiveIds:['o'],costUsd:0.2};
const review={runId:'test',cards:['a','b'].map(id=>({id,decision:'keep',factualError:false,notes:''})),lesson:{correctness:9,context:8,clarity:8,majorErrors:0,notes:''},objectives:[{id:'o',covered:true}],correctionMinutes:1};
assert.equal(evaluate(run,review).passed,true);assert.equal(evaluate(run,review).costPerKeptCard,0.1);
assert.equal(evaluate({...run,status:'failed'},review).passed,false);
assert.equal(evaluate(run,{...review,lesson:{...review.lesson,majorErrors:1}}).passed,false);
assert.equal(evaluate({...run,objectiveIds:[]},{...review,objectives:[]}).passed,false,'No expected objectives means no quality certification.');
assert.throws(()=>evaluate(run,{...review,cards:[review.cards[0]]}),/every card/);
assert.throws(()=>evaluate(run,{...review,runId:'other'}),/every card/);
const html=evaluationHtml({runId:'evil</script>',title:'<script>alert(1)</script>',model:'mock',status:'complete',usage:{requests:0},costUsd:0,outputs:[],lessons:[],expectations:[]},{budgetUsd:2,selected:[],expectations:[]},'..');
assert(!html.includes('evil</script>'));assert(html.includes('&lt;script&gt;'));
console.log('PASS: persistent budget reservations, concurrent requests, unknown charges, fail-closed counters, real SDK request contracts with fake transport, refusal/truncation/invalid output accounting, and human acceptance gates. No paid API requests.');
