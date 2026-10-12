import {createHash} from 'node:crypto';
import {openDb} from '@/lib/db';
import {structuredCompletion,currentProviderLabel} from '@/lib/llm';
import {ACCURACY_VERSION,ACCURACY_INSTRUCTIONS,accuracyIssues,accuracyBatches,type AccuracyField,type AccuracySource,type AccuracyAudit} from '@/lib/contentAccuracy';
import {arithmeticIssues} from '@/lib/reliabilityChecks';
import {findSchemaViolations} from '@/lib/structuredSchema';

const obj=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str={type:'string'},boolean={type:'boolean'};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function accuracyReviewerLabel(){return currentProviderLabel('accuracy');}

// Reviewed rejections are cached too. Identical content cannot obtain a lucky
// approval by repeatedly asking; edits/sources/model/prompt invalidate the key.
export async function auditAccuracy(fields:AccuracyField[],sources:AccuracySource[],context:unknown):Promise<Map<string,string[]>> {
  if(!fields.length)return new Map();
  const results=new Map<string,string[]>();
  const bySource=new Map(sources.map(s=>[s.id,s])),ambiguous=new Set(sources.filter(s=>sources.filter(other=>other.id===s.id).length!==1).map(s=>s.id));
  for(const field of fields){
    const issues=arithmeticIssues(field.text);
    if(!field.text.trim()||fields.filter(other=>other.key===field.key).length!==1)issues.push('Missing or duplicate displayed accuracy field');
    if(!field.sourceIds.length||field.sourceIds.some(id=>!bySource.get(id)?.text.trim()||bySource.get(id)!.text.trim().length<12||ambiguous.has(id)))issues.push('Missing, insufficient or ambiguous original source evidence');
    if(issues.length)results.set(field.key,issues);
  }
  const reviewable=fields.filter(f=>!results.has(f.key));
  // Batches preserve full field text and ALL its cited source snippets.
  // Never truncate an explanation to fit a review or silently lose a condition.
  const batches=accuracyBatches(reviewable);let nextBatch=0,stopped=false;
  const configured=Number(process.env.MORROW_ACCURACY_CONCURRENCY??2);
  const concurrency=Number.isInteger(configured)&&configured>=1&&configured<=3?configured:2;
  const outcomes=await Promise.allSettled(Array.from({length:Math.min(concurrency,batches.length)},async()=>{
  try {
  while(!stopped&&nextBatch<batches.length) {
    const batch=batches[nextBatch++];
    const ids=new Set(batch.flatMap(f=>f.sourceIds));
    const relevant=sources.filter(s=>ids.has(s.id));
    const input={context,fields:batch,sources:relevant};
    const key=`accuracy-audit:${digest({version:ACCURACY_VERSION,system:ACCURACY_INSTRUCTIONS,model:accuracyReviewerLabel(),input})}`;
    const db=openDb(),cached=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(key);
    const schema=obj({decisions:{type:'array',minItems:batch.length,maxItems:batch.length,items:obj({key:{type:'string',enum:batch.map(f=>f.key)},complete:boolean,scopeCorrect:boolean,reason:str,claims:{type:'array',minItems:1,maxItems:80,items:obj({text:str,verdict:{type:'string',enum:['supported','deduction','hypothetical','unsupported','contradicted','uncertain']},evidence:{type:'array',items:obj({sourceId:{type:'string',enum:relevant.length?relevant.map(s=>s.id):['missing-source']},quote:str})},reasoning:str})}})}});
    const audit:AccuracyAudit=cached?JSON.parse(String(cached.value)):await structuredCompletion<AccuracyAudit>(ACCURACY_INSTRUCTIONS,JSON.stringify(input),'audit_accuracy','Challenge every displayed claim against its exact original evidence',schema);
    const violations=findSchemaViolations(audit,schema);
    if(violations.length){for(const field of batch)results.set(field.key,['Malformed accuracy review; no content was approved.',...violations]);continue;}
    const issues=accuracyIssues(batch,relevant,audit);
    // Persist only structurally complete decisions. An incomplete provider
    // response is never a reusable approval or permanent semantic rejection.
    if(!cached&&audit.decisions.length===batch.length&&batch.every(f=>audit.decisions.filter(d=>d.key===f.key).length===1)) {
      db.prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(audit));
    }
    for(const [field,problems] of issues)results.set(field,problems);
  }
  }catch(error){stopped=true;throw error;}
  }));
  const failed=outcomes.find(outcome=>outcome.status==='rejected');
  if(failed?.status==='rejected')throw failed.reason;
  return results;
}
