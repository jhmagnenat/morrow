// Exercise compatibility with the explicitly requested rich-import path.
process.env.MORROW_IMPORT_LESSONS='1';
import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'sectionGeneration','qaGeneration'],{llm:`export function isLlmConfigured(){return true;}export function currentProviderLabel(){return 'card-design-fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,generateSlides:`const locks=new Set();export function generationLocks(){return locks;}export async function generateSlides(){throw Error('Unexpected visual fallback in text-card tests');}`});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),sections=await env.load('sectionGeneration'),scope=await env.load('courseScope'),courses=await env.load('courses'),design=await env.load('cardDesign');
const source='For a rectangle, area equals width multiplied by height. Both lengths use the same unit and area is measured in square units. Holding height fixed, doubling width doubles area. This rule is not asserted for arbitrary shapes.';
const lesson={intuition:'Count the unit squares covering a rectangle.',goalAnswer:'Width counts squares in a row; height counts rows. Multiplying them counts unit squares.',mechanism:['Count the width in unit squares.','Multiply the squares in a row by the number of rows.'],technical:'Rectangle area is width multiplied by height in square units.',conditions:'The shape is a rectangle and lengths use the same unit.',limits:'This product does not give the area of every shape.',experiment:{setup:'Hypothetically, the rectangle in the picture has width 6 metres and height 4 metres.',rule:'Area equals width multiplied by height.',question:'What is its area?',answer:'24 square metres.',why:'6 * 4 = 24.'}};
let scenario='correct',tools=[];
globalThis.__complete=async(system,prompt,tool)=>{
  const input=JSON.parse(prompt);tools.push(tool);
  if(tool==='learn_section'){
    assert(system.includes('answer starts with the direct answer'));
    assert(system.includes('Design the cards DIRECTLY from the original source material'));
    const cards=['direct-cards','factual-only','specific-evidence','rejected-lesson','rejected-identity'].includes(scenario)?[
      {key:'area:meaning',concept:'area',kind:'definition',objective:'Meaning of rectangle area',question:'What does the area of a rectangle measure?',answer:'The surface covered by the rectangle, measured in square units.'},
      {key:'area:change',concept:'area',kind:'mechanism',objective:'Width change with fixed height',question:'For a rectangle, what happens to its area if width doubles while height stays fixed?',answer:'Area doubles, because area equals width multiplied by the unchanged height.'},
      {key:'area:calculate',concept:'area',kind:'application',objective:'Apply rectangle area',question:'Hypothetically, a rectangle is 6 metres wide and 4 metres high. What is its area?',answer:'24 square metres, because 6 * 4 = 24.'},
    ]:undefined;
    if(['factual-only','specific-evidence','rejected-lesson','rejected-identity'].includes(scenario))cards.splice(1);
    if(scenario==='explicit-empty-cards')return {title:'Rectangle area',concepts:[{key:'area',label:'Rectangle area',definition:'The surface covered by a rectangle, measured in square units.',goal:'Why does multiplying width by height give rectangle area?',lesson,sources:[{sourceId:input.sourceSnippets[0].id}]}],cards:[],relations:[]};
    for(const card of cards??[])card.sources=[{sourceId:input.sourceSnippets[0].id}];
    if(cards&&system.includes('Card coverage: COMPREHENSIVE.'))cards.push({key:'area:units',concept:'area',kind:'comparison',objective:'Length units versus area units',question:'How do the units of rectangle width and rectangle area differ?',answer:'Width uses length units, while area uses square units because it multiplies two lengths.'});
    return {title:'Rectangle area',concepts:[{key:'area',label:'Rectangle area',definition:'The surface covered by a rectangle, measured in square units.',goal:'Why does multiplying width by height give rectangle area?',lesson,sources:(scenario==='specific-evidence'?input.sourceSnippets:[input.sourceSnippets[0]]).map(s=>({sourceId:s.id}))}],cards,relations:[]};
  }
  if(tool==='audit_learning_section')return {assertions:input.assertions.map(a=>({key:a.key,supported:!['rejected-lesson','rejected-identity'].includes(scenario)||!a.key.endsWith(':technical'),pages:a.pages,reason:''})),pages:input.primaryPages.map(page=>({page,complete:true,excluded:false,missing:[],reason:''})),concepts:[{key:'area',accepted:!['rejected-lesson','rejected-identity'].includes(scenario),identitySupported:scenario!=='rejected-identity',existingId:'',reason:'The explanation fails independently of its factual identity.'}],cards:input.cards.map(c=>({key:c.key,accepted:!c.question.includes('picture'),duplicateOf:'',reason:c.question.includes('picture')?'The question refers to a picture which the learner cannot access. State the full hypothetical situation on the card.':''})),relations:[]};
  if(tool==='repair_course_cards'){
    assert.equal(input.requests.length,1,'Accepted cards are not rewritten');
    assert(input.requests[0].issues.some(i=>i.includes('picture')));
    assert.equal(input.sources[0].text.trim(),source,'Correction uses genuine original evidence');
    const original=input.requests[0].card;
    return {cards:[{key:original.key,question:scenario==='wrong-objective'?'What is the definition of a rectangle?':'Hypothetically, a rectangle is 6 metres wide and 4 metres high. What is its area in square metres?',answer:scenario==='wrong-calculation'?'30 square metres because 6 * 4 = 30.':scenario==='wrong-meaning'?'24 metres, because width multiplied by height gives a length.':'24 square metres, because 6 * 4 = 24 and multiplying two lengths gives square units.',sourceIds:scenario==='forged'?['foreign-source']:original.sourceIds}]};
  }
  if(tool==='audit_card_design')return {decisions:input.candidates.map(c=>({key:c.key,sameObjective:scenario!=='wrong-objective',answersQuestion:true,atomic:true,selfContained:true,answerNotDisclosed:true,reason:scenario==='wrong-objective'?'The rewrite substituted vocabulary for applying the area rule.':''}))};
  if(tool==='generate_qa')return {cards:[{question:'What is the area of the rectangle in the picture?',answer:'24 square metres.',kind:'application',objective:'Apply rectangle area',sourceIds:[input.snippets[0].id]}]};
  if(tool==='audit_qa')return {decisions:[{index:0,supported:true,answersQuestion:true,atomic:false,duplicateOf:'',reason:'The question refers to a picture which is absent. Specify the hypothetical dimensions.'}]};
  throw Error(`Unexpected ${tool}`);
};
globalThis.__accuracyComplete=async(system,prompt)=>{
  const input=JSON.parse(prompt);
  if(scenario==='specific-evidence')for(const field of input.fields.filter(f=>f.key.startsWith('card:')))assert.equal(field.sourceIds.length,1,'Factual review uses card-specific evidence, not the whole concept bibliography');
  return {decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,reason:'',claims:[{text:f.text,verdict:scenario==='wrong-meaning'&&f.text.includes('gives a length')?'contradicted':'supported',evidence:f.sourceIds.map(id=>({sourceId:id,quote:input.sources.find(s=>s.id===id).text})),reasoning:'Area uses square units; multiplying lengths does not give length.'}]}))};
};
try{
  const generationRoute=await env.route('app/api/documents/[id]/generate/route.ts','generation-profile-route');
  const beforeInvalid=tools.length;
  assert.equal((await generationRoute.POST(new Request('http://localhost/api/documents/x/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cardDetail:'unverified-shortcuts'})}),{params:Promise.resolve({id:'x'})})).status,400);
  assert.equal(tools.length,beforeInvalid,'Invalid coverage requests cannot start model calls');
  const {relevantContext}=await env.load('generationPolicy');
  const longSource=source+' '.repeat(2600)+' Essential restriction at the end of the source page.';
  assert(relevantContext([1],[{page:1,text:source},{page:2,text:longSource}],1,null)[0].text.includes('Essential restriction at the end'),'Selected full context preserves late applicability conditions');
  await scope.withCourse(courses.createCourse('Direct source cards').id,async()=>{
    scenario='direct-cards';const before=tools.length;
    const doc=db.insertDocument({title:'Direct source fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(result.readyCards,3,'Source-designed card count follows distinct objectives rather than an exactly-two template');
    assert.deepEqual(quality.getStudyCards().map(c=>c.kind).sort(),['application','definition','mechanism']);
    assert(quality.getStudyCards().every(c=>c.answer.length<120&&c.accuracyReview&&c.evidence.length));
    assert.equal(tools.slice(before).filter(t=>t==='learn_section').length,1,'Direct card design shares the original writing request');
    assert(!tools.slice(before).includes('repair_course_cards'));scenario='correct';
    scenario='direct-cards';quality.retryPages(doc.id,[1]);
    const comprehensive=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,cardDetail:'comprehensive'});
    assert.equal(comprehensive.readyCards,4,'Comprehensive generation can retain a separately examinable distinction');
    assert.equal(tools.slice(before).filter(t=>t==='learn_section').length,2,'A changed coverage preference has a separate generation cache');
    quality.retryPages(doc.id,[1]);await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false,cardDetail:'key-ideas'});
    assert.equal(tools.slice(before).filter(t=>t==='learn_section').length,2,'Returning to the same source/settings reuses the original generation');scenario='correct';
  });
  await scope.withCourse(courses.createCourse('Source factual objective').id,async()=>{
    scenario='factual-only';
    const doc=db.insertDocument({title:'Factual recall fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(result.readyCards,1);
    assert.equal(quality.getStudyCards()[0].kind,'definition');
    assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete','Independently approved factual coverage does not require a fabricated causal card');
    scenario='correct';
  });
  await scope.withCourse(courses.createCourse('Specific card evidence').id,async()=>{
    scenario='specific-evidence';
    const doc=db.insertDocument({title:'Separated source snippets',kind:'course',pageCount:1});
    db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source+' '.repeat(1100)+'The distinction between length units and square units remains essential for interpreting the measured area.'}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(result.readyCards,1);
    const card=quality.getStudyCards()[0],notion=db.getGraph().notions[0];
    assert.equal(card.evidence.length,1,'The published card retains only its independently checked passage');
    assert(quality.getNotionMetadata()[notion.id].evidence.length>1,'Lesson evidence can remain broader without diluting card provenance');
    scenario='correct';
  });
  await scope.withCourse(courses.createCourse('No invented fallback cards').id,async()=>{
    scenario='explicit-empty-cards';
    const doc=db.insertDocument({title:'Explicit empty recall draft',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(result.cardsCreated,0,'An explicit empty source-designed deck never becomes automatic lesson-derived cards');
    assert.equal(quality.getStudyCards().length,0);
    assert.equal(quality.pageAnalyses(doc.id)[0].status,'retry','Missing recall coverage remains explicit');
    scenario='correct';
  });
  for(const rejected of ['rejected-lesson','rejected-identity'])await scope.withCourse(courses.createCourse(rejected).id,async()=>{
    scenario=rejected;
    const doc=db.insertDocument({title:'Independent identity and card validation',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    if(rejected==='rejected-lesson'){
      assert.equal(result.readyCards,1,'A separately reviewed source card does not depend on acceptance of an explanatory lesson');
      const notion=db.getGraph().notions[0];
      assert.equal(notion.explanation,'','Rejected lesson prose is never published');
      assert(!notion.clair,'Rejected experiments are never turned into learning tasks');
      assert(quality.getStudyCards()[0].accuracyReview,'Card publication still requires a factual review and source fingerprint');
      assert(quality.pageAnalyses(doc.id)[0].missingObjectives.some(item=>item.startsWith('Verify lesson:')),'Incomplete lessons remain visible as missing work');
    }else{
      assert.equal(result.readyCards,0,'A rejected identity cannot be used to publish a card');
      assert.equal(db.getGraph().notions.length,0);
    }
    scenario='correct';
  });
  await scope.withCourse(courses.createCourse('Useful correction').id,async()=>{
    const doc=db.insertDocument({title:'Rectangle fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
    const result=await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(result.readyCards,2,'A failed draft becomes a useful, freshly reviewed card');
    assert.equal(quality.pageAnalyses(doc.id)[0].status,'complete');
    const application=quality.getStudyCards().find(c=>c.kind==='application');
    assert(!application.question.includes('picture'));assert(application.question.includes('6 metres'));assert(application.answer.includes('square units'));
    assert(tools.includes('repair_course_cards')&&tools.includes('audit_card_design'));
    db.gradeCard('notion',application.id,'good');const history=db.exportSnapshot().reviewState;
    const before=tools.filter(t=>t==='repair_course_cards').length;quality.retryPages(doc.id,[1]);
    await sections.generateLearningSection(doc.id,{mode:'strict',enrichment:false});
    assert.equal(quality.getStudyCards().length,2);assert.deepEqual(db.exportSnapshot().reviewState,history);
    assert.equal(tools.filter(t=>t==='repair_course_cards').length,before,'Exact corrective feedback reuses the already reviewed correction');
  });
  await scope.withCourse(courses.createCourse('Improved Q&A').id,async()=>{
    const doc=db.insertDocument({title:'Q&A fixture',kind:'course',pageCount:1});db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:`  ${source}\n`}]);
    const notion=db.insertNotion({label:'Rectangle area',domain:'Geometry',definition:'Rectangle area is measured in square units.',status:'draft',sources:[{documentId:doc.id,page:1}]});
    const qa=await env.load('qaGeneration'),result=await qa.generateQaQuestions(notion.id);
    assert.equal(result.ready,1,'Novel Q&A also repairs an ambiguous draft into a self-contained application');
    const card=quality.getStudyCards()[0];assert.equal(card.status,'ready','Whole-source fingerprints preserve original whitespace');assert(card.question.includes('6 metres'));assert(card.answer.includes('square units'));
    db.gradeCard('notion',card.id,'easy');const history=db.exportSnapshot().reviewState;
    quality.saveStudyCard({...card,question:'What is the area of the rectangle in the picture?',answer:'24 square metres.',accuracyReview:undefined,status:'draft'});
    const improved=await qa.generateQaQuestions(notion.id);
    assert.equal(improved.created,0);assert.equal(improved.improved,1,'A verified correction upgrades an existing automatic draft instead of skipping it as a duplicate');
    assert.equal(quality.getStudyCards().length,1);assert.equal(quality.getStudyCards()[0].id,card.id);assert.equal(quality.getStudyCards()[0].status,'ready');assert.deepEqual(db.exportSnapshot().reviewState,history);
  });
  for(scenario of ['wrong-calculation','wrong-objective','wrong-meaning','forged'])await scope.withCourse(courses.createCourse(scenario).id,async()=>{
    const card={key:'area:application',concept:'area',question:'What is the area of the rectangle in the picture?',answer:'24 square metres.',kind:'application',objective:'Apply rectangle area',sourceIds:['S1']};
    const result=await design.repairCourseCards([{card,issues:['The question relies on an absent picture.']}],[{id:'S1',text:source}],{subject:'Rectangle area'});
    assert.equal(result.cards.length,0,`${scenario}: rewriting does not waive objective, arithmetic or factual checks`);
    const before=tools.length;await design.repairCourseCards([{card,issues:['The question relies on an absent picture.']}],[{id:'S1',text:source}],{subject:'Rectangle area'});assert.equal(tools.length,before,'Failed corrections do not trigger a paid retry loop');
  });
  console.log('PASS: real progressive card correction, preserved objective, self-contained worked answer, separate design/factual reviews, correct publication, unchanged FSRS/IDs, correction cache and rejected arithmetic/objective/semantic/forged-source rewrites. Simulated models; no measured quality score.');
}finally{delete globalThis.__complete;delete globalThis.__accuracyComplete;for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
