import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readJson,writeJson,experimentDir,batches,hash,shuffled,provenanceIssues,validateGold} from './core.mjs';
import {estimate,createCaller} from './provider.mjs';
import {generateBatch} from './methods.mjs';

export async function implementationHash(){return hash(await Promise.all(['core','methods','provider','runner'].map(name=>fs.readFile(path.join(import.meta.dirname,`${name}.mjs`),'utf8'))));}
export async function runExperiment(id,{approve,maxUsd,simulate=false}={}){
  const directory=experimentDir(id),manifest=await readJson(path.join(directory,'manifest.json'));
  const quote=estimate(manifest);
  if(!simulate){
    const saved=await readJson(path.join(directory,'quote.json'));
    if(saved.approvalId!==quote.approvalId||approve!==quote.approvalId)throw Error('Paid execution requires explicit approval of the current quote ID. Run estimate first.');
    if(!Number.isFinite(maxUsd)||maxUsd+1e-9<quote.conservativeCeilingUsd)throw Error(`Approve the full conservative allowance of at least $${quote.conservativeCeilingUsd.toFixed(6)} to compare all three methods; no partial-budget winner.`);
    if(manifest.implementationHash!==await implementationHash())throw Error('Lab implementation changed since preparation. Prepare a new versioned experiment.');
    const gold=await readJson(path.join(directory,'gold.json'));validateGold(gold,manifest);if(!gold.validated)throw Error('Validate essential knowledge in the local interface before paid execution.');
    if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is missing; no request was sent');
  }
  if(hash(await fs.readFile(path.join(directory,'source.pdf')))!==manifest.document.sha256)throw Error('Original PDF changed');
  const lock=await fs.open(path.join(directory,'run.lock'),'wx');
  const runId=randomUUID(),runDir=path.join(directory,'runs',runId);
  try{
    await fs.mkdir(runDir,{recursive:true});
    const gold=await readJson(path.join(directory,'gold.json'));
    const report={runId,experimentId:id,createdAt:new Date().toISOString(),simulated:simulate,manifestHash:hash(manifest),documentSha256:manifest.document.sha256,config:manifest.config,reviewPolicy:{scale:5,acceptedMinimum:4,requiresNoCriticalError:true},implementationHash:await implementationHash(),goldSnapshot:gold,quote,order:shuffled(['A','B','C']),methods:{},status:'running'};
    const persist=()=>writeJson(path.join(runDir,'results.json'),report),budget={remaining:simulate?Infinity:quote.conservativeCeilingUsd};await persist();
    for(const method of report.order){
      const started=performance.now();
      const result=report.methods[method]={status:'running',cards:[],calls:[],firstCardsMs:null,firstReferencedCardsMs:null};await persist();
      const call=await createCaller(manifest,directory,{simulate,budget,onTrace:async trace=>{result.calls.push(trace);await persist();}});
      try{
        for(const [index,pages] of batches(manifest).entries())await generateBatch(method,pages,{config:manifest.config,call,
          artifact:(name,value)=>writeJson(path.join(runDir,`${method}-${index}-${name}.json`),value),
          onCards:async(cards,inputPages)=>{
            for(const card of cards){const issues=provenanceIssues(card.sources,inputPages);result.cards.push({...card,id:randomUUID(),referenceIssues:issues,receivedAtMs:performance.now()-started});}
            if(cards.length&&result.firstCardsMs===null)result.firstCardsMs=performance.now()-started;
            if(result.cards.some(c=>!c.referenceIssues.length)&&result.firstReferencedCardsMs===null)result.firstReferencedCardsMs=performance.now()-started;
            await persist();
          }});
        result.status='complete';
      }catch(error){result.status='failed';result.error=error.message;}
      result.totalMs=performance.now()-started;result.endToEndMs=manifest.preparationMs+result.totalMs;
      result.apiCalls=simulate?0:result.calls.length;result.simulatedCalls=simulate?result.calls.length:0;result.inputTokens=sumKnown(result.calls,'inputTokens');result.outputTokens=sumKnown(result.calls,'outputTokens');result.cachedInputTokens=sumKnown(result.calls,'cachedInputTokens');
      result.costUsd=result.calls.some(c=>c.costUsd===null)?null:result.calls.reduce((s,c)=>s+c.costUsd,0);
      result.knownCostUsd=result.calls.reduce((s,c)=>s+(c.costUsd??0),0);result.generatedCards=result.cards.length;result.cardsWithValidReferences=result.cards.filter(c=>!c.referenceIssues.length).length;
      result.uncachedEquivalentCostUsd=result.calls.some(c=>c.uncachedEquivalentCostUsd===null)?null:result.calls.reduce((s,c)=>s+c.uncachedEquivalentCostUsd,0);
      await persist();
      // Unknown billed usage on a failure must never trigger silent additional spending.
      if(!simulate&&result.calls.some(c=>c.status==='failed'&&c.costUsd===null)){report.stopReason='Unknown usage on provider failure; remaining methods were not launched.';break;}
    }
    report.status=report.order.every(m=>report.methods[m]?.status==='complete')?'complete':'incomplete';
    report.resolvedModels=[...new Set(Object.values(report.methods).flatMap(m=>m.calls.map(c=>c.providerModel).filter(Boolean)))];
    report.sameResolvedModel=report.resolvedModels.length===1;
    report.comparable=!simulate&&report.status==='complete'&&report.sameResolvedModel;
    const blind=shuffled(Object.entries(report.methods).flatMap(([method,result])=>result.cards.map(card=>({blindId:randomUUID(),method,cardId:card.id}))));
    await writeJson(path.join(runDir,'blind-private.json'),blind);await writeJson(path.join(runDir,'reviews.json'),{version:1,reviewer:'',cards:{},revealed:false});
    await persist();return report;
  }finally{await lock.close();await fs.unlink(path.join(directory,'run.lock'));}
}
function sumKnown(calls,key){return calls.some(c=>c[key]===null)?null:calls.reduce((s,c)=>s+c[key],0);}
export async function latestRun(directory){
  const entries=await fs.readdir(path.join(directory,'runs'),{withFileTypes:true}).catch(()=>[]),runs=[];
  for(const entry of entries.filter(e=>e.isDirectory())){const file=path.join(directory,'runs',entry.name,'results.json');const report=await readJson(file);runs.push({directory:path.dirname(file),report});}
  return runs.sort((a,b)=>b.report.createdAt.localeCompare(a.report.createdAt));
}
export function reviewSummary(report,blind,reviews){
  const essentials=report.goldSnapshot.items.filter(i=>i.essential);
  return Object.entries(report.methods).map(([method,result])=>{
    const rows=blind.filter(b=>b.method===method).map(b=>reviews.cards[b.blindId]).filter(Boolean),complete=rows.filter(r=>['relevance','accuracy','usability'].every(k=>Number.isInteger(r[k]))&&typeof r.criticalError==='boolean');
    const minimum=report.reviewPolicy?.acceptedMinimum??4;
    const accepted=complete.filter(r=>!r.criticalError&&r.accuracy>=minimum&&r.relevance>=minimum&&r.usability>=minimum);
    const covered=new Set(accepted.flatMap(r=>r.coveredKnowledge));
    return {method,status:result.status,totalCards:result.cards.length,reviewed:complete.length,unreviewed:result.cards.length-complete.length,
      relevance:average(complete,'relevance'),accuracy:average(complete,'accuracy'),usability:average(complete,'usability'),criticalErrors:complete.filter(r=>r.criticalError).length,acceptedCards:accepted.length,
      coverage:report.goldSnapshot.validated?{essential:essentials.length,covered:essentials.filter(i=>covered.has(i.id)).length,annotatedFraction:essentials.length?essentials.filter(i=>covered.has(i.id)).length/essentials.length:null,fullyReviewed:complete.length===result.cards.length}:null,
      totalMs:result.totalMs,firstCardsMs:result.firstCardsMs,firstReferencedCardsMs:result.firstReferencedCardsMs,apiCalls:result.apiCalls,inputTokens:result.inputTokens,outputTokens:result.outputTokens,cachedInputTokens:result.cachedInputTokens,costUsd:result.costUsd,uncachedEquivalentCostUsd:result.uncachedEquivalentCostUsd};
  });
}
function average(rows,key){return rows.length?rows.reduce((s,r)=>s+r[key],0)/rows.length:null;}
