import assert from 'node:assert/strict';
import fs from 'node:fs';
import {packPlanFixture,packReviewFixture,isolatedModules,packDirectFixture,planDirectFixture,targetReviewFixture} from './isolated-modules.mjs';
const corpus=JSON.parse(fs.readFileSync('references/evaluation/insurance-v4-failures.json','utf8'));
const env=await isolatedModules([]),engine=await env.load('generationEngine'),catalog=await env.load('sourceCatalog');
let reviewed=0,valid=0;
for(const historical of corpus.batches){
 const primary=[...new Set(historical.knowledge.map(k=>k.page))];
 const snippets=catalog.sourceCatalog(corpus.pages);
 const ids=new Set(snippets.map(s=>s.id));
 const legacy={knowledge:historical.knowledge.map(k=>({...k,sourceIds:k.sourceIds.filter(id=>ids.has(id))})),cards:historical.cards.map(c=>({...c,sources:c.sources.filter(s=>ids.has(s.sourceId))}))};
 const source={documentId:'real-response-replay',title:'Insurance introduction',revision:'fixture',primaryPages:primary,snippets,imagePages:[],images:[],uncertainOcrPages:[]};
 let modeledPages=[];
 const output=await engine.runGenerationEngine(source,[],{async complete(_system,input,tool){
  if(tool==='plan_direct_cards'){modeledPages=input.primaryPages;return packPlanFixture(planDirectFixture({...legacy,knowledge:legacy.knowledge.filter(k=>modeledPages.includes(k.page))}),input);}
  if(tool==='direct_cards')return packDirectFixture(legacy,input);
  return packReviewFixture({targets:targetReviewFixture(input),decisions:input.fields.map(f=>({key:f.key,complete:true,scopeCorrect:true,atomic:true,unambiguous:true,relevant:true,requiresVisualEvidence:false,duplicateOf:'',reason:'Transport replay only.',verdict:'supported',evidence:[{sourceId:f.sourceIds[0]}],reasoning:'Synthetic positive decision, not a factual quality rating.'})),pages:primary.map(page=>({page,excluded:false,reason:'Transport replay.',objectives:input.knowledge.filter(k=>k.page===page).map(k=>({description:k.claim,cardKeys:k.cardKeys.filter(key=>input.cards.some(c=>c.key===key))}))}))},input);
 }});
 reviewed+=output.draft.knowledge.length;valid+=output.cards.filter(c=>c.contractValid).length;
 for(const target of historical.knowledge.filter(k=>modeledPages.includes(k.page)))assert(output.draft.knowledge.some(k=>k.page===target.page&&k.claim===target.claim),'Missing card references retain their original modeled target rather than canceling the batch');
 if(historical.knowledge.some(k=>modeledPages.includes(k.page)&&k.cardKeys.length&&k.cardKeys.every(key=>!historical.cards.some(c=>c.key===key))))assert(output.cards.some(c=>!c.contractValid),'The real dangling references become explicit coverage gaps');
}
assert(valid>0);console.log(`PASS: ${corpus.batches.length} actual failed v4 response batches, ${reviewed} retained targets, ${valid} contract-valid candidates. Replay proves local failure isolation, not new-model pedagogy.`);
