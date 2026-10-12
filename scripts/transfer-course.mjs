import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
// Explicit transfer between running installations. Never launches servers,
// reads credentials from files, or publishes the existing local application.
const args=process.argv.slice(2),value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
function endpoint(flag){
  const text=value(flag);if(!text)throw Error(`${flag} URL is required`);
  const url=new URL(text);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use a base URL without credentials or a path');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Transfers require HTTPS, except on localhost');
  return url.origin;
}
async function run(){
  const from=endpoint('--from'),to=endpoint('--to'),source=value('--from-course'),destination=value('--to-course');
  if(!source||!destination||![source,destination].every(id=>/^[a-zA-Z0-9_-]+$/.test(id)))throw Error('--from-course and --to-course are required');
  if(from===to&&source===destination)throw Error('Source and destination are the same course');
  const sourceToken=process.env.MORROW_SOURCE_TRANSFER_TOKEN??process.env.MORROW_TRANSFER_TOKEN,destinationToken=process.env.MORROW_DEST_TRANSFER_TOKEN??process.env.MORROW_TRANSFER_TOKEN;
  if(!sourceToken||!destinationToken||sourceToken.length<32||destinationToken.length<32)throw Error('Set transfer tokens in the environment (at least 32 characters)');
  const headers=(token,course)=>({'Authorization':`Bearer ${token}`,'X-Course-Id':course});
  async function call(url,options){const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok){const error=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(error.error??`HTTP ${response.status}`);}return response;}
  const state=await (await call(`${to}/api/transfer`,{headers:headers(destinationToken,destination)})).json();
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.next','transfers');
  const key=createHash('sha256').update(JSON.stringify([from,source,to,destination])).digest('hex'),file=path.join(root,`${key}.json`);
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined,replace=args.includes('--replace');
  if(!replace&&((previous&&previous.destinationRevision!==state.revision)||(!previous&&!state.empty)))throw Error('Destination has independent changes or is not empty. No data was written. Export both copies; use --replace only to deliberately replace the destination.');
  const download=await call(`${from}/api/transfer?download=true`,{headers:headers(sourceToken,source)}),chunks=[];let size=0;
  for await(const chunk of download.body){size+=chunk.byteLength;if(size>256*1024*1024)throw Error('Transfer exceeds 256 MiB');chunks.push(Buffer.from(chunk));}
  const preview=args.includes('--preview'),result=await (await call(`${to}/api/transfer${preview?'?preview=true':''}`,{method:'POST',headers:{...headers(destinationToken,destination),'Content-Type':'application/octet-stream','If-Match':`"${state.revision}"`},body:Buffer.concat(chunks)})).json();
  if(!preview){fs.mkdirSync(root,{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(temporary,JSON.stringify({destinationRevision:result.revision,updatedAt:new Date().toISOString()}),{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
  console.log(JSON.stringify({mode:preview?'preview':'transferred',...result},null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
