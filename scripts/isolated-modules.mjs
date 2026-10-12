import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
export async function isolatedModules(names,stubs={}) {
  const root=process.cwd();await mkdir(path.join(root,'.next'),{recursive:true});
  names=[...names,'modelExperimentBudget','providerStructuredOutput'];
  const workspace=await mkdtemp(path.join(root,'.next','quality-test-'));
  process.env.MORROW_DATA_DIR=path.join(workspace,'data');
  process.env.MORROW_GENERATION_PIPELINE??='detailed';
  // Routes and backup helpers share these dependencies in isolated test sandboxes.
  names=[...names,'teachingCourse','teachingIntegrity','teachingStorage','reliabilityContext','professorGeneration','generationOutput','sourceSections','sourceDocument','generationEngine','generationRepository','generationTypes','generationLocks','directCardContracts','directCardGeneration','generationDispatch','auth','identityScope','ankiMedia','ankiImport','ankiPackage','ankiModern','ankiPackageExport','zipArchive','reliabilityReport','courseTransfer','reviewSync','pdfLayout','pdfOcr','sectionEvidence','generationLimits','sourceCatalog','knowledgeCompiler','llmTelemetry','learningCurriculum','contentAccuracy','accuracyAudit','notionSources','sourceSupplement','contentReview','visualGeneration','structuredSchema','cardDesign','documentUpload'];
  for(const name of [...new Set([...names, 'sourceRelations', 'coursePedagogy', 'clair', 'contentQuality', 'reliabilityChecks', 'dataDirectory', 'fsrs', 'generationPolicy','sectionPlanning','taskIdentity','recovery','fsrsOptimizer','schedulerMaintenance','reviewMaintenance'])]){
    const source=await readFile(path.join(root,'lib',`${name}.ts`),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return readFile(path.join(root,'references','legacy-generation',`${name==='generationEngine'?'generationEngine-pre-teacher':name}.ts.txt`),'utf8');});
    const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
    await writeFile(path.join(workspace,`${name}.mjs`),outputText.replace(/@\/lib\/([a-zA-Z]+)/g,'./$1.mjs'));
  }
  for(const [name,source] of Object.entries(stubs)){
    // Older scenario suites simulate a positive semantic reviewer. Keep this
    // explicit model fixture separate from the adversarial rejection corpus.
    // __accuracyComplete lets accuracy tests exercise the real review gate.
    const wrapped=name==='llm'&&/export (?:async )?function structuredCompletion/.test(source)?source.replace(/export ((?:async )?)function structuredCompletion/,'export $1function baseStructuredCompletion')+`
      import {observeLlm as accuracyTelemetry} from './llmTelemetry.mjs';
      export async function structuredCompletion(...args){
        if(args[2]!=='audit_accuracy')return baseStructuredCompletion(...args);
        return accuracyTelemetry(async()=>{
          if(globalThis.__accuracyComplete)return globalThis.__accuracyComplete(...args);
          const input=JSON.parse(args[1]);
          return {decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'Simulated positive reviewer, not a factual quality measurement.',claims:[{text:f.text,verdict:'supported',evidence:f.sourceIds.flatMap(id=>{const s=input.sources.find(s=>s.id===id);return s?[{sourceId:id,quote:s.text}]:[]}),reasoning:'This fixture assumes the supplied rule applies.'}]}))};
        },()=>({input:100,output:100}));
      }`:source;
    await writeFile(path.join(workspace,`${name}.mjs`),wrapped);
  }
  return {root,workspace,load:name=>import(pathToFileURL(path.join(workspace,`${name}.mjs`)).href),async route(relative,name){
    const source=await readFile(path.join(root,relative),'utf8');const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
    const file=path.join(workspace,`${name}.mjs`);
    await writeFile(file,outputText.replace(/@\/lib\/([a-zA-Z]+)/g,'./$1.mjs').replace(/(['"])next\/server\1/g,JSON.stringify(pathToFileURL(path.join(root,'node_modules/next/server.js')).href)));
    return import(pathToFileURL(file).href);
  }};
}
export const DATABASE_MODULES=['db','courses','courseScope','qualityDb','contentQuality','coursePedagogy','learningExplanation','intuitivePedagogy','teachingPolicy','courseLearningPlan','courseSections','documentGeneration','srs','xp','mastery','pdfStorage','backup'];

// Explicit fixture conversion, never a production fallback for old model contracts.
export function planDirectFixture(draft){return {targets:draft.knowledge.map(({page,claim,sourceIds,exclusionReason})=>({page,claim,sourceIds,exclusionReason}))};}
export function packDirectFixture(draft,input){
 const cards={};
 for(const planned of input.knowledge){const target=draft.knowledge.find(k=>k.claim===planned.claim&&k.page===planned.page);
  const candidate=target?.cardKeys.flatMap(key=>draft.cards.filter(c=>c.key===key))[0];
  if(candidate){const card={...candidate};delete card.key;cards[planned.key]=card;}
  else cards[planned.key]={topic:'Unresolved target',topicDefinition:planned.claim,question:'',answer:'',explanation:'',kind:'definition',objective:planned.claim,sources:planned.sourceIds.map(sourceId=>({sourceId})),visualDescription:''};
 }
 return {cards};
}
export function targetReviewFixture(input){return input.knowledge.map(t=>({key:t.key,verdict:t.exclusionReason?'non-teaching':'supported',atomic:true,selectionCorrect:true,coverageComplete:t.cardKeys.length>0,reason:'Explicit synthetic semantic decision; not a measured quality score.'}));}

export function packReviewFixture(response,input={}){
 if(!Array.isArray(response.targets))return response;
 if(new Set(response.targets.map(t=>t.key)).size!==response.targets.length||new Set(response.decisions.map(d=>d.key)).size!==response.decisions.length||new Set(response.pages.map(p=>p.page)).size!==response.pages.length)return response;
 return {targets:Object.fromEntries(response.targets.map(({key,coverageComplete,...t})=>[key,{selectionCorrect:true,...t,recallMatchesTarget:coverageComplete}])),decisions:Object.fromEntries(response.decisions.map(({key,...d})=>[key,d])),pages:Object.fromEntries(response.pages.map(({page,...p})=>['p'+page,{...p,questionCoverage:Object.fromEntries((input.requiredQuestions??[]).filter(q=>q.page===page).map(q=>[q.key,{cardKeys:p.objectives.flatMap(o=>o.cardKeys),reason:'Synthetic question-coverage fixture, not an accuracy judgment.'}]))}]))};
}

export function packPlanFixture(plan,input={}){return {...plan,targets:plan.targets.map(t=>({importance:'core',...t})),questions:Object.fromEntries((input.requiredQuestions??[]).map((q,index)=>{const targets=plan.targets.filter(t=>t.page===q.page);const target=targets[index]??{claim:'',sourceIds:input.sources.filter(s=>s.page===q.page).map(s=>s.id).slice(0,1),exclusionReason:''};return [q.key,{claim:target.claim,sourceIds:target.sourceIds,exclusionReason:target.exclusionReason}];}))};}
