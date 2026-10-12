import { cardQuality, clairQualityIssues, teachingQualityIssues, verifiesQuote, verifiedVisualEvidence, type StudyCard } from '@/lib/contentQuality';
import type {ClairLesson} from '@/lib/clair';
import {cardReviewIssues,lessonReviewIssues} from '@/lib/contentReview';
import type {TeachingLesson} from '@/lib/teachingCourse';
import {teachingTraceIssues} from '@/lib/teachingIntegrity';

export interface ReliabilityInput {
  teachingLessons?:TeachingLesson[];
  originalSources?:{revisions:Map<string,string>;text:Map<string,string>};
  cards: StudyCard[];
  notions: Array<{id: string; label: string; definition: string; explanation?: string;clair?:ClairLesson}>;
  documents: Array<{id: string; title: string; pageCount?: number;pdfSha256?:string}>;
  passages: Array<{documentId: string; page: number; text: string}>;
}

export function reliabilityReport(input: ReliabilityInput) {
  const text = new Map<string, string>();
  for (const passage of input.passages) {
    const key = `${passage.documentId}:${passage.page}`;
    text.set(key, `${text.get(key) ?? ''}\n${passage.text}`);
  }
  const notions = new Map(input.notions.map(n => [n.id, n]));
  const originalText=new Map([...text].map(([key,value])=>[key,value.replace(/^\n/,'')]));
  const documents = new Map(input.documents.map(d => [d.id, d]));
  const cards = input.cards.map(card => {
    const issues = [...cardQuality(card.question, card.answer, card.kind),...cardReviewIssues(card,originalText,input.originalSources), ...teachingQualityIssues(notions.get(card.notionId ?? '')?.label ?? card.question, `${card.answer}\n${card.example}`)];
    if(card.teaching)issues.push(...teachingTraceIssues(card.teaching,new Map((input.teachingLessons??[]).map(l=>[l.id,l]))));
    if (card.promptVersion === 'legacy') issues.push('Legacy content has not passed the current source audit.');
    let verifiedTextSources = 0, reviewedVisualSources=0;
    for (const source of card.evidence) {
      const document = documents.get(source.documentId);
      if (!document || !Number.isInteger(source.page) || source.page < 1 || (document.pageCount !== undefined && source.page > document.pageCount)) {
        issues.push('Evidence references an unknown document or invalid page.');
      } else if (source.quote.trim()) {
        const sourceText=input.originalSources?.text.get(`${source.documentId}:${source.page}`)??text.get(`${source.documentId}:${source.page}`)??'';
        if (verifiesQuote(source.quote,sourceText)||card.teaching&&sourceText.normalize('NFC').replace(/\s+/g,' ').includes(source.quote.normalize('NFC').replace(/\s+/g,' '))) verifiedTextSources++;
        else issues.push('A cited quotation is absent from the stored source page.');
      } else if(verifiedVisualEvidence(source,document.pdfSha256))reviewedVisualSources++;
    }
    if (!verifiedTextSources&&!reviewedVisualSources) issues.push('No verifiable text source; visual or manually supplied content requires human verification.');
    return {id: card.id, status: card.status, userEdited: card.userEdited, verifiedTextSources, reviewedVisualSources, issues: [...new Set(issues)], warnings: card.warnings};
  });
  const lessons = input.notions.map(n => {
    const issues=[...teachingQualityIssues(n.label, `${n.definition}\n${n.explanation ?? ''}`),...(n.clair?[...clairQualityIssues(n.label,n.clair),...lessonReviewIssues(n.clair,originalText)]:[])];
    for(const source of n.clair?.sources??[]) {
      const document=documents.get(source.documentId);
      if(!document||!Number.isInteger(source.page)||source.page<1||document.pageCount!==undefined&&source.page>document.pageCount){issues.push('Lesson evidence references an unknown document or invalid page.');continue;}
      if(!source.quote.trim()&&source.visualDescription&&!verifiedVisualEvidence(source,document.pdfSha256))issues.push('Visual-only lesson evidence requires checking the original slide.');
      else if(!source.quote.trim()&&verifiedVisualEvidence(source,documents.get(source.documentId)?.pdfSha256))continue;
      else if(!verifiesQuote(source.quote,text.get(`${source.documentId}:${source.page}`)??''))issues.push('A structured lesson quotation is absent from the stored source page.');
    }
    return {id:n.id,label:n.label,issues:[...new Set(issues)]};
  }).filter(n=>n.issues.length);
  const ready = cards.filter(c => c.status === 'ready');
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {totalCards: cards.length, readyCards: ready.length, readyCardsWithIssues: ready.filter(c => c.issues.length).length, lessonsWithDetectedIssues: lessons.length},
    cards, lessons,
    limitations: ['Matching quotations establish provenance, not semantic truth.', 'These conservative checks can miss errors and flag valid content.', 'No comparative learning effectiveness or competitor superiority is established.'],
  };
}
