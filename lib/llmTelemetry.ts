import { AsyncLocalStorage } from "node:async_hooks";
export interface LlmCallTrace {tool:string;model:string;providerModel?:string;inputTokens:number;outputTokens:number;cachedInputTokens?:number;reasoningOutputTokens?:number;elapsedMs:number;status:'running'|'succeeded'|'failed';}
export interface LlmTelemetry {requests:number;inputTokens:number;outputTokens:number;elapsedMs:number;failures:number;callTraces?:LlmCallTrace[];}
const scope=new AsyncLocalStorage<LlmTelemetry>();
interface LlmBudget {requests:number;tokens:number;maxRequests:number;maxTokens:number;}
const budgets=new AsyncLocalStorage<LlmBudget>();
function configuredLimit(name:string,fallback:number){const n=Number(process.env[name]);return Number.isInteger(n)&&n>0?n:fallback;}
export function withGenerationBudget<T>(previous:{requests:number;inputTokens:number;outputTokens:number},work:()=>T):T{
  return budgets.run({requests:previous.requests,tokens:previous.inputTokens+previous.outputTokens,maxRequests:configuredLimit('MORROW_GENERATION_MAX_REQUESTS',120),maxTokens:configuredLimit('MORROW_GENERATION_MAX_TOKENS',500000)},work);
}
export function withLlmTelemetry<T>(telemetry:LlmTelemetry,work:()=>T):T{return scope.run(telemetry,work);}
export async function observeLlm<T>(work:()=>Promise<T>,usage?:(response:T)=>{input:number;output:number;model?:string;cachedInput?:number;reasoningOutput?:number},metadata?:{tool:string;model:string}):Promise<T>{
  const budget=budgets.getStore();
  if(budget){
    if(budget.requests>=budget.maxRequests||budget.tokens>=budget.maxTokens)throw Error('Generation billing budget reached; checked content is preserved. Increase the configured budget to resume.');
    budget.requests++;
  }
    const stats=scope.getStore(),start=Date.now();if(stats)stats.requests++;
  const trace:LlmCallTrace|undefined=stats&&metadata?{...metadata,inputTokens:0,outputTokens:0,elapsedMs:0,status:'running'}:undefined;
  if(stats&&trace){stats.callTraces??=[];stats.callTraces.push(trace);}
  try{const result=await work();if(usage){const tokens=usage(result);if(stats){stats.inputTokens+=tokens.input;stats.outputTokens+=tokens.output;}if(trace){trace.inputTokens=tokens.input;trace.outputTokens=tokens.output;trace.providerModel=tokens.model;trace.cachedInputTokens=tokens.cachedInput;trace.reasoningOutputTokens=tokens.reasoningOutput;}if(budget)budget.tokens+=tokens.input+tokens.output;}if(trace)trace.status='succeeded';return result;}
  catch(error){if(stats)stats.failures++;if(trace)trace.status='failed';throw error;}
  finally{const elapsed=Date.now()-start;if(stats)stats.elapsedMs+=elapsed;if(trace)trace.elapsedMs=elapsed;}
}
export function addLlmTokens(input:number,output:number){const stats=scope.getStore(),safeInput=Number.isFinite(input)?input:0,safeOutput=Number.isFinite(output)?output:0;if(stats){stats.inputTokens+=safeInput;stats.outputTokens+=safeOutput;}const budget=budgets.getStore();if(budget)budget.tokens+=safeInput+safeOutput;}
