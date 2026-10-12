// Produce a reviewable patch; never write production files or generate content.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {ROOT,hash,writeJson} from './core.mjs';

globalThis.fetch=async()=>{throw Error('Network forbidden');};
const target=path.join(ROOT,'lib','contentQuality.ts');
const original=await fs.readFile(target,'utf8');
const ast=ts.createSourceFile(target,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const declaration=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='verifiesQuote');
assert(declaration,'Production helper must exist');
const baseline=declaration.getText(ast);
assert(baseline.includes('normalize("NFKC")')&&baseline.includes('.toLowerCase()'),'Re-audit if the production helper changes');
const candidate=baseline.replace('normalize("NFKC")','normalize("NFC")').replace('.toLowerCase()','');
async function load(source){
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).verifiesQuote;
}
const before=await load(baseline),after=await load(candidate);
const cases=[
  ['superscript','The formula is x2 = 4.','The formula is x\u00b2 = 4.',false],
  ['unit_case','The current is 12 pa.','The current is 12 pA.',false],
  ['unit_prefix','The amount is 12 mA.','The amount is 12 MA.',false],
  ['subscript','The compound is H2O.','The compound is H\u2082O.',false],
  ['operator','The rule is a + b = 3.','The rule is a - b = 3.',false],
  ['exact_formula','The formula is x\u00b2 = 4.','The formula is x\u00b2 = 4.',true],
  ['exact_unit','The current is 12 pA.','The current is 12 pA.',true],
  ['whitespace','Pressure = 12 kPa.','Pressure\n=\u00a012  kPa.',true],
  ['canonical_unicode','La r\u00e9sistance est fixe.','La re\u0301sistance est fixe.',true],
  ['empty','','Pressure = 12 kPa.',false],
  ['short','41.8%','Swiss Life 41.8%',false],
  ['absent','Pressure = 900 kPa.','Pressure = 12 kPa.',false],
];
const observations=cases.map(([id,quote,source,expected])=>{const observed=after(quote,source);assert.equal(observed,expected,id);return {id,quote,source,baseline:before(quote,source),candidate:observed,expected};});
const line=original.slice(0,declaration.getStart(ast)).split('\n').length;
const patch=`diff --git a/lib/contentQuality.ts b/lib/contentQuality.ts\n--- a/lib/contentQuality.ts\n+++ b/lib/contentQuality.ts\n@@ -${line},4 +${line},4 @@\n ${baseline.split('\n')[0]}\n-${baseline.split('\n')[1]}\n+${candidate.split('\n')[1]}\n ${baseline.split('\n')[2]}\n ${baseline.split('\n')[3]}\n`;
const proposal=path.join(ROOT,'references','proposals','preserve-scientific-source-quotes.patch');
await fs.mkdir(path.dirname(proposal),{recursive:true});
// Hunk context must preserve the production file's line endings, including its closing brace.
const ending=original.includes('\r\n')?'\r\n':'\n';
await fs.writeFile(proposal,patch.replace(/\r?\n/g,ending));
assert.equal(await fs.readFile(target,'utf8'),original,'Production file must remain unchanged');
const report={createdAt:new Date().toISOString(),status:'Proposed only, not applied',apiCalls:0,generatedOutputs:0,productionSha256:hash(original),candidateFunctionSha256:hash(candidate),checks:observations,limitations:['Exact provenance is not semantic entailment.','Whitespace folding remains unchanged.','The 12-character minimum remains unchanged.','Case-altered or typographically compatible quotations would now be rejected; quotes should be materialized from original source IDs.','No effects on real flashcard quality or downstream publication have been measured.']};
const directory=path.join(ROOT,'data','benchmark-lab','offline-audit');
await writeJson(path.join(directory,'quote-proposal.json'),report);
await writeJson(path.join(directory,'history','quote-proposal-'+report.createdAt.replace(/[:.]/g,'-')+'.json'),report);
console.log(JSON.stringify({checks:observations.length,changedDecisions:observations.filter(c=>c.baseline!==c.candidate).map(c=>c.id),patch:proposal,applied:false,apiCalls:0,generatedOutputs:0},null,2));
