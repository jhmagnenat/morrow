import path from 'node:path';
import nextEnv from '@next/env';
import {ROOT,LAB,prepareDocument,experimentDir,readJson,writeJson,hash} from './core.mjs';
import {estimate} from './provider.mjs';
import {implementationHash,runExperiment,latestRun,reviewSummary} from './runner.mjs';

const args=process.argv.slice(2),command=args.shift();
function option(key){const index=args.indexOf(`--${key}`);return index<0?undefined:args[index+1];}
try{
  if(command==='prepare'){
    if(!option('pdf'))throw Error('Supply --pdf <path>');
    const pages=option('pages')?.split(',').map(Number);
    const manifest=await prepareDocument(path.resolve(option('pdf')),{pages,config:option('config')?await readJson(path.resolve(option('config'))):{}});
    manifest.implementationHash=await implementationHash();await writeJson(path.join(experimentDir(manifest.id),'manifest.json'),manifest);
    console.log(JSON.stringify({experimentId:manifest.id,document:manifest.document.name,pages:manifest.document.pages.map(p=>p.page),preparationMs:manifest.preparationMs,paidCalls:0,instructions:'Start serve to validate essential knowledge, then run estimate. No generation occurred.'},null,2));
  }else if(command==='estimate'){
    const directory=experimentDir(option('experiment')??''),manifest=await readJson(path.join(directory,'manifest.json')),quote=estimate(manifest);await writeJson(path.join(directory,'quote.json'),quote);
    console.log(JSON.stringify(quote,null,2));
    console.log(`PAID EXECUTION IS LOCKED. After reviewing this estimate, explicitly approve with:\nnode scripts/benchmark-lab/cli.mjs run --experiment ${manifest.id} --approve ${quote.approvalId} --max-usd ${(Math.ceil(quote.conservativeCeilingUsd*1e6)/1e6).toFixed(6)}`);
  }else if(command==='run'||command==='demo'){
    if(command==='run'&&!option('approve'))throw Error('No approval supplied. No paid call is allowed. Run estimate and review the quote first.');
    if(command==='run')nextEnv.loadEnvConfig(ROOT,false,{info(){},error(){}});
    const report=await runExperiment(option('experiment')??'',{approve:option('approve'),maxUsd:Number(option('max-usd')),simulate:command==='demo'});
    console.log(JSON.stringify({runId:report.runId,status:report.status,simulated:report.simulated,results:path.join(LAB,'experiments',report.experimentId,'runs',report.runId),message:'Use the local blind review interface; no automatic pedagogical quality score.'},null,2));
    if(report.status!=='complete')process.exitCode=1;
  }else if(command==='compare'){
    const output=[];
    for(const id of (option('experiments')??option('experiment')??'').split(',')){
      for(const {directory,report} of await latestRun(experimentDir(id))){
        const reviews=await readJson(path.join(directory,'reviews.json'));
        output.push({experimentId:id,runId:report.runId,createdAt:report.createdAt,documentSha256:report.documentSha256,goldHash:hash(report.goldSnapshot),implementationHash:report.implementationHash,config:report.config,reviewPolicy:report.reviewPolicy,simulated:report.simulated,status:report.status,comparable:report.comparable,revealed:reviews.revealed,
          methods:reviews.revealed?reviewSummary(report,await readJson(path.join(directory,'blind-private.json')),reviews):null});
      }
    }
    console.log(JSON.stringify(output,null,2));
  }else if(command==='serve'){
    const {startServer}=await import('./server.mjs');await startServer({port:Number(option('port')??4177)});
  }else console.log('Commands:\n prepare --pdf <PDF> [--pages 1,2,3] [--config <JSON>]\n estimate --experiment <ID>\n run --experiment <ID> --approve <QUOTE_ID> --max-usd <CEILING>\n demo --experiment <ID> (synthetic offline outputs, no API)\n serve [--port 4177] (loopback, evaluation only; cannot launch paid calls)\n compare --experiments <ID1,ID2> (revealed results only)');
}catch(error){console.error(error.message);process.exitCode=1;}
