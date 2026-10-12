import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules([...DATABASE_MODULES,'consolidateRoots','mapOverview'],{llm:`export async function structuredCompletion(...args){return globalThis.__organize(...args);}`});
process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb');
const {consolidateRoots}=await env.load('consolidateRoots');
try{
  const nodes=['Life Insurance','Underwriting Processes','Actuarial Roles'].map(label=>db.insertNotion({label,domain:'Insurance',definition:label,status:'draft',sources:[]}));
  const before=db.exportSnapshot();
  let invalid=false,calls=0;
  globalThis.__organize=async(system,prompt)=>{
    calls++;
    const input=JSON.parse(prompt);
    assert.equal(input.roots.length,3,'Same domain does not collapse semantic categories');
    return {groups:invalid?[{label:'Everything',description:'Wrong'}]:['Products','Business processes','Organization and professions'].map(label=>({label,description:'Navigation only'})),assignments:Object.fromEntries(nodes.map((n,i)=>[n.id,invalid?'Everything':['Products','Business processes','Organization and professions'][i]]))};
  };
  await consolidateRoots(db.getGraph(true).notions,[]);
  let graph=db.getGraph(true);
  assert.equal(graph.notions.filter(n=>n.layer==='organizer').length,3);
  assert.equal(graph.links.filter(l=>l.type==='chapter').length,3);
  await consolidateRoots(graph.notions,graph.links);
  graph=db.getGraph(true);
  assert.equal(graph.notions.filter(n=>n.layer==='organizer').length,3,'Repeated regrouping reuses navigation nodes');
  assert.equal(graph.links.length,3,'Repeated regrouping does not duplicate links');
  assert.equal(quality.getStudyCards().length,0,'Navigation groups never create cards');
  assert.deepEqual(db.exportSnapshot().reviewState,before.reviewState);
  invalid=true;const saved=db.exportSnapshot();calls=0;
  await assert.rejects(()=>consolidateRoots(graph.notions,graph.links),/Invalid semantic hierarchy/);
  assert.equal(calls,2,'One bounded repair');
  const after=db.exportSnapshot();after.exportedAt=saved.exportedAt;
  assert.deepEqual(after,saved,'Invalid LLM grouping cannot alter existing data');
  console.log('PASS: semantic product/process/role branches, idempotent regrouping, bounded repair and preserved content/reviews.');
}finally{for(const connection of globalThis.__courseDbs?.values()??[])connection.close();process.chdir(env.root);}
