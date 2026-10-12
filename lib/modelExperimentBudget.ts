import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {baseDataDirectory} from '@/lib/dataDirectory';

// Standard direct API rates checked 2026-10-11. Small counted requests only;
// no discounts are assumed. Unknown models require explicit operator rates.
const rates:Record<string,[number,number]>={
  'gpt-6.1-sol':[2,10],'gpt-6-luna':[0.1,0.5],'gpt-6-astra':[10,50],
  'gpt-4o':[2.5,10],'gpt-4o-mini':[0.15,0.6],
  'claude-sonnet-5-5':[2,10],'claude-opus-5-5':[4,20],
  'claude-haiku-5-5':[0.1,0.5],'claude-sonnet-5':[2,10],
};
export class ExperimentBudgetError extends Error {constructor(message:string){super(message);this.name='ExperimentBudgetError';}}
export interface PaidUsage {input:number;output:number;model?:string;cachedInput?:number;reasoningOutput?:number;}
export function configuredModelRates(model:string):[number,number]{
  const input=process.env.MORROW_INPUT_USD_PER_MILLION,output=process.env.MORROW_OUTPUT_USD_PER_MILLION;
  if(input!==undefined||output!==undefined){
    const values:[number,number]=[Number(input),Number(output)];
    if(input===undefined||output===undefined||values.some(n=>!Number.isFinite(n)||n<=0))throw new ExperimentBudgetError('Set both positive USD per million token rates.');
    return values;
  }
  if(!rates[model])throw new ExperimentBudgetError('Unknown model pricing: configure both USD per million token rates before a budgeted call.');
  return rates[model];
}
function openLedger(){
  const directory=baseDataDirectory();mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(path.join(directory,'llm-budget.sqlite'));
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS budget_sessions (id TEXT PRIMARY KEY, limit_usd REAL NOT NULL, halted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS paid_calls (id TEXT PRIMARY KEY, session TEXT NOT NULL, model TEXT NOT NULL, tool TEXT NOT NULL, status TEXT NOT NULL, charged_usd REAL NOT NULL, reserved_usd REAL NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_input_tokens INTEGER, reasoning_output_tokens INTEGER, created_at TEXT NOT NULL);`);
  return db;
}
export function budgetSnapshot(){
  const db=openLedger();try{return {sessions:db.prepare('SELECT * FROM budget_sessions').all(),calls:db.prepare('SELECT * FROM paid_calls ORDER BY created_at').all()};}finally{db.close();}
}
// The native counter is an estimate, so reserve a margin plus all output tokens
// (including reasoning). This is a local scheduling guard, not an invoice cap.
// Reservation survives crashes/timeouts and is shared atomically across workers.
export async function budgetedModelCall<T>(metadata:{model:string;tool:string;maxOutput:number},count:()=>Promise<number>,work:()=>Promise<T>,usage:(result:T)=>PaidUsage):Promise<T>{
  const configured=process.env.MORROW_LLM_MAX_USD;
  if(configured===undefined)return work();
  const limit=Number(configured),session=process.env.MORROW_LLM_BUDGET_SESSION??'installation';
  if(!Number.isFinite(limit)||limit<=0||!session.trim())throw new ExperimentBudgetError('Invalid persistent LLM budget configuration.');
  if(!Number.isInteger(metadata.maxOutput)||metadata.maxOutput<1)throw new ExperimentBudgetError('Invalid maximum output reservation.');
  const [inputRate,outputRate]=configuredModelRates(metadata.model);
  const counted=await count();
  if(!Number.isInteger(counted)||counted<0||counted>90000)throw new ExperimentBudgetError('Budgeted requests are limited to 90,000 counted input tokens. Split the source.');
  const inputCeiling=Math.ceil(counted*1.15)+2048;
  const reservation=(inputCeiling*inputRate+metadata.maxOutput*outputRate)/1e6;
  const id=randomUUID(),db=openLedger();
  try{
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT OR IGNORE INTO budget_sessions(id,limit_usd) VALUES(?,?)').run(session,limit);
      const state=db.prepare('SELECT limit_usd,halted FROM budget_sessions WHERE id=?').get(session)!;
      // Repeating a command cannot reset or enlarge the session budget.
      const effective=Math.min(Number(state.limit_usd),limit);
      db.prepare('UPDATE budget_sessions SET limit_usd=? WHERE id=?').run(effective,session);
      const spent=Number(db.prepare('SELECT COALESCE(SUM(charged_usd),0) AS total FROM paid_calls WHERE session=?').get(session)!.total);
      if(state.halted||spent+reservation>effective+1e-9)throw new ExperimentBudgetError(`LLM budget reached: $${spent.toFixed(4)} committed; next reservation $${reservation.toFixed(4)}; ceiling $${effective.toFixed(2)}. Checked outputs are preserved.`);
      db.prepare('INSERT INTO paid_calls(id,session,model,tool,status,charged_usd,reserved_usd,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,session,metadata.model,metadata.tool,'reserved',reservation,reservation,new Date().toISOString());
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    let result:T;
    try{result=await work();}catch(error){
      db.prepare("UPDATE paid_calls SET status='unknown' WHERE id=?").run(id);
      db.prepare('UPDATE budget_sessions SET halted=1 WHERE id=?').run(session);
      throw error;
    }
    const tokens=usage(result);
    if(!Number.isInteger(tokens.input)||tokens.input<0||!Number.isInteger(tokens.output)||tokens.output<0){
      db.prepare("UPDATE paid_calls SET status='unknown' WHERE id=?").run(id);
      db.prepare('UPDATE budget_sessions SET halted=1 WHERE id=?').run(session);
      throw new ExperimentBudgetError('Missing billable usage: session halted and reservation retained.');
    }
    const charged=(tokens.input*inputRate+tokens.output*outputRate)/1e6;
    db.prepare("UPDATE paid_calls SET status='settled',charged_usd=?,input_tokens=?,output_tokens=?,cached_input_tokens=?,reasoning_output_tokens=? WHERE id=?").run(charged,tokens.input,tokens.output,tokens.cachedInput??0,tokens.reasoningOutput??0,id);
    if(charged>reservation+1e-9){db.prepare('UPDATE budget_sessions SET halted=1 WHERE id=?').run(session);throw new ExperimentBudgetError('Actual usage exceeded the conservative reservation. Session halted; reconcile with provider billing.');}
    return result;
  }finally{db.close();}
}
