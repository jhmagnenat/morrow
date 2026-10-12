import {spawn} from 'node:child_process';
import nextEnv from '@next/env';
import {superviseProcess} from './process-supervisor.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const env={...process.env,NODE_ENV:process.env.NODE_ENV??'production',MORROW_GENERATION_EXECUTION:process.env.MORROW_GENERATION_EXECUTION??'worker'};
const worker=env.MORROW_GENERATION_EXECUTION==='worker'?superviseProcess(process.execPath,['scripts/generation-worker.mjs'],{
  env,onRestart:({code,signal,error,delay})=>console.error(`Generation worker stopped (${error?.message??signal??code}); restarting in ${delay} ms.`),
  onStart:({pid})=>{console.log(`Generation worker process: ${pid}`);process.send?.({type:'worker',pid});},
}):undefined;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start',...process.argv.slice(2)],{env,stdio:'inherit',windowsHide:true});
server.once('spawn',()=>process.send?.({type:'server',pid:server.pid}));
let stopping=false;
async function stop(code){
  if(stopping)return;stopping=true;
  server.kill('SIGTERM');await worker?.close();process.exitCode=code;
  if(process.connected)process.disconnect();
}
process.on('message',message=>{if(message==='shutdown')void stop(0);});
process.once('disconnect',()=>void stop(0));
process.once('SIGINT',()=>void stop(0));process.once('SIGTERM',()=>void stop(0));
server.once('error',error=>{console.error(error.message);void stop(1);});
server.once('exit',code=>void stop(code??1));
