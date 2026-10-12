import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const root=process.cwd(),fixtures=JSON.parse(await readFile(path.join(root,'references/slide-quality-fixtures.json'),'utf8'));
const live=process.argv.includes('--live');
const modules=live?[...DATABASE_MODULES,'generateSlides','llm','llmTelemetry','structuredSchema']:['contentQuality','structuredSchema'];
const env=await isolatedModules(modules,live?{pdf:`export async function renderPdfPageAsDataUrl(){throw new Error('Text-only evaluation fixture');}`} : {});
const q=await env.load('contentQuality'),schema=await env.load('structuredSchema');
const report={mode:live?'live-text':'offline-guard-regression',cases:[],note:live?'Text-only model evaluation; visual accuracy requires real slide images.':'Offline tests exercise safety gates with annotated audit decisions, not model semantic accuracy.'};
if(!live){
  for(const fixture of fixtures){
    const excluded=['agenda','administrative','bibliography','empty'].includes(fixture.kind);
    const accepted=!excluded && fixture.supported && q.verifiesQuote(fixture.quote,fixture.text) && q.cardQuality(fixture.question,fixture.answer).length===0;
    assert.equal(accepted,fixture.ready,fixture.name);
    report.cases.push({name:fixture.name,expectedReady:fixture.ready,actualReady:accepted,passed:true});
  }
  const shape={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['content','agenda']},page:{type:'integer',minimum:1},cards:{type:'array',maxItems:2,items:{type:'string'}}},required:['kind','page','cards']};
  assert.equal(schema.findSchemaViolations({kind:'content',page:1,cards:[]},shape).length,0);
  for(const output of [{kind:'invented',page:1,cards:[]},{kind:'content',page:1.5,cards:[]},{kind:'content',page:0,cards:[]},{kind:'content',page:1,cards:[{},'x']},{kind:'content',page:1,cards:[],unexpected:true}])assert(schema.findSchemaViolations(output,shape).length>0);
  console.log(`PASS: ${fixtures.length} annotated slide cases and structured-output rejection checks. No paid LLM call.`);
}else{
  const {default:nextEnv}=await import('@next/env');nextEnv.loadEnvConfig(root,true,{info(){},error(){}});
  process.chdir(env.workspace);
  const llm=await env.load('llm');if(!llm.isLlmConfigured())throw new Error('Configure an LLM provider before using --live');
  const db=await env.load('db'),quality=await env.load('qualityDb'),{generateSlides}=await env.load('generateSlides');
  try{
    for(const fixture of fixtures){
      if(fixture.visual){report.cases.push({name:fixture.name,skipped:'Requires a real slide image'});continue;}
      const doc=db.insertDocument({title:`Evaluation: ${fixture.name}`,kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:fixture.text}]);
      await generateSlides(doc.id,{mode:'strict',enrichment:false});
      const notions=db.getGraph().notions.filter(n=>n.sources.some(s=>s.documentId===doc.id));
      const expected=new Set(fixture.labels.map(q.canonicalLabel)),actual=new Set(notions.map(n=>q.canonicalLabel(n.label)));
      const matching=[...actual].filter(n=>expected.has(n)).length;
      const cards=quality.getStudyCards().filter(c=>c.evidence.some(e=>e.documentId===doc.id));
      report.cases.push({name:fixture.name,expectedLabels:fixture.labels,actualLabels:notions.map(n=>n.label),exactLabelPrecision:actual.size?matching/actual.size:expected.size?0:1,exactLabelRecall:expected.size?matching/expected.size:actual.size?0:1,readyCards:cards.filter(c=>c.status==='ready').length,draftCards:cards.filter(c=>c.status==='draft').length,needsHumanSemanticReview:true});
    }
    console.log('Live evaluation saved. Exact-label scores do not assess answer truth; inspect the source/card pairs.');
  }finally{for(const conn of globalThis.__courseDbs?.values()??[])conn.close();process.chdir(root);}
}
await writeFile(path.join(root,'.next/slide-quality-report.json'),JSON.stringify(report,null,2));
