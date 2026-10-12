import {cardQuality,canonicalCardContent,pedagogicalIssues,type StudyCard} from '@/lib/contentQuality';
import {arithmeticIssues} from '@/lib/reliabilityChecks';
import type {AccuracyDecision,AccuracyField,AccuracyClaim} from '@/lib/contentAccuracy';
import type {SourceSnippet} from '@/lib/sourceCatalog';

export const DIRECT_CARD_VERSION='direct-cards-v9-teacher-course';
export interface DirectCard {
  key:string;topic:string;question:string;answer:string;kind:StudyCard['kind'];objective:string;
  sources:Array<{sourceId:string}>;visualDescription:string;
  topicDefinition?:string;explanation?:string;
}
export interface KnowledgeTarget {key:string;page:number;claim:string;sourceIds:string[];cardKeys:string[];exclusionReason:string;importance?:'core'|'supporting'|'incidental';selected?:boolean;issues?:string[];repairOf?:string;recall?:{topic:string;question:string;answer:string;kind?:StudyCard['kind']};}
export interface DirectUnits {units:Array<{repairOf:string;page:number;claim:string;sourceIds:string[];exclusionReason:string;cards:DirectCard[]}>;}
export interface TargetReview {key:string;verdict:'supported'|'non-teaching'|'unsupported'|'uncertain';atomic:boolean;coverageComplete:boolean;selectionCorrect?:boolean;reason:string;}
export interface DirectDraft {knowledge:KnowledgeTarget[];cards:DirectCard[];}
export interface DirectReview {
  decisions:Array<AccuracyDecision&{atomic:boolean;unambiguous:boolean;relevant:boolean;duplicateOf:string;requiresVisualEvidence:boolean}>;
  targets:TargetReview[];
  pages:Array<{page:number;excluded:boolean;reason:string;objectives:Array<{description:string;cardKeys:string[]}>}>;
}
export interface DirectReviewResponse {
  targets:TargetReview[];
  decisions:Array<Omit<DirectReview['decisions'][number],'claims'>&Pick<AccuracyClaim,'verdict'|'reasoning'>&{evidence:Array<{sourceId:string}>}>;
  pages:DirectReview['pages'];
}
export interface DirectReviewSlots {
  targets:Record<string,Omit<TargetReview,'key'|'coverageComplete'>&{recallMatchesTarget:boolean}>;
  decisions:Record<string,Omit<DirectReviewResponse['decisions'][number],'key'>>;
  pages:Record<string,Omit<DirectReview['pages'][number],'page'>&{questionCoverage:Record<string,{cardKeys:string[];reason:string}>}>;
}
export function unpackDirectReview(raw:DirectReviewSlots,questions:Array<{key:string;page:number;question:string}>=[]):DirectReviewResponse {
  return {targets:Object.entries(raw.targets).map(([key,{recallMatchesTarget,...value}])=>({key,...value,coverageComplete:recallMatchesTarget})),decisions:Object.entries(raw.decisions).map(([key,value])=>({key,...value})),pages:Object.entries(raw.pages).map(([key,{questionCoverage,...value}])=>({page:Number(key.slice(1)),...value,objectives:[...value.objectives,...Object.entries(questionCoverage).map(([key,check])=>({description:`Knowledge check: ${questions.find(q=>q.key===key)!.question}${check.reason?' — '+check.reason:''}`,cardKeys:check.cardKeys}))]}))};
}
const str={type:'string'},bool={type:'boolean'};
export const objectSchema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const list=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,minItems,maxItems});
const enumeration=(values:string[])=>({type:'string',enum:values.length?values:['no-source']});
export interface DirectPlan {targets:Array<{page:number;claim:string;sourceIds:string[];exclusionReason:string;importance?:KnowledgeTarget['importance']}>;}
export interface DirectPlanSlots extends DirectPlan {questions:Record<string,{claim:string;sourceIds:string[];exclusionReason:string}>;}
export interface TargetCards {cards:Record<string,DirectCard>;}
export function directPlanSchema(sourceIds:string[],pages:number[],questions:Array<{key:string}>=[]){return objectSchema({targets:list(objectSchema({page:{type:'integer',enum:pages},claim:str,sourceIds:list(enumeration(sourceIds),8,1),exclusionReason:str,importance:enumeration(['core','supporting','incidental'])}),36),questions:objectSchema(Object.fromEntries(questions.map(q=>[q.key,objectSchema({claim:str,sourceIds:list(enumeration(sourceIds),8,1),exclusionReason:str})])))});}
export function directDraftSchema(sourceIds:string[],_limit=36,targetKeys:string[]=[]){
  if(targetKeys.length>_limit)throw Error('Too many direct target slots');
  const card=objectSchema({topic:str,topicDefinition:str,question:str,answer:str,explanation:str,kind:enumeration(['definition','mechanism','comparison','application']),objective:str,sources:list(objectSchema({sourceId:enumeration(sourceIds)}),8,1),visualDescription:str});
  return objectSchema({cards:objectSchema(Object.fromEntries(targetKeys.map(key=>[key,card])))});
}
export function directField(card:DirectCard):AccuracyField {
  return {key:card.key,text:`Topic: ${card.topic}${card.topicDefinition?`\nConcept definition: ${card.topicDefinition}`:''}\nQuestion: ${card.question}\nAnswer: ${card.answer}${card.explanation?`\nExplanation: ${card.explanation}`:''}`,sourceIds:card.sources.map(s=>s.sourceId),kind:card.kind==='application'?'exercise':'fact'};
}
export function directReviewSchema(cards:DirectCard[],pages:number[],sourceIds:string[],existingIds:string[],targets:KnowledgeTarget[]=[],questions:Array<{key:string;page:number;question:string}>=[]){
  const target=objectSchema({verdict:enumeration(['supported','non-teaching','unsupported','uncertain']),atomic:bool,recallMatchesTarget:bool,selectionCorrect:bool,reason:str});
  const decision=objectSchema({complete:bool,scopeCorrect:bool,atomic:bool,unambiguous:bool,relevant:bool,requiresVisualEvidence:bool,duplicateOf:enumeration(['',...existingIds]),reason:str,verdict:enumeration(['supported','deduction','hypothetical','unsupported','contradicted','uncertain']),evidence:list(objectSchema({sourceId:enumeration(sourceIds)}),8,1),reasoning:str});
  const cardKeys=list(enumeration(cards.map(c=>c.key)),cards.length);
  const page=(p:number)=>objectSchema({excluded:bool,reason:str,objectives:list(objectSchema({description:str,cardKeys}),40),questionCoverage:objectSchema(Object.fromEntries(questions.filter(q=>q.page===p).map(q=>[q.key,objectSchema({cardKeys,reason:str})])))});
  return objectSchema({targets:objectSchema(Object.fromEntries(targets.map(t=>[t.key,target]))),decisions:objectSchema(Object.fromEntries(cards.map(c=>[c.key,decision]))),pages:objectSchema(Object.fromEntries(pages.map(p=>[`p${p}`,page(p)])))});
}
export function directCardIssues(card:DirectCard,cards:DirectCard[],snippets:SourceSnippet[],imagePages:number[],primary:number[]):string[]{
  const issues=[...cardQuality(card.question,card.answer,card.kind),...arithmeticIssues(card.answer)];
  if(cards.filter(c=>c.key===card.key).length!==1)issues.push('Duplicate card identity');
  if(cards.filter(c=>canonicalCardContent(c.question)===canonicalCardContent(card.question)).length>1)issues.push('Duplicate recall question in this batch');
  issues.push(...pedagogicalIssues(card));
  if(!card.topic.trim()||!card.objective.trim())issues.push('Missing topic or learning objective');
  if(!card.topicDefinition?.trim())issues.push('Missing standalone concept definition');
  if((card.topicDefinition?.length??0)>600)issues.push('Concept definition is too long');
  if(card.answer.length>600)issues.push('Recall answer is too long; move supported context to the explanation');
  if((card.explanation?.length??0)>1200)issues.push('Explanation is too long');
  const sourceText=snippets.filter(s=>card.sources.some(e=>e.sourceId===s.id)).map(s=>s.text).join(' ');
  if(/climate change and emerging risks/i.test(sourceText)&&/climate change/i.test(card.question)&&!/and emerging risks/i.test(card.question)&&/cyber|pandemic/i.test(card.answer))issues.push('A combined climate/emerging-risk heading does not establish that climate change causes cyber risk or pandemics');
  if(/balance sheet.*business functions/i.test(sourceText)&&/components? of (?:the )?(?:assets|liabilities)|(?:assets|liabilities).{0,60}(?:components|include|consist)/i.test(`${card.question} ${card.answer} ${card.topicDefinition}`)&&/investment.{0,30}alm|liquidity management|claims management|pricing assumptions|reserving and provisions/i.test(card.answer))issues.push('Business functions related to a balance-sheet category are not its accounting components');
  const sources=card.sources.map(s=>s.sourceId),byId=new Map(snippets.map(s=>[s.id,s]));
  const imageId=(id:string)=>imagePages.find(p=>id===`p${p}image`);
  if(!sources.length||sources.some(id=>!byId.has(id)&&imageId(id)===undefined))issues.push('Unknown or missing original source reference');
  if(!sources.some(id=>primary.includes(byId.get(id)?.page??imageId(id)??-1)))issues.push('No primary-page evidence');
  if(sources.some(id=>imageId(id)!==undefined)&&card.visualDescription.trim().length<20)issues.push('Missing card-specific visual evidence');
  if(sources.some(id=>byId.has(id)&&byId.get(id)!.text.trim().length<12))issues.push('Insufficient textual source evidence');
  return [...new Set(issues)];
}

export {pedagogicalIssues} from '@/lib/contentQuality';
