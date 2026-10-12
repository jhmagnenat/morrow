import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import {hash,VERSION,batches} from './core.mjs';
import {POLICY} from './methods.mjs';

export const cost=(input,output,cached,rates)=>((input-cached)*rates.input+cached*rates.cachedInput+output*rates.output)/1e6;
export function estimate(manifest){
  const units=batches(manifest),config=manifest.config;
  const estimates=['A','B','C'].map(method=>{
    const maximumCalls=units.length*(method==='A'?1:method==='B'?2:4);
    const expectedInput=units.reduce((sum,pages)=>sum+(Math.ceil(Buffer.byteLength(JSON.stringify(pages.map(p=>({page:p.page,text:p.text}))))/3)+pages.reduce((s,p)=>s+p.imageTokens,0)+1200+(method==='A'?0:1600))*(method==='A'?1:method==='B'?2:4),0);
    const expectedOutput=maximumCalls*Math.min(config.maxOutputTokens,method==='A'?1200:1600);
    return {method,maximumCalls,estimatedUsd:cost(expectedInput,expectedOutput,0,config.rates),conservativeCeilingUsd:maximumCalls*cost(config.maxInputTokenBound,config.maxOutputTokens,0,config.rates)};
  });
  const quote={version:VERSION,experimentId:manifest.id,documentSha256:manifest.document.sha256,manifestHash:hash(manifest),config,methods:estimates,estimatedUsd:estimates.reduce((s,m)=>s+m.estimatedUsd,0),conservativeCeilingUsd:estimates.reduce((s,m)=>s+m.conservativeCeilingUsd,0),pricingVerifiedAt:config.rates.verifiedAt,pricingSource:config.rates.source,
    assumptions:['Text token estimate uses UTF-8 bytes / 3, not an exact tokenizer.','Projected output assumes 1200 tokens per direct call and 1600 per other call, capped by configuration; these are uncalibrated planning assumptions.','High-detail GPT-4o image tiles are included.','No discount assumed before execution; cached tokens are accounted separately afterward.','Ceiling reserves the configured input bound and output cap for every possible call.','No automatic API retries or production cache; all methods run sequentially with the same concurrency.','Only source preparation is shared; extraction calls are repeated independently for B and C.']};
  return {...quote,approvalId:hash(quote)};
}
export async function createCaller(manifest,directory,{simulate=false,onTrace,budget,transport}={}){
  const {schema}=await import('./core.mjs').then(m=>m.reusableModules());
  const config=manifest.config;
  // No SDK client or key access until after CLI approval; simulated tests never call it.
  const client=simulate||transport?null:new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:config.timeoutMs,maxRetries:0});
  return async request=>{
    const images=[];
    for(const page of request.pages){const image=await fs.readFile(path.join(directory,'images',`${page.page}.png`));if(hash(image)!==page.imageSha256)throw Error('Prepared image changed');images.push({type:'image_url',image_url:{url:`data:image/png;base64,${image.toString('base64')}`,detail:'high'}});}
    const system=`${POLICY}\n${request.instruction}`,text=JSON.stringify(request.input);
    const inputBound=Buffer.byteLength(system+text+JSON.stringify(request.schema))+1024+request.pages.reduce((s,p)=>s+p.imageTokens,0);
    if(inputBound>config.maxInputTokenBound)throw Error('Input exceeds the quoted token bound. Prepare smaller batches or explicitly increase the bound and approve a new quote.');
    const reserved=cost(config.maxInputTokenBound,config.maxOutputTokens,0,config.rates);
    if(budget.remaining+1e-9<reserved)throw Error('Approved conservative spending allowance exhausted');budget.remaining-=reserved;
    const trace={stage:request.stage,requestedModel:config.model,startedAt:new Date().toISOString(),inputBound,pages:request.pages.map(p=>p.page),status:'running',inputTokens:null,outputTokens:null,cachedInputTokens:null,costUsd:null,uncachedEquivalentCostUsd:null};
    const start=performance.now();
    try{
      let output;
      if(simulate){
        trace.providerModel='SIMULATED';trace.inputTokens=0;trace.outputTokens=0;trace.cachedInputTokens=0;trace.costUsd=0;trace.uncachedEquivalentCostUsd=0;
        const p=request.pages[0],sources=[{page:p.page,quote:'',region:{x:0.05,y:0.05,width:0.9,height:0.8}}];
        output=request.stage==='extract'?{knowledge:[{statement:'Synthetic test-only knowledge; not a real source fact.',kind:'fact',conditions:[],importance:3,sources}]}:{cards:[{question:'Synthetic demonstration: what should be reviewed?',answer:'This test-only card demonstrates the interface; it is not a model result.',sources}]};
      }else{
        const response=await (transport??(input=>client.chat.completions.create(input)))({model:config.model,temperature:config.temperature,seed:config.seed,max_completion_tokens:config.maxOutputTokens,messages:[{role:'system',content:system},{role:'user',content:[{type:'text',text},...images]}],tools:[{type:'function',function:{name:'benchmark_output',description:'Return the requested benchmark data',strict:true,parameters:request.schema}}],tool_choice:{type:'function',function:{name:'benchmark_output'}}});
        trace.providerModel=response.model;trace.requestId=response._request_id??null;trace.systemFingerprint=response.system_fingerprint??null;
        const usage=response.usage;
        if(usage){trace.inputTokens=usage.prompt_tokens;trace.outputTokens=usage.completion_tokens;trace.cachedInputTokens=usage.prompt_tokens_details?.cached_tokens??0;trace.costUsd=cost(trace.inputTokens,trace.outputTokens,trace.cachedInputTokens,config.rates);trace.uncachedEquivalentCostUsd=cost(trace.inputTokens,trace.outputTokens,0,config.rates);}
        if(response.choices[0]?.finish_reason==='length')throw Error('Truncated response; no automatic paid retry');
        const tool=response.choices[0]?.message?.tool_calls?.[0];if(tool?.type!=='function')throw Error('Missing structured output');output=JSON.parse(tool.function.arguments);
      }
      const violations=schema.findSchemaViolations(output,request.schema);if(violations.length)throw Error(`Invalid structured output: ${violations.join(', ')}`);
      trace.status='succeeded';return output;
    }catch(error){trace.status='failed';trace.error=error.message;throw error;}
    finally{trace.elapsedMs=performance.now()-start;await onTrace(trace);}
  };
}
