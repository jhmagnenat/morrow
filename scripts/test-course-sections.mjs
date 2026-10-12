import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'generateSlides','llmTelemetry','structuredSchema'],{
  llm:`export function currentProviderLabel(){return 'section-fixture';}export async function structuredCompletion(...args){return globalThis.__complete(...args);}`,
  pdf:`export async function renderPdfPageAsDataUrl(buffer,page){return 'data:image/png;base64,'+page;}`,
});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb'),storage=await env.load('pdfStorage'),sections=await env.load('courseSections'),schema=await env.load('structuredSchema');
const {generateSlides}=await env.load('generateSlides');
const texts={1:'A policyholder pays a premium to an insurer in exchange for contractual cover against a specified risk.',2:'Property and casualty insurance includes motor insurance. Life insurance can provide a death benefit.',3:'A broker intermediates between the policyholder and insurer; intermediation is distinct from bearing the insured risk.',4:'Course assessment: final examination 60%, attendance 40%.',5:'An insurer transfers part of its risk to a reinsurer. FINMA supervises insurers; supervision is distinct from insurance risk transfer.'};
const doc=db.insertDocument({title:'Insurance actors and products',kind:'course',pageCount:5});
const passages=Object.entries(texts).map(([page,text])=>({documentId:doc.id,page:Number(page),ordinal:0,text}));
db.insertPassages(passages);storage.savePdfFile(doc.id,new TextEncoder().encode('%PDF-1.7 fixture').buffer);
const plan={purpose:'Understand who bears risk, who intermediates and who supervises.',learnerStartingPoint:'No insurance knowledge.',branches:[{key:'actors',label:'Actors and flows',question:'Who does what?',summary:['Policyholder pays for insurer cover; broker intermediates.','Insurer transfers part of risk to a reinsurer; FINMA supervises.'],pages:[1,3,5],scope:'Actor roles and distinct flows.'},{key:'products',label:'Products and covered events',question:'What is covered?',summary:['Motor cover belongs to property and casualty; a death benefit belongs to life insurance.'],pages:[2],scope:'Product families and covered events.'}],progression:['Need cover','Identify risk bearer','Distinguish intermediation, risk transfer and supervision']};
let calls=[],repairCard=false,rejectLesson=false,badPlanOnce=false,badSectionOnce=false,denseOnce=false,contradictAudit=false,missingDetailCount=0,badProbeOnce=false,missingRecallOnce=false,teachingTemplate;
const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
globalThis.__complete=async(system,prompt,tool,description,inputSchema,images)=>{
  calls.push(tool);const input=JSON.parse(prompt);let output;
  if(tool==='plan_course'){
    output=badPlanOnce?{...plan,branches:Array.from({length:9},(_,i)=>({...plan.branches[0],key:`branch-${i}`,label:`Branch ${i}`}))}:plan;
    badPlanOnce=false;
  }
  else if(tool==='inventory_section'){output={topics:[{label:'Insurance actors and distinct flows',question:'Who bears risk, intermediates and supervises?',facts:input.primaryPages.map(p=>({detail:texts[p.page],sourceId:input.sourceSnippets.find(s=>s.page===p.page&&s.quote).id,visualDescription:''}))}]};}
  else if(tool==='reconstruct_section'){
    const primaryPages=input.primaryPages.map(p=>p.page);
    assert(primaryPages.join(',')==='1,3,5'||primaryPages.join(',')==='1','A theme spans non-adjacent slides; dense fallback keeps one primary page');
    assert.deepEqual(input.imagePages,primaryPages);assert.equal(images.length,primaryPages.length);
    if(denseOnce){denseOnce=false;throw new Error('Structured response was truncated; retry a smaller page batch');}
    assert(system.includes('ONE coherent lesson'));
    const evidence=[1,3,5].map(page=>({sourceId:input.sourceSnippets.find(s=>s.page===page&&s.quote).id}));
    const teachingPoints=primaryPages.map(page=>({key:`point-${page}`,detail:texts[page],sourceId:evidence.find(e=>e.sourceId.startsWith(`P${page}S`)).sourceId,visualDescription:''}));
    const note={key:'actors',branchKey:'actors',explanation:'A person wants protection against a specified loss. The premium purchases the insurer’s contractual cover. The insurer bears the insured risk; a broker intermediates rather than becoming that risk bearer.\n\nThe insurer may transfer part of its own risk to a reinsurer. FINMA supervises insurers. Supervision, intermediation and contractual risk transfer are different relationships, not successive claim-payment stages.',courseContext:plan.purpose,bridges:[{kind:'background',question:'Does every actor receive the customer’s risk?',explanation:'Intermediation helps arrange cover, while supervision oversees the insurer. Neither relationship should be interpreted as the next risk-transfer stage.',premiseSourceIds:evidence.map(e=>e.sourceId),assumptions:[]}],sketch:{relations:['Policyholder — pays premium for cover → insurer','Broker — intermediates between → policyholder and insurer','Insurer — transfers part of risk → reinsurer','FINMA — supervises → insurer'],example:'A hypothetical driver buys motor cover from an insurer through a broker. The broker’s intermediation is distinct from the insurer’s contractual cover.'},workflow:{before:'A customer identifies a risk to cover.',inputs:'Coverage terms and the actor’s role.',decision:'Distinguish the insurer’s cover from broker intermediation.',after:'The insurer may reinsure part of its risk while supervision remains a separate relationship.'},confusions:[{first:'Broker',second:'Insurer',distinction:'Intermediation differs from bearing the insured risk.'},{first:'Reinsurance',second:'Supervision',distinction:'Risk transfer differs from oversight.'}],teachingPoints:teachingPoints.map(p=>p.key),evidence};
    output={pages:primaryPages.map(page=>({page,kind:'content',reason:'A distinct actor role.',teachingPoints:teachingPoints.filter(p=>p.key===`point-${page}`),conceptKeys:['actors']})),concepts:[{key:'actors',branchKey:'actors',label:'Insurance actors and distinct flows',domain:'Insurance',definition:'Cover, intermediation, reinsurance and supervision have distinct actors and meanings.',quote:'',visualDescription:'',layer:'course',teachingPoints:note.teachingPoints,evidence,note}],links:[]};
    if(badSectionOnce){badSectionOnce=false;output.pages.pop();}
  } else if(tool==='teach_notes'){output={notes:Object.fromEntries(input.concepts.map(c=>[c.key,{...omit(teachingTemplate,['sourceDetails']),branchKey:c.branchKey,teachingPoints:input.teachingPoints.map(p=>p.key)}]))};}
  else if(tool==='draft_cards'){
    assert(input.concepts[0].explanation.includes('FINMA supervises'),'Even the first slide uses the coherent theme');
    const questions={1:'What does the policyholder purchase with an insurance premium?',3:'How does a broker’s intermediation differ from the insurer’s role?',5:'How does risk transfer to a reinsurer differ from supervision by FINMA?'};
    const answers={1:'The contractual cover against the specified risk.',3:'The broker intermediates; the insurer bears the insured risk under the contract.',5:'Reinsurance transfers part of the insurer’s risk; supervision oversees the insurer and is a different relationship.'};
    output={cards:[{key:`card-${input.page}`,bridgeKeys:[],concept:input.concepts[0].key,relationSource:'',relationTarget:'',question:questions[input.page],answer:answers[input.page],example:'',kind:'mechanism',objective:`Explain actor flow on source page ${input.page}`,quote:'',visualDescription:'',evidence:[{sourceId:input.sourceSnippets.find(s=>s.page===input.page&&s.quote).id}]}]};
  } else if(tool==='audit_slide'){
    assert.deepEqual(input.imagePages,[1,3,5],'Independent audit receives the same images and their page order');assert.equal(images.length,3);
    const repaired=calls.filter(c=>c==='audit_slide').length>1;
    output={bridges:input.bridges.map(b=>({key:b.key,supported:true,reason:'Qualified foundational explanation.'})),coverageComplete:true,missingObjectives:[],teachingPoints:input.teachingPoints.map(p=>({key:p.key,supported:true,covered:true,reason:'Precise role preserved.'})),links:[],existingCards:[],concepts:input.concepts.map(c=>({key:c.key,supported:!rejectLesson,identitySupported:!rejectLesson,contextual:true,detailsPreserved:true,consistent:true,scopeCorrect:true,learningSuccessful:true,learnerProbe:{question:'If the broker leaves after arranging the contract, who still bears the insured risk?',expectedAnswer:'The insurer.',reasoningSourceId:c.explanation.find(p=>p.text.includes('The insurer bears the insured risk'))?.id??''},existingMatch:Boolean(c.existingId),canonicalExistingId:c.existingId,reason:rejectLesson?'Rejected by independent audit.':'Coherent source-based explanation.'})),cards:input.cards.map(c=>({key:c.key,duplicateOf:input.existingCards.find(old=>old.objective===c.objective)?.id??'',supported:!repairCard||repaired,consistent:true,scopeCorrect:true,atomic:true,unambiguous:true,coveredConcepts:[c.concept],reason:'One role or flow distinction.'}))};
    if(badProbeOnce){badProbeOnce=false;output.concepts[0].learnerProbe.reasoningSourceId='';}
    if(missingRecallOnce){missingRecallOnce=false;output.cards.forEach(c=>{c.coveredConcepts=[];});}
    if(contradictAudit)output.concepts.push({...output.concepts[0],supported:false,reason:'Conflicting second decision.'});
  } else throw new Error('Section reconstruction must replace per-page extraction/teaching: '+tool);
  if(tool==='reconstruct_section'){
    const details=output.pages.flatMap(page=>page.teachingPoints).map(point=>omit(point,['key']));
    output.pages=output.pages.map(page=>omit(page,['conceptKeys','teachingPoints']));
    if(missingDetailCount>0){missingDetailCount--;output.concepts=[];}
    output.concepts=output.concepts.map(concept=>({...omit(concept,['key','teachingPoints','note']),note:{...omit(concept.note,['key','branchKey','teachingPoints','explanation']),learning:{goalAnswer:'The insurer bears contractual risk, the broker arranges cover and supervision is separate oversight.',intuition:'A person needs cover against a loss, but arranging a contract, bearing its risk and overseeing the insurer are different jobs.',analogy:{model:'',mapping:'',limit:''},mechanism:[concept.note.explanation],experiment:{rule:'The insurer provides contractual cover; the broker arranges it without bearing the insured risk.',setup:'Hypothetically, a driver buys motor cover through a broker.',question:'Who bears the insured risk: the broker or the insurer?',answer:'The insurer bears the insured risk.',why:'The broker arranges the contract; the insurer supplies contractual cover.'},technical:'Intermediation, contractual cover, reinsurance and supervision are different relationships, not successive payment stages.'},sourceDetails:details}}));
  }
  if(tool==='reconstruct_section'&&output.concepts.length)teachingTemplate=structuredClone(output.concepts[0].note);
  if(tool==='reconstruct_section'&&inputSchema.properties.concepts.type==='object'&&output.concepts.length)output.concepts=Object.fromEntries(output.concepts.map(c=>[c.label,omit(c,['label'])]));
  if(!(tool==='reconstruct_section'&&Array.isArray(output.concepts)&&!output.concepts.length))assert.deepEqual(schema.findSchemaViolations(output,inputSchema),[],`Fixture conforms to actual ${tool} schema`);
  return output;
};
try {
  const first=await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1,3,5]});
  assert.equal(calls.length,9,'One plan + one source inventory + one section + three card drafts + three independent audits replaces 13 baseline calls');
  assert.equal(first.warnings.length,0);assert.equal(first.cardsCreated,3);
  const notions=db.getGraph().notions.filter(n=>n.layer!=='organizer');assert.equal(notions.length,1,'Three pages build one unified concept');
  assert.deepEqual(notions[0].sources.map(s=>s.page).sort(),[1,3,5]);
  assert(quality.pageAnalyses(doc.id).filter(p=>[1,3,5].includes(p.page)).every(p=>p.status==='complete'));
  const cardIds=quality.getStudyCards().map(c=>c.id).sort();db.gradeCard('notion',cardIds[0],'easy');
  const scheduling=db.exportSnapshot().reviewState,logs=db.exportSnapshot().reviewLog;
  calls=[];db.clearMapping();await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1,3,5]});
  assert.equal(calls.length,6,'Clearing the map reuses source reconstruction but independently audits every page again');
  assert(!calls.includes('reconstruct_section')&&!calls.includes('plan_course'));
  assert.deepEqual(quality.getStudyCards().map(c=>c.id).sort(),cardIds);assert.deepEqual(db.exportSnapshot().reviewState,scheduling);assert.deepEqual(db.exportSnapshot().reviewLog,logs);
  repairCard=true;calls=[];quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.deepEqual(calls,['draft_cards','audit_slide','draft_cards','audit_slide'],'Card-only repair leaves the accepted lesson and section cache intact');
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'complete');
  repairCard=false;calls=[];
  missingRecallOnce=true;quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.deepEqual(calls,['draft_cards','audit_slide','draft_cards','audit_slide'],'Uncovered active-recall objectives repair cards without regenerating the lesson');
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'complete');
  badProbeOnce=true;calls=[];quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert(calls.includes('teach_notes')&&!calls.includes('extract_slide'),'A fabricated learner check repairs the teaching against the unchanged source inventory');
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'complete','A corrected independent transfer check permits saving');
  assert.deepEqual(quality.getStudyCards().map(c=>c.id).sort(),cardIds);assert.deepEqual(db.exportSnapshot().reviewState,scheduling);
  calls=[];
  await sections.reconstructCourseSection({documentId:doc.id,title:doc.title,page:1,passages:[...passages,{page:5,text:'A new qualified supervision detail.'}],plan,insurance:true,mode:'strict',enrichment:false,pdf:storage.readPdfFile(doc.id),images:['data:image/png;base64,1'],existing:[]});
  assert.deepEqual(calls,['inventory_section','reconstruct_section'],'Source changes invalidate the section fingerprint');
  const reconstruct=title=>sections.reconstructCourseSection({documentId:doc.id,title,page:1,passages,plan,insurance:true,mode:'strict',enrichment:false,pdf:storage.readPdfFile(doc.id),images:['data:image/png;base64,1'],existing:[]});
  badSectionOnce=true;calls=[];const repairedSection=await reconstruct('Bounded structural repair');
  assert.equal(repairedSection.requests,2);assert.deepEqual(calls,['inventory_section','reconstruct_section'],'Server-owned page inventory recovers an omitted metadata row without a paid repair');
  db.openDb().prepare('UPDATE quality_settings SET value=? WHERE key=?').run('{broken',repairedSection.cacheKey);
  calls=[];await reconstruct('Bounded structural repair');assert.deepEqual(calls,['inventory_section','reconstruct_section'],'Corrupt cache rebuilds instead of failing every regeneration');
  denseOnce=true;calls=[];const smaller=await reconstruct('Dense section fallback');
  assert.equal(smaller.requests,4);assert.equal(smaller.extraction.teachingPoints.length,1);assert(smaller.notes[0].explanation.includes('FINMA'));
  calls=[];await reconstruct('Dense section fallback');assert.deepEqual(calls,[],'Remembered split and single-page cache avoid repeating a costly truncation');
  missingDetailCount=2;calls=[];const focused=await reconstruct('Focused source-detail recovery');
  assert.equal(focused.requests,5);assert.equal(focused.extraction.teachingPoints.length,1,'Repeated grouping omissions narrow to the primary page once');
  calls=[];await reconstruct('Focused source-detail recovery');assert.deepEqual(calls,[],'Remembered source-detail split avoids repeated paid failures');
  badPlanOnce=true;calls=[];
  const repairedPlan=await (await env.load('courseLearningPlan')).courseLearningPlan(doc.id,'Bounded plan repair',passages,true);
  assert.equal(repairedPlan.requests,2);assert.equal(repairedPlan.plan.branches.length,2);
  const saved=db.openDb().prepare("SELECT value FROM quality_settings WHERE key LIKE 'course-section:%' LIMIT 1").get();
  const draft=JSON.parse(saved.value).draft,sources=(await env.load('coursePedagogy')).sourceSnippets(passages);
  const invalid=structuredClone(draft);invalid.pages[0].teachingPoints[0].sourceId='P5S1';
  assert.throws(()=>sections.validateSection(invalid,[1,3,5],sources,plan,[1,3,5]),/primary-page evidence/,'Neighbor facts cannot masquerade as primary facts');
  const unknown=structuredClone(draft);unknown.concepts[0].note.evidence.push({sourceId:'invented'});
  assert.throws(()=>sections.validateSection(unknown,[1,3,5],sources,plan,[1,3,5]),/unknown source/);
  const unassigned=structuredClone(draft);unassigned.pages[0].teachingPoints=[];
  assert.throws(()=>sections.validateSection(unassigned,[1,3,5],sources,plan,[1,3,5]),/Missing source-detail note/,'An empty source inventory cannot count as coverage');
  assert(notions[0].explanation.includes('Details retained from the slide'),'Source facts are visible, not just stored in an audit inventory');
  for(const point of draft.pages.flatMap(p=>p.teachingPoints))assert(notions[0].explanation.includes(point.detail),'Committing a later slide keeps every assigned fact from the unified lesson');
  const denseRoles=await sections.reconstructCourseSection({documentId:doc.id,title:'Dense role chart',page:1,passages:passages.map(p=>p.page===1?{...p,text:p.text+' CFO CIO CTO CRO HR IT ERM'}:p),plan,insurance:true,mode:'strict',enrichment:false,pdf:storage.readPdfFile(doc.id),images:['data:image/png;base64,1'],existing:[]});
  assert.equal(denseRoles.extraction.teachingPoints.length,1,'A dense labelled diagram gets a dedicated primary-page output budget');
  assert(denseRoles.notes[0].explanation.includes('FINMA'),'The broader theme remains available as reference context');
  assert((await env.load('learningExplanation')).composeLearningSketch({relations:Array.from({length:10},(_,i)=>`Role ${i} -> a distinct responsibility`),example:''},true).includes('Role 9'),'Valid diagram relationships never fail an arbitrary layout quota');
  assert.deepEqual(sections.sectionPages(2,plan,passages,true).pages,[2],'Product families stay separate from actor flows');
  const calculus={...plan,branches:[{key:'change',pages:[1,3],label:'Rates of change'}]};
  assert.deepEqual(sections.sectionPages(1,calculus,passages,false).pages,[1,3],'Grouping is not hard-coded to insurance');
  const before=db.getGraph().notions.find(n=>n.id===notions[0].id).explanation;
  contradictAudit=true;quality.retryPages(doc.id,[1]);await generateSlides(doc.id,{mode:'strict',enrichment:false,pages:[1]});
  assert.equal(quality.pageAnalyses(doc.id).find(p=>p.page===1).status,'retry','Contradictory audit rows cannot count as approval');
  assert.equal(db.getGraph().notions.find(n=>n.id===notions[0].id).explanation,before);
  assert.deepEqual(db.exportSnapshot().reviewState,scheduling);assert.deepEqual(db.exportSnapshot().reviewLog,logs);
  console.log('PASS: real section pipeline, non-adjacent sources, coherent shared notes, same-image audit, strict schemas, 9 vs 13 calls, cache reuse/invalidation, targeted card repair, unchanged IDs and review history. Offline fixture, not a model-quality score.');
} finally {db.openDb().close();}
