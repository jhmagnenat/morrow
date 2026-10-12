import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const fast=process.argv.includes('--fast');
if(fast)process.env.MORROW_GENERATION_PIPELINE='fast';
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry','structuredSchema'],{
  llm:`export function currentProviderLabel(){return 'intuitive-fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(){return 'data:image/png;base64,fixture';}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),schema=await env.load('structuredSchema');
const {generateSlides}=await env.load('generateSlides');
const source='For f(x)=x², Δf=2xh+h² for an increment h. The average rate is 2x+h when h≠0. The derivative is the limit as h tends to zero, f′(x)=2x. The first-order finite-change approximation is 2xh, not 2x.';
const goal='How does the exact local rate differ from a finite-change approximation?';
const plan={purpose:goal,learnerStartingPoint:'Understands squaring a number.',branches:[{key:'change',label:'Local and finite change',question:goal,summary:[source],pages:[1],scope:'One coupled mathematical mechanism.'}],progression:['Compare two nearby outputs','Divide by input change','Take the limit','Distinguish local rate from finite output change']};
const lesson={goalAnswer:'The derivative 2x is an exact local rate. A finite output change is 2xh+h? and its first-order approximation 2xh omits h?.',intuition:'A local slope measures how fast an output changes at one point; a finite step also follows the curvature.',analogy:{model:'',mapping:'',limit:''},mechanism:['For f(x)=x², expansion gives the exact change Δf=2xh+h².','Divide by nonzero h to obtain the average rate 2x+h. Its limit as h approaches zero is the exact derivative 2x.','The finite-change approximation 2xh omits h²; shrinking h makes the absolute error smaller.'],experiment:{setup:'Hypothetically, f(x)=x² changes from x=3 to x=3.1.',rule:'Use h=0.1, exact Δf=2xh+h² and first-order approximation 2xh.',question:'What are the exact change, approximation and their difference?',answer:'0.61, 0.60 and 0.01 respectively.',why:'2×3×0.1=0.60 and the omitted h²=0.01 adds to the exact change.'},technical:'The derivative 2x is an exact local rate, while 2xh approximates a finite output change. The difference quotient requires h≠0 before taking its limit.'};
let calls=[],rejectCardOnce=false;
if(fast)Object.assign(lesson,{conditions:'x and h are real; divide only by nonzero h.',limits:'The approximation omits h²; it is not an exact finite change.',transferTasks:[{setup:'Hypothetically x=4 and h=0.1.',assumptions:'Use f(x)=x² and Δf=2xh+h².',question:'What is the exact change?',answer:'0.81.',reasoning:'2×4×0.1+0.01 = 0.81.'}]});
globalThis.__complete=async(system,prompt,tool,description,inputSchema)=>{
  calls.push(tool);const input=JSON.parse(prompt);let output;
  if(tool==='plan_course')output=plan;
  else if(tool==='inventory_section')output={topics:[{label:'Local rate and finite change',question:goal,facts:[{detail:source,sourceId:input.sourceSnippets.find(s=>s.quote).id,visualDescription:''}]}]};
  else if(tool==='reconstruct_section'){
    const sourceId=input.sourceSnippets.find(s=>s.quote).id,evidence=[{sourceId}];
    output={pages:[{page:1,kind:'content',reason:'One coupled rate and approximation mechanism.'}],concepts:{'Local rate and finite change':{branchKey:'change',domain:'Mathematics',definition:'A local rate is a limit; a finite change additionally depends on curvature.',quote:'',visualDescription:'',layer:'course',evidence,note:{sourceDetails:[{detail:source,sourceId,visualDescription:''}],learning:lesson,courseContext:goal,bridges:[{kind:'deduction',question:'Why does the finite-change estimate differ?',explanation:'Expand (x+h)²−x² to obtain 2xh+h²; the omitted h² is the approximation error.',premiseSourceIds:[sourceId],assumptions:['Use f(x)=x².']}],sketch:{relations:['Finite output change: 2xh+h²','Average rate: 2x+h → local rate: 2x'],example:''},workflow:{before:'Specify function and point.',inputs:'Point x and nonzero increment h.',decision:'Choose a local rate or a finite-change calculation.',after:'Check whether the omitted h² matters.'},confusions:[{first:'Derivative 2x',second:'Finite-change approximation 2xh',distinction:'A rate must be multiplied by input change to estimate output change.'}],evidence}}},links:[]};
  }else if(tool==='draft_cards'){
    const concept=input.concepts[0];
    output={cards:[{key:input.repairTargets?.[0]?.key??'finite-change',concept:concept.key,relationSource:'',relationTarget:'',bridgeKeys:input.bridges.map(b=>b.key),question:'For f(x)=x², x=4 and h=0.1, compare exact output change 2xh+h² with approximation 2xh.',answer:'Exact change 0.81; approximation 0.80; difference h²=0.01.',example:'',kind:'application',objective:goal,quote:'',visualDescription:'',evidence:concept.evidence}]};
  }else if(tool==='audit_slide'){
    const rejected=rejectCardOnce;rejectCardOnce=false;
    output={bridges:input.bridges.map(b=>({key:b.key,supported:true,reason:'Algebra follows the stated function.'})),coverageComplete:!rejected,missingObjectives:rejected?['Correct the independently rejected application.']:[],teachingPoints:input.teachingPoints.map(p=>({key:p.key,supported:true,covered:true,reason:'Formula and conditions explained.'})),links:[],concepts:input.concepts.map(c=>({key:c.key,supported:true,identitySupported:true,contextual:true,detailsPreserved:true,consistent:true,scopeCorrect:true,learningSuccessful:true,learnerProbe:{question:'Given x=4 and h=0.1, is the first-order estimate exact?',expectedAnswer:'No: exact change is 0.81 instead of 0.80; omitted h² is 0.01.',reasoningSourceId:c.explanation.find(p=>p.text.includes('exact change Δf=2xh+h²')).id},existingMatch:Boolean(c.existingId),canonicalExistingId:c.existingId,reason:'The learner can calculate a different case.'})),existingCards:input.existingCards.map(c=>({id:c.id,duplicateOf:'',supported:true,coveredConcepts:input.concepts.map(c=>c.key),reason:'Same verified mechanism.'})),cards:input.cards.map(c=>({key:c.key,duplicateOf:input.existingCards.find(old=>old.objective===c.objective)?.id??'',supported:!rejected,consistent:true,scopeCorrect:true,atomic:true,unambiguous:true,coveredConcepts:[c.concept],reason:rejected?'Independent card rejection.':'Self-contained finite-change application.'}))};
  }else throw new Error('Unexpected paid stage '+tool);
  if(fast&&tool==='reconstruct_section')output.concepts=Object.entries(output.concepts).map(([label,c])=>{const {sketch,workflow,confusions,...note}=c.note;void sketch;void workflow;void confusions;return {...c,label,learningGoal:goal,note};});
  assert.deepEqual(schema.findSchemaViolations(output,inputSchema),[],tool);
  return output;
};
try{
  const doc=db.insertDocument({title:'Local and finite changes',kind:'course',pageCount:1});
  db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF fixture').buffer);
  await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.deepEqual(calls,fast?['plan_course','reconstruct_section','draft_cards','audit_slide']:['plan_course','inventory_section','reconstruct_section','draft_cards','audit_slide'],'Every path designs cards from original sources, including fast reconstruction');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete');
  const card=quality.getStudyCards()[0];assert.equal(card.kind,'application');assert(card.question.includes('x=4'));assert(card.answer.includes('0.81'));
  db.gradeCard('notion',card.id,'easy');const reviews=db.exportSnapshot().reviewState;
  calls=[];db.clearMapping();await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.deepEqual(calls,['draft_cards','audit_slide'],'Cached lessons do not bypass direct source card design and independent audit');
  assert.equal(quality.getStudyCards().length,1);assert.equal(quality.getStudyCards()[0].id,card.id);assert.deepEqual(db.exportSnapshot().reviewState,reviews);
  assert(quality.getStudyCards().some(c=>c.kind==='application'&&c.question.includes('h=0.1')),'The directly designed card carries its own inputs');
  calls=[];rejectCardOnce=true;quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.deepEqual(calls,['draft_cards','audit_slide','draft_cards','audit_slide'],'A rejected task gets one card-only repair, preserving the lesson');
  assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete',JSON.stringify(quality.pageAnalyses(doc.id)[0]));assert.equal(quality.getStudyCards()[0].id,card.id);assert.deepEqual(db.exportSnapshot().reviewState,reviews);
  console.log('PASS: source-designed candidates in both diagram and fast paths, no automatic lesson-to-card conversion, independent audit, card-only repair, cache reuse and preserved reviewed card IDs. No model calls.');
}finally{delete globalThis.__complete;}
