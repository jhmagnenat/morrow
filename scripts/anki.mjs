import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),action=args[0],value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
async function run(){
  const url=new URL(value('--url')??'http://localhost:3000');
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('This helper connects to a local Morrow server');
  const course=value('--course'),file=value('--file');if(!course||!/^[a-zA-Z0-9_-]+$/.test(course)||!file||!['preview','import','export'].includes(action))throw Error('Usage: node scripts/anki.mjs preview|import|export --course ID --file path [--url http://localhost:3000] [--progress]');
  const headers={'X-Course-Id':course};let response;
  if(action==='export'){
    const target=path.resolve(file);if(fs.existsSync(target))throw Error('Output already exists; choose a new path');
    response=await fetch(`${url.origin}/api/export?format=apkg${args.includes('--progress')?'&progress=true':''}`,{headers,redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error((await response.json()).error??`HTTP ${response.status}`);
    fs.mkdirSync(path.dirname(target),{recursive:true});const temporary=`${target}.${randomUUID()}.tmp`;
    try{fs.writeFileSync(temporary,Buffer.from(await response.arrayBuffer()),{flag:'wx'});fs.linkSync(temporary,target);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    console.log(JSON.stringify({file:target,exported:Number(response.headers.get('X-Exported-Cards')),excluded:Number(response.headers.get('X-Excluded-Cards'))}));
  }else{
    const source=path.resolve(file);if(fs.statSync(source).size>256*1024*1024)throw Error('Package exceeds 256 MiB');
    const form=new FormData();form.set('file',new File([fs.readFileSync(source)],path.basename(source)));form.set('preview',String(action==='preview'));form.set('progress',String(args.includes('--progress')));
    response=await fetch(`${url.origin}/api/anki/import`,{method:'POST',headers,body:form,redirect:'error',signal:AbortSignal.timeout(120000)});
    const result=await response.json();if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);console.log(JSON.stringify(result,null,2));
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
