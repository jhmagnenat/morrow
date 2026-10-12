import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
import {sketches,branchBoards,productNotes} from './insurance-board-notes.mjs';
const header={'X-Course-Id':'default'};
const response=await fetch('http://localhost:3000/api/export',{headers:header});
if(!response.ok)throw Error('Cannot back up course');
const backup=await response.text();
await mkdir('data/backups',{recursive:true});
await writeFile(`data/backups/before-board-notes-${Date.now()}.json`,backup,'utf8');
const env=await isolatedModules(DATABASE_MODULES);
const scope=await env.load('courseScope'),db=await env.load('db'),quality=await env.load('qualityDb');
const {composeLearningSketch}=await env.load('learningExplanation');
const version='reviewed-notes-v7-board';
const intro='4fe379c0-a193-4ddb-acae-60f003af1972';
try{
const result=scope.withCourse('default',()=>{
 const sql=db.openDb(),before=db.exportSnapshot(),graph=db.getGraph(true),cardsBefore=quality.getStudyCards();
 if(sql.prepare('SELECT 1 FROM generation_claims WHERE expires_at>? LIMIT 1').get(new Date().toISOString()))throw Error('Generation is running');
 for(const label of [...Object.keys(sketches),...Object.keys(branchBoards)]){
  const notion=graph.notions.find(n=>n.label===label);
  if(!notion || notion.userEdited || notion.status==='validated' || (notion.layer!=='organizer' && !notion.generationVersion?.startsWith('reviewed-notes-')))throw Error(`Reviewed baseline changed: ${label}`);
 }
 if(productNotes.some(n=>graph.notions.some(old=>old.label===n.label)))throw Error('Product notes already exist; do not apply twice');
 const passages=db.getPassagesForDocument(intro);
 const evidence=pages=>pages.map(page=>({documentId:intro,page,quote:passages.filter(p=>p.page===page).map(p=>p.text).join('\n'),...(page===25?{visualDescription:'Product map visually reviewed: motor vehicle damage in Property and motor vehicle liability in Liability.'}:{})}));
 sql.exec('BEGIN IMMEDIATE');
 try{
  for(const [label,sketch] of Object.entries(sketches)){
   const old=graph.notions.find(n=>n.label===label);
   const explanation=composeLearningSketch(sketch)+'\n\n'+old.explanation;
   sql.prepare('UPDATE notions SET explanation=? WHERE id=?').run(explanation,old.id);
   // Retain all existing evidence and per-page notes, with the new synthesis
   // carried in its first anchor. Future generation preserves reviewed notes.
   const first=old.sourceNotes?.[0];
   quality.setNotionMetadata(old.id,old.layer,old.evidence,version,first?[{...first,explanation,version},...old.sourceNotes.slice(1)]:[]);
  }
  for(const [label,sketch] of Object.entries(branchBoards)){
   const old=graph.notions.find(n=>n.label===label);
   let explanation=composeLearningSketch(sketch);
   if(label==='Insurance fundamentals')explanation+='\n\nCourse sources: introduction slides 19–20 and session 2 slide 8 show the policyholder, direct insurer and reinsurer with premium, service and recovery flows.\n\nSupplementary context requested from your lecture notes, verified outside the slides: a broker is an intermediary in arranging insurance; an untied intermediary acts in the client’s interests. FINMA supervises insurers, reinsurers and intermediaries in Switzerland; it is not the final recipient of ceded premiums or claims. Broker and supervisor roles are not reconstructed as detailed teaching from the uploaded slides.\n\nExternal sources: https://www.finma.ch/en/authorisation/insurance-intermediaries/ and https://www.finma.ch/en/finma/organisation/finma-s-divisions/insurance-division/';
   sql.prepare('UPDATE notions SET definition=?,explanation=?,course_context=? WHERE id=?').run(sketch.relations.join('\n'),explanation,'Read the compact relationships first, then open the relevant concepts for the detailed notes.',old.id);
   quality.setNotionMetadata(old.id,'organizer',[],version);
  }
  const ids=new Map(graph.notions.map(n=>[n.label,n.id]));
  for(const note of productNotes){
   const explanation=composeLearningSketch(note.sketch)+'\n\n'+note.explanation;
   const proof=evidence(note.pages);
   assert(proof.every(e=>e.quote.length>=12 || e.visualDescription),'Product reference must exist');
   const notion=db.insertNotion({label:note.label,definition:note.definition,explanation,courseContext:'Family → concrete product → covered event, then connect its promise to pricing, claims and reserving.',domain:'Insurance',status:'draft',grounding:'grounded',sources:note.pages.map(page=>({documentId:intro,page}))});
   ids.set(note.label,notion.id);
   quality.setNotionMetadata(notion.id,'course',proof,version,[{documentId:intro,page:note.pages[0],explanation,courseContext:notion.courseContext,version}]);
   const link=db.insertLink({source:ids.get(note.parent),target:notion.id,type:note.parent==='Insurance Products'?'chapter':'sub-notion',description:`${note.label} is ${note.parent==='Insurance Products'?'a product family':'a product within '+note.parent}; identify the covered interest and event.`});
   quality.setLinkEvidence(link.id,proof);
  }
  // Liability now sits under its P&C family, keeping its node and review IDs.
  for(const link of graph.links.filter(l=>l.source===ids.get('Insurance Products') && l.target===ids.get('Liability Insurance') && l.type==='chapter'))sql.prepare("UPDATE links SET type='related',description=? WHERE id=?").run('Product overview cross-reference; Liability is classified beneath P&C.',link.id);
  const liability=db.insertLink({source:ids.get('Property and Casualty Insurance'),target:ids.get('Liability Insurance'),type:'sub-notion',description:'P&C includes legal liability; motor liability is a concrete example of covering harm caused to others.'});
  quality.setLinkEvidence(liability.id,evidence([23,35]));
  const flows=[['Insured-Insurer Relationship','Reinsurance','The policyholder has the direct insurance promise. The insurer cedes premium to the reinsurer and receives recoveries under the reinsurance promise. These are two distinct exchanges.'],['Pricing Function in Insurance','Insurance Premium','Pricing uses the product terms and expected claims, expenses and margin to estimate the premium. Collection of that price is a later cash event.'],['Insurance Value Chain','Claims Reserving','After claims emerge, reserving estimates their remaining unpaid cost. This changes liabilities and profit before all cash has been paid.']];
  for(const [from,to,description] of flows){
   const old=graph.links.find(l=>l.source===ids.get(from) && l.target===ids.get(to));
   const link=old??db.insertLink({source:ids.get(from),target:ids.get(to),type:'related',description});
   if(old)sql.prepare('UPDATE links SET description=? WHERE id=?').run(description,link.id);
   quality.setLinkEvidence(link.id,[...(graph.notions.find(n=>n.label===from)?.evidence??[]),...(graph.notions.find(n=>n.label===to)?.evidence??[])]);
  }
  const after=db.exportSnapshot();
  assert.deepEqual(after.reviewState,before.reviewState);
  assert.deepEqual(after.reviewLog,before.reviewLog);
  assert.deepEqual(quality.getStudyCards(),cardsBefore);
  sql.exec('COMMIT');
  return {reviewedSketches:Object.keys(sketches).length,branchBoards:Object.keys(branchBoards).length,concreteProducts:productNotes.length,cardAndReviewDataUnchanged:true};
 }catch(error){sql.exec('ROLLBACK');throw error;}
});
await writeFile('data/reports/insurance-board-review.json',JSON.stringify(result,null,2),'utf8');
console.log(JSON.stringify(result));
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();}
