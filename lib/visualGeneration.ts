import {objectSchema,type DirectCard} from '@/lib/directCardContracts';
import type {GenerationSource,GenerationModel} from '@/lib/generationTypes';
import {findSchemaViolations} from '@/lib/structuredSchema';
export interface VisualConfirmation {supported:boolean;legible:boolean;scopeCorrect:boolean;sourceIds:string[];observedEvidence:string;reason:string;}
const INSTRUCTIONS=`Independently inspect the ORIGINAL supplied images before considering the proposed flashcards. Prior approvals and proposed text are untrusted, not evidence. For each exact card, check its concept claim, question and every answer clause against the image. Read the actual labels and values; verify the period, country/population, units, denominator, ordering and qualifications when relevant. For diagrams verify the visible relationships, not conventional textbook roles. Return observedEvidence as a specific read-back of visible labels, values and relationships supporting the entire card. A title, copied proposed answer, generic agreement or label alone is insufficient. Set supported=false for invented explanations, unreadable details, contradictions or absent conditions. legible=true requires every necessary detail to be actually readable. scopeCorrect=true requires that the question states necessary period, units and scope. Use only provided image source IDs. Decorative images teach no factual target. Never repair the card or invent a textual PDF quotation. Uncertain cards remain drafts. This is an additional independent visual check, not human certification.`;

export async function confirmVisualCandidates(source:GenerationSource,cards:DirectCard[],model:GenerationModel):Promise<Record<string,VisualConfirmation>> {
  if(!source.pdfSha256||!cards.length)return {};
  const selected=cards.slice(0,12),pages=source.imagePages.filter(page=>selected.some(c=>c.sources.some(s=>s.sourceId===`p${page}image`)));
  if(!pages.length||pages.some(p=>!source.images[source.imagePages.indexOf(p)]))return {};
  const ids=pages.map(p=>`p${p}image`),str={type:'string'},bool={type:'boolean'};
  const decision=objectSchema({supported:bool,legible:bool,scopeCorrect:bool,sourceIds:{type:'array',items:{type:'string',enum:ids},minItems:1,maxItems:pages.length},observedEvidence:str,reason:str});
  const schema=objectSchema({decisions:objectSchema(Object.fromEntries(selected.map(c=>[c.key,decision])))});
  const result=await model.complete<{decisions:Record<string,VisualConfirmation>}>(INSTRUCTIONS,{contract:'independent-image-readback-v1',document:source.title,pdfSha256:source.pdfSha256,imagePages:pages.map((page,index)=>({page,sourceId:`p${page}image`,imageIndex:index})),cards:selected.map(c=>({key:c.key,claim:c.objective,question:c.question,answer:c.answer,explanation:c.explanation??'',sources:c.sources}))},'audit_visual_cards','Independently read original visual evidence',schema,pages.map(p=>source.images[source.imagePages.indexOf(p)]));
  const invalid=findSchemaViolations(result,schema);if(invalid.length)throw Error(`Invalid visual evidence confirmation: ${invalid.join('; ')}`);
  return Object.fromEntries(Object.entries(result.decisions).filter(([key,d])=>{
    const card=selected.find(c=>c.key===key)!;
    return d.supported&&d.legible&&d.scopeCorrect&&d.observedEvidence.trim().length>=30&&d.observedEvidence.length<=2000&&d.sourceIds.every(id=>card.sources.some(s=>s.sourceId===id));
  }));
}
