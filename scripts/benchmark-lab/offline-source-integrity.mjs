// Evaluate only existing pure source helpers, without importing production modules.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {ROOT,hash,writeJson} from './core.mjs';

globalThis.fetch=async()=>{throw Error('Network forbidden');};
const sources=Object.fromEntries(await Promise.all(['contentQuality','sourceCatalog'].map(async name=>[name,await fs.readFile(path.join(ROOT,'lib',name+'.ts'),'utf8')])));
async function isolated(name,names){
  const ast=ts.createSourceFile(name+'.ts',sources[name],ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const declarations=ast.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.includes(s.name?.text));
  assert.equal(declarations.length,names.length,'Every requested original helper must be found');
  const source=declarations.map(s=>s.getText(ast)).join('\n');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {verifiesQuote}=await isolated('contentQuality',['verifiesQuote']);
const {sourceCatalog,resolveSourceIds}=await isolated('sourceCatalog',['sourceCatalog','resolveSourceIds']);
const tests=[];
function observe(id,observed,expected){assert.deepEqual(observed,expected,id);tests.push({id,observed,expected});}
observe('production_superscript_collision',verifiesQuote('The formula is x2 = 4.', 'The formula is x\u00b2 = 4.'),true);
observe('production_case_sensitive_unit_collision',verifiesQuote('The current is 12 pa.', 'The current is 12 pA.'),true);
observe('production_short_visual_quote_rejected',verifiesQuote('41.8%','Swiss Life 41.8%'),false);
const sentence='Boundary condition applies only when the volume is fixed.';
const full='Intro '.repeat(159)+sentence+' End '.repeat(300);
const catalog=sourceCatalog([{page:1,text:full}]);
observe('catalog_preserves_all_characters',catalog.map(s=>s.text).join(''),full);
const crossing='A'.repeat(992)+'Rule valid only when T > 20 C.'+'B'.repeat(1000);
const sliced=sourceCatalog([{page:2,text:crossing}]);
observe('hard_boundary_splits_condition',sliced.some(s=>s.text.includes('Rule valid only when T > 20 C.')),false);
observe('hard_boundary_still_preserves_page',sliced.map(s=>s.text).join(''),crossing);
let unknownRejected=false;try{resolveSourceIds([{sourceId:'unknown'}],catalog);}catch{unknownRejected=true;}
observe('unknown_source_id_rejected',unknownRejected,true);
const resolved=resolveSourceIds([{sourceId:catalog[0].id}],catalog);
observe('server_materializes_original_text',resolved[0].quote,catalog[0].text);
const result={createdAt:new Date().toISOString(),apiCalls:0,generatedOutputs:0,scope:'Pure helper checks, predetermined source strings; no production generator import',sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)])),tests:tests.map(t=>({...t,observed:typeof t.observed==='string'?{length:t.observed.length,sha256:hash(t.observed)}:t.observed,expected:typeof t.expected==='string'?{length:t.expected.length,sha256:hash(t.expected)}:t.expected})),catalog:{fragmentLengths:catalog.map(s=>s.text.length),crossingFragmentLengths:sliced.map(s=>s.text.length)}};
const directory=path.join(ROOT,'data','benchmark-lab','offline-audit');
await writeJson(path.join(directory,'source-integrity.json'),result);
await writeJson(path.join(directory,'history','source-integrity-'+result.createdAt.replace(/[:.]/g,'-')+'.json'),result);
console.log(JSON.stringify({tests:tests.length,apiCalls:0,generatedOutputs:0,results:path.join(directory,'source-integrity.json')},null,2));
