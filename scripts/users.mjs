import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import ts from 'typescript';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const name=process.argv[2];if(!name)throw Error('Usage: node scripts/users.mjs account-name [--owner]. Password is read from stdin, never a command-line argument.');
const directory=path.join(process.cwd(),'.next','account-admin');await mkdir(directory,{recursive:true});
for(const name of ['auth','dataDirectory','identityScope']){
  const source=await readFile(`lib/${name}.ts`,'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/@\/lib\/([a-zA-Z]+)/g,'./$1.mjs');
  await writeFile(path.join(directory,`${name}.mjs`),output);
}
let password='';for await(const chunk of process.stdin)password+=chunk;
const auth=await import(pathToFileURL(path.join(directory,'auth.mjs')).href);
try{const user=await auth.provisionUser(name,password.replace(/\r?\n$/,''),process.argv.includes('--owner'));console.log(`Account created: ${user.name}. ${user.storageId==='local'?'Uses the existing local workspace.':'Uses an isolated workspace.'}`);}
finally{for(const db of globalThis.__authDbs?.values()??[])db.close();}
