// Run beside Next.js under a supervisor with automatic restart enabled.
// The queue/lease lives in each course's SQLite file, never in this process.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production',{info(){},error(){}});
const directory=path.join(process.cwd(),'.next','generation-worker',String(process.pid));
await mkdir(directory,{recursive:true});
for(const file of await readdir('lib'))if(file.endsWith('.ts')){
  const source=await readFile(path.join('lib',file),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  await writeFile(path.join(directory,file.replace(/\.ts$/,'.mjs')),outputText.replace(/@\/lib\/([a-zA-Z0-9]+)/g,'./$1.mjs'));
}
const load=name=>import(pathToFileURL(path.join(directory,`${name}.mjs`)).href);
const courses=await load('courses'),scope=await load('courseScope'),jobs=await load('documentGeneration');
const auth=await load('auth'),identity=await load('identityScope');
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
console.log('Morrow generation worker ready. Durable queue, one document at a time.');
const configuredDelay=Number(process.env.MORROW_WORKER_POLL_MS??500);
const delay=Number.isFinite(configuredDelay)?Math.min(10000,Math.max(250,configuredDelay)):500;
while(!stopping){
  for(const user of auth.authEnabled()?auth.listUsers():[undefined])await identity.withUser(user,async()=>{
  for(const course of courses.listCourses()){
    if(stopping)break;
    try{
      const ids=scope.withCourse(course.id,()=>jobs.resumeDocumentGenerations(1));
      for(const id of ids){console.log(`Processing ${course.id}: ${id}`);await jobs.waitForDocumentGeneration(id);}
    }catch(error){console.error('Worker iteration failed:',error.message);}
  }
  });
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,delay));
}
for(const db of globalThis.__courseDbs?.values()??[])db.close();
