import {createHash} from 'node:crypto';
import {ACCURACY_VERSION} from '@/lib/contentAccuracy';
import type {StudyCard} from '@/lib/contentQuality';
import type {ClairLesson} from '@/lib/clair';

export interface ContentReview {version:string;contentHash:string;sources:Array<{documentId:string;page:number;sha256:string;revision?:string}>;}
export function validContentReview(value:unknown):value is ContentReview {
  if(!value||typeof value!=='object')return false;
  const review=value as ContentReview;
  return typeof review.version==='string'&&/^[a-f0-9]{64}$/.test(review.contentHash)&&Array.isArray(review.sources)&&review.sources.length>0&&review.sources.every(s=>s&&typeof s.documentId==='string'&&Number.isInteger(s.page)&&s.page>0&&/^[a-f0-9]{64}$/.test(s.sha256)&&(s.revision===undefined||/^[a-f0-9]{64}$/.test(s.revision)));
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Avoid a circular hash: visual-review evidence contains this recall hash.
export function recallContentHash(card:Pick<StudyCard,'question'|'answer'|'example'|'kind'|'explanation'|'objective'>){return digest({question:card.question,answer:card.answer,example:card.example,kind:card.kind,explanation:card.explanation??'',objective:card.objective});}
export function cardContentHash(card:Pick<StudyCard,'question'|'answer'|'example'|'kind'|'evidence'|'explanation'|'reviewedConceptDefinition'|'teaching'>){return digest({question:card.question,answer:card.answer,example:card.example,kind:card.kind,evidence:card.evidence,...(card.explanation?{explanation:card.explanation}:{}),...(card.reviewedConceptDefinition?{reviewedConceptDefinition:card.reviewedConceptDefinition}:{}),...(card.teaching?{teaching:card.teaching}:{})});}
export function sourceTextHash(text:string){return digest(text);}
export function createLessonReview(lesson:ClairLesson,text:Map<string,string>):ClairLesson {
  const {accuracyReview:previous,...body}=lesson;
  void previous;
  return {...body,accuracyReview:{version:ACCURACY_VERSION,contentHash:digest(body),sourcesHash:digest(body.sources.map(s=>({documentId:s.documentId,page:s.page,text:text.get(`${s.documentId}:${s.page}`)??''})))}};
}
export function lessonReviewIssues(lesson:ClairLesson,text:Map<string,string>):string[] {
  const {accuracyReview,...body}=lesson;if(!accuracyReview)return [];
  const issues:string[]=[];
  if(accuracyReview.version!==ACCURACY_VERSION||accuracyReview.contentHash!==digest(body))issues.push('The lesson content changed after its accuracy review.');
  if(accuracyReview.sourcesHash!==digest(lesson.sources.map(s=>({documentId:s.documentId,page:s.page,text:text.get(`${s.documentId}:${s.page}`)??''}))))issues.push('The lesson source context changed after its accuracy review.');
  return issues;
}
export function createCardReview(card:Pick<StudyCard,'question'|'answer'|'example'|'kind'|'evidence'|'explanation'|'reviewedConceptDefinition'|'teaching'>,text:Map<string,string>,revisions?:Map<string,string>):ContentReview {
  const sources=[...new Map(card.evidence.map(e=>[`${e.documentId}:${e.page}`,e])).values()].sort((a,b)=>a.documentId.localeCompare(b.documentId)||a.page-b.page).map(e=>({documentId:e.documentId,page:e.page,sha256:sourceTextHash(text.get(`${e.documentId}:${e.page}`)??''),...(revisions?.has(e.documentId)?{revision:revisions.get(e.documentId)}:{})}));
  return {version:ACCURACY_VERSION,contentHash:cardContentHash(card),sources};
}
export function cardReviewIssues(card:Pick<StudyCard,'question'|'answer'|'example'|'kind'|'evidence'|'accuracyReview'|'explanation'|'reviewedConceptDefinition'|'teaching'>,text:Map<string,string>,source?:{revisions:Map<string,string>;text:Map<string,string>}):string[] {
  const review=card.accuracyReview;if(!review)return [];
  if(!validContentReview(review))return ['Invalid persisted accuracy review.'];
  const issues:string[]=[];
  if(review.version!==ACCURACY_VERSION||review.contentHash!==cardContentHash(card))issues.push('The card content changed after its accuracy review.');
  const expected=new Set(card.evidence.map(e=>`${e.documentId}:${e.page}`));
  if(!review.sources?.length||review.sources.length!==expected.size||new Set(review.sources.map(s=>`${s.documentId}:${s.page}`)).size!==review.sources.length)issues.push('Accuracy review does not cover every cited source.');
  for(const s of review.sources??[]){
    const current=s.revision?source?.text:text,key=`${s.documentId}:${s.page}`;
    if(!expected.has(key)||!current?.has(key)||s.sha256!==sourceTextHash(current.get(key)!)||(s.revision&&source?.revisions.get(s.documentId)!==s.revision))issues.push('The original source context changed after accuracy review.');
  }
  return [...new Set(issues)];
}
