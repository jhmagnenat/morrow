import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {isolatedModules} from './isolated-modules.mjs';

const env=await isolatedModules([]),directory=path.join(env.workspace,'pilot'),pdfFile=path.join(env.workspace,'slides.pdf');
const text='Insurance transfers specified financial risks under contractual conditions. Risk pooling combines losses from many insured individuals.';
const stream=`BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let source='%PDF-1.4\n',offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(source));source+=`${index+1} 0 obj\n${object}\nendobj\n`;}
const xref=Buffer.byteLength(source);source+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
fs.writeFileSync(pdfFile,source);
function cli(args){const result=spawnSync(process.execPath,['scripts/model-evaluation.mjs',...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr+result.stdout);return result.stdout;}
cli(['prepare',`--pdf=${pdfFile}`,`--case=${directory}`]);
const manifestFile=path.join(directory,'case.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
manifest.expectations[0].objectives=['Explain the specified risk transfer.'];fs.writeFileSync(manifestFile,JSON.stringify(manifest));
assert(cli(['run','--model=sol',`--case=${directory}`]).includes('Dry run only'));
assert(cli(['run','--model=sol',`--case=${directory}`,'--live=false']).includes('Dry run only'));
const driver=path.join(env.workspace,'driver.mjs');
fs.writeFileSync(driver,`
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
process.env.OPENAI_API_KEY='mock-no-network';let paid=0;
globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);if(String(url).endsWith('/input_tokens'))return Response.json({input_tokens:100});assert(String(url).endsWith('/responses'));paid++;
  const input=JSON.parse(body.input[0].content.find(c=>c.type==='input_text').text),tool=body.text.format.name;let output;
  if(tool==='reconstruct_teaching')output={units:[{title:'Insurance',claims:[{statement:'Insurance transfers specified financial risks under contractual conditions.',origin:'background',sourceIds:[input.sources.find(s=>input.primaryPages.includes(s.page)).id],uncertainty:''}]}]};
  else if(tool==='audit_teaching')output={decisions:Object.fromEntries(input.units.flatMap(u=>u.claims).map(c=>[c.id,{verdict:'accept',reason:'Explicit synthetic fixture'}]))};
  else if(tool==='teaching_cards')output={cards:[{topic:'Insurance',topicDefinition:input.lesson.units[0].claims[0].statement,question:'What does insurance transfer under specified contractual conditions?',answer:'Specified financial risks.',explanation:'The contract states which risks are transferred.',kind:'definition',objective:'Recall the specified risk transfer',claimIds:[input.lesson.units[0].claims[0].id]}]};
  else if(tool==='audit_teaching_cards')output={decisions:Object.fromEntries(input.cards.map(c=>[c.key,{accepted:true,atomic:true,unambiguous:true,relevant:true,reason:'Explicit synthetic fixture'}])),pages:Object.fromEntries(input.primaryPages.map(p=>['p'+p,{excluded:false,reason:'Teaching',missingObjectives:[]}]))};
  else throw Error('Unexpected stage '+tool);
  return Response.json({id:'test',object:'response',created_at:1,model:body.model,status:'completed',output:[{type:'message',id:'msg',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}});
};
const directory=${JSON.stringify(directory)};process.argv=[process.execPath,'scripts/model-evaluation.mjs','run','--model=sol','--case='+directory,'--live'];
await import(${JSON.stringify(new URL('./model-evaluation.mjs',import.meta.url).href)});
const results=fs.readdirSync(path.join(directory,'runs')).map(name=>JSON.parse(fs.readFileSync(path.join(directory,'runs',name,'result.json'),'utf8'))).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
const report=results.at(-1);assert.equal(report.status,'complete');assert.equal(report.cardIds.length,1);assert.equal(report.lessons.length,1);assert.equal(paid,results.length===1?4:0);assert.equal(report.usage.requests,paid);assert(report.costUsd>0);if(results.length>1){assert.equal(report.newCostUsd,0);assert.equal(report.costUsd,results[0].costUsd);}assert(fs.existsSync(path.join(directory,'runs',fs.readdirSync(path.join(directory,'runs')).at(-1),'review.html')));
`);
for(let i=0;i<2;i++){const result=spawnSync(process.execPath,[driver],{encoding:'utf8'});assert.equal(result.status,0,result.stderr+result.stdout);}
assert(!fs.existsSync(path.join(directory,'live.lock')));
console.log('PASS: actual pilot CLI preparation from PDF, dry-run zero calls, full four-stage pipeline/report with simulated SDK transport, and zero-call cache replay. Disposable data only.');
