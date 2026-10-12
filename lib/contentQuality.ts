import { arithmeticIssues, reasoningCardIssues } from '@/lib/reliabilityChecks';
import type { ClairLesson } from '@/lib/clair';
import type {ContentReview} from '@/lib/contentReview';
import type {TeachingTrace} from '@/lib/teachingCourse';
export const GENERATION_VERSION = "slides-v18-scientific-source-integrity";
export type ContentLayer = "course" | "prerequisite" | "enrichment" | "organizer";
export type PageKind = "content" | "exercise" | "agenda" | "administrative" | "bibliography" | "empty";
export interface Evidence {
  documentId: string; page: number; quote: string; visualDescription?: string;
  visualReview?: {reviewer:string;reviewedAt:string;pdfSha256:string;page:number;description:string;scope:'visible-facts-only';recallHash?:string};
}

// A dated visual review is tied to the exact PDF, not a reusable model claim.
// This establishes inspected provenance, never scientific correctness.
export function verifiedVisualEvidence(source:Evidence,pdfSha256?:string,recallHash?:string):boolean {
  const review=source.visualReview;
  return Boolean(review&&!source.quote.trim()&&source.visualDescription&&pdfSha256&&/^[a-f0-9]{64}$/.test(pdfSha256)&&review.pdfSha256===pdfSha256&&review.page===source.page&&Number.isInteger(source.page)&&source.page>0&&review.description===source.visualDescription&&review.scope==='visible-facts-only'&&review.reviewer.trim()&&Number.isFinite(Date.parse(review.reviewedAt))&&(!recallHash||review.recallHash===recallHash));
}
export interface StudyCard {
  teaching?:TeachingTrace;
  id: string; cardType: "notion" | "link"; notionId?: string; linkId?: string;
  question: string; answer: string; example: string;
  kind: "definition" | "mechanism" | "comparison" | "application";
  status: "draft" | "ready" | "suspended"; evidence: Evidence[];
  objective: string; warnings: string[]; userEdited: boolean; model: string; promptVersion: string;
  revisions?: Array<{question:string;answer:string;example:string;explanation?:string;objective:string;at:string}>;
  presentation?:{packageHash:string;frontHtml:string;backHtml:string};
  accuracyReview?:ContentReview;
  explanation?:string;
  reviewedConceptDefinition?:string;
  knowledgeTrace?:{unitId:string;planKey:string;claim:string;conditions:string[]};
}
export interface CardCoverage {ready:number;draft:number;suspended:number;legacy:number;total:number;}
export const SUPERSEDED_SELECTION_WARNING='Superseded by the current source-grounded selection; original content and history retained';
export function supersededAutomaticCard(card:StudyCard):boolean {
  return card.status==='suspended'&&!card.userEdited&&card.promptVersion.startsWith('direct-cards-')&&card.warnings.includes(SUPERSEDED_SELECTION_WARNING);
}
export function sourceQuestionClaim(claim:string):boolean {
  return /\b(?:the )?(?:primary )?(?:page|document|slide|course) (?:asks?|queries|requests?|provides?|presents?|contains?|covers?|discusses?)\b/i.test(claim);
}
export function summarizeCards(cards:StudyCard[]):CardCoverage {
  return {ready:cards.filter(c=>c.status==="ready").length,draft:cards.filter(c=>c.status==="draft").length,suspended:cards.filter(c=>c.status==="suspended").length,legacy:cards.filter(c=>c.promptVersion==="legacy").length,total:cards.length};
}
export function sameCardObjective(existing:StudyCard,candidate:Pick<StudyCard,"question"|"objective"|"kind">&{answer?:string},auditedDuplicateId?:string):boolean {
  const sameQuestion=canonicalCardContent(existing.question)===canonicalCardContent(candidate.question);
  const differentScope=specificCardObjective(existing.objective)&&specificCardObjective(candidate.objective)&&canonicalCardContent(existing.objective)!==canonicalCardContent(candidate.objective);
  const sameRecall=candidate.answer!==undefined&&canonicalCardContent(existing.answer)===canonicalCardContent(candidate.answer);
  return Boolean(auditedDuplicateId&&existing.id===auditedDuplicateId) || sameQuestion&&(!differentScope||candidate.answer===undefined||sameRecall) || (existing.kind===candidate.kind && specificCardObjective(candidate.objective) && canonicalCardContent(existing.objective)===canonicalCardContent(candidate.objective));
}
function specificCardObjective(objective:string) {
  const normalized=canonicalLabel(objective);
  return Boolean(normalized) && !/^(?:definition|explain this relationship|(?:understand|learn|define|explain) (?:this|the|a|an) (?:insurance |financial |course )?(?:concept|topic|relationship|mechanism|definition|term|basics))$/.test(normalized);
}
export function reusableStudyCard(cards:StudyCard[],candidate:Pick<StudyCard,'question'|'objective'|'kind'>&{answer?:string},notionId:string,evidence:Evidence[],auditedDuplicateId?:string,reviewedIds:Set<string>=new Set()) {
  const meaningfulObjective=specificCardObjective(candidate.objective) && canonicalLabel(candidate.objective).split(' ').length>=3;
  const matches=cards.filter(card=>{
    if(auditedDuplicateId && card.id===auditedDuplicateId)return true;
    if(!sameCardObjective(card,candidate))return false;
    if(card.notionId===notionId)return true;
    // Clearing the map preserves the deck. A rebuilt node/domain is not a new
    // learning objective. Match across nodes only with a shared source page and
    // an exact question or a specific exact objective (never broad topic overlap).
    const sameSource=evidence.some(source=>card.evidence.some(old=>old.documentId===source.documentId && old.page===source.page));
    return sameSource && (canonicalCardContent(card.question)===canonicalCardContent(candidate.question) || meaningfulObjective);
  });
  const priority=(card:StudyCard)=>(card.id===auditedDuplicateId?1000:0)+(card.userEdited?100:0)+(reviewedIds.has(card.id)?10:0)+(card.status==='ready'?2:0)+(card.status==='suspended'?0:1);
  return matches.sort((a,b)=>priority(b)-priority(a)||a.id.localeCompare(b.id))[0];
}
// Card equality must preserve operators, exponents, units and case-sensitive
// symbols. Semantic paraphrases require an explicit reviewer decision.
export function canonicalCardContent(content: string) {
  return content.normalize("NFC").replace(/\s+/g, " ").trim();
}
export function canonicalLabel(label: string) {
  return label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function verifiesQuote(quote: string, text: string): boolean {
  const normalize = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
  return normalize(quote).length >= 12 && normalize(text).includes(normalize(quote));
}
export function cardQuality(question: string, answer: string, kind?: StudyCard['kind']): string[] {
  const warnings: string[] = [];
  if (question.trim().length < 12) warnings.push("Question too short or ambiguous");
  // An acronym, symbol, rank or exact value can be the complete answer.
  // Sufficiency is assessed against the question and sources by the reviewer;
  // a character quota encourages unnecessary prose and fabricated explanation.
  if (!/[\p{L}\p{N}]/u.test(answer)) warnings.push("Answer is empty or contains no recall target");
  if (question.length > 350 || answer.length > 3000) warnings.push("Split this card into smaller learning objectives");
  if (canonicalCardContent(question) === canonicalCardContent(answer)) warnings.push("Question reveals its answer");
  if (/\b(explain everything|describe everything|entire chapter|list every|describe all|summarize all)\b/i.test(question)) warnings.push("Question is too broad");
  if(/^how are .+ and .+ connected\??$/i.test(question.trim()))warnings.push('Ask about the specific mechanism, dependency or distinction, rather than the map organization.');
  if(/reconciliation session|mini.case|worked example|case study/i.test(question) && !/\d/.test(question) && /\d/.test(answer) && /total change|what is the (?:total|profit|cash|result)/i.test(question))warnings.push('A calculation card must include the relevant case inputs in the question.');
  return [...new Set([...warnings, ...arithmeticIssues(answer), ...reasoningCardIssues(question, answer, kind)])];
}

// Narrow checks for observed semantic failures. This is a second gate, not a
// substitute for source/LLM auditing and not a general proof of correctness.
export function teachingQualityIssues(label:string,content:string):string[] {
  const issues:string[]=[], text=content.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ');
  const subject=label.toLowerCase();
  if(/provision|reserv|balance sheet|reserving/.test(subject+' '+text)) {
    for (const sentence of text.split(/[.!?\n]+/)) {
      if (/\b(?:reserving|provisions?|claim reserves?)\b/.test(subject+' '+sentence) &&
          /\b(?:setting|set|putting|put) aside (?:enough |sufficient |separate )?(?:money|cash|funds)\b/.test(sentence) &&
          !/\b(?:not|never|unlike|rather than|doesn't|cannot|isn't)\b/.test(sentence)) {
        issues.push('A cash-setting-aside analogy misrepresents claim reserving; distinguish the estimated liability from funding it.');
        break;
      }
    }
    for(const match of text.matchAll(/\b(?:reserving|provisioning)\b[^.!?]{0,80}\b(?:setting|set) aside (?:enough |sufficient |separate )?funds\b/g))if(!/\b(?:not|never|cannot|can't|doesn't|rather than|unlike)\b/.test(match[0]))issues.push('Reserving estimates an obligation; it is not the act of setting aside cash.');
    if(/\breserves? (?:are|is|represent) (?:separate |segregated )funds? (?:set|put) aside/.test(text))issues.push('A claim reserve estimates a liability; it is not a separate cash fund.');
    const cashGuarantees=/(?:provisions?|reserving)\b[^.!?]{0,90}\b(?:ensure|ensures|guarantee|guarantees)\b[^.!?]{0,75}\b(?:funds|cash)\b/g;
    for(const match of text.matchAll(cashGuarantees)){
      const beforeVerb=match[0].split(/\b(?:ensure|ensures|guarantee|guarantees)\b/)[0];
      if(!/\b(?:not|never|cannot|can't|doesn't|without)\b/.test(beforeVerb.slice(-45))){issues.push('Recognizing a provision does not itself ensure available cash.');break;}
    }
  }
  if(/ceded premium|reinsurance.*expense|expense.*reinsurance/.test(subject) && /expense/.test(text) && /(?:without (?:any |a )?(?:new |direct )?effects? on profit|(?:does not|doesn't|doesnt) (?:directly )?(?:impact|affect) profit)/.test(text))issues.push('A recognized reinsurance expense reduces profit; distinguish payment timing from expense recognition.');
  if(/(?:previously reserved|claim settlement|claim payment)/.test(subject) && /(?:incurred claims|claims incurred) (?:raise|increase) liabilities/.test(text) && /(?:not affecting profit|without immediate profit impact|no profit (?:impact|changes))/.test(text))issues.push('Separate initial claim recognition (expense and liability) from settlement of an already recognized liability.');
  if(/reinsurance|risk management|diversification|reserv|underwriting/.test(subject)){
    const certainty=/\b(?:ensures?|guarantees?)\s+(?:the |continued |financial )?(?:solvency|profitability|stability)\b/g;
    for(const match of text.matchAll(certainty)) {
      const prefix=text.slice(Math.max(0,match.index!-110),match.index).split(/[.!?]/).at(-1)??'';
      const negated=/\b(?:not|never|cannot|can't|doesn't)\b(?!\s+only\b)(?:(?!\b(?:but|however|yet)\b).){0,100}$/.test(prefix);
      if(!negated){issues.push('Risk transfer or risk management can reduce exposure; it does not guarantee solvency, stability or profitability.');break;}
    }
  }
  if(/captive/.test(subject)&&/\b(?:forming|creating|establishing)\b[^.!?]{0,65}\bcaptive\b[^.!?]{0,65}\b(?:decreases|reduces|lowers|saves)\b[^.!?]{0,35}\bcosts?\b/.test(text)&&! /\b(?:may|can|could|not|depends|assuming|hypothetical)\b/.test(text))issues.push('A captive retains group risk; cost savings depend on assumptions and are not an automatic result of creating one.');
  if(/derivative|rate of change/.test(subject)){
    if(/\bderivatives? (?:are|is) (?:considered )?linear approximations?/.test(text))issues.push('A derivative is an exact local rate when its limit exists; the finite output change is approximated by the derivative multiplied by the input increment.');
    if(/\blinear approximation\s+2x\b\s+(?:omits|ignores)/.test(text))issues.push('For x squared, distinguish derivative 2x from finite-change approximation 2xh; the omitted finite-change term is h squared.');
  }
  // Equivalent observed failure in French. Keep these rules narrow and
  // negation-aware; they are regression guards, not a universal truth engine.
  if(/provision|réserv|reserv/.test(subject))for(const sentence of text.split(/[.!?]+/)){
    if(/\bprovisions?\b/.test(sentence)&&/(?:fonds?|trésorerie|tresorerie|argent) (?:mis|mise|mises) (?:de côté|de cote|à part)/.test(sentence)&&!/(?:n'est pas|ne sont pas|n'est jamais|ne représente pas|ne représentent pas|sans|plutôt que|plutot que)/.test(sentence))issues.push('Une provision comptable estime une obligation ; elle ne constitue pas une réserve de trésorerie séparée.');
    if(/\bprovisions?\b[^.!?]{0,60}(?:garantit|garantissent|assure|assurent)[^.!?]{0,50}(?:solvabilité|solvabilite|liquidité|liquidite|fonds disponibles)/.test(sentence)&&!/(?:ne .{0,35}pas|ne .{0,35}jamais|n'assure pas|n'assurent pas)/.test(sentence))issues.push('La constatation d’une provision ne garantit pas la liquidité ou la solvabilité.');
  }
  return [...new Set([...issues, ...arithmeticIssues(content)])];
}
export function createsCycle(links: Array<{source: string; target: string; type: string}>, source: string, target: string, type: string) {
  if (type === "related") return false;
  const todo = [target], seen = new Set<string>();
  while (todo.length) {
    const node = todo.pop()!;
    if (node === source) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const edge of links) if (edge.type === type && edge.source === node) todo.push(edge.target);
  }
  return false;
}

// Check the structured lesson actually displayed, including supplementary
// practice: checking only the older prose misses deepened-content failures.
export function clairMatchesConcept(label:string,lesson:ClairLesson):boolean {
  const identity=lesson.conceptLabel??lesson.reconstruction.question.match(/^Without consulting the notes, explain (.+?): the problem/)?.[1];
  return !identity||canonicalLabel(identity)===canonicalLabel(label);
}
export function clairQualityIssues(label:string,lesson:ClairLesson):string[] {
  if(!clairMatchesConcept(label,lesson))return ['Lesson belongs to a different concept'];
  const text=[lesson.context,lesson.logic.answer,...lesson.logic.steps,lesson.logic.formalism,...Object.values(lesson.logic.analogy),...Object.values(lesson.implications),lesson.reconstruction.expectedAnswer,...(lesson.practice??[]).flatMap(t=>Object.values(t))].join('\n');
  const tasks=[{question:lesson.implications.question,answer:lesson.implications.answer,reasoning:lesson.implications.why},...(lesson.practice??[])];
  return [...new Set([...teachingQualityIssues(label,text),...tasks.flatMap(t=>reasoningCardIssues(t.question,`${t.answer} ${t.reasoning}`,'application'))])];
}

// These gates concern learning utility, independently of source fidelity.
export function pedagogicalIssues(card:Pick<StudyCard,'question'|'answer'|'objective'>&{topic:string}):string[]{
  const issues:string[]=[],q=card.question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),a=card.answer.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/(?:what|which).*(?:activity|video|document|page|slide).*(?:suggested|watch|provides|representation|located)|what should you not expect from this course/.test(q)||/^(?:page \d+ image|watch (?:a|this|the) video)/.test(a))issues.push('Course instruction or source location is not a learning objective');
  if(/(?:quelle activite.*(?:page|sugger)|quel document.*(?:representation|graphique)|que.*(?:attendre|attendez).*(?:cours))/.test(q)||/^(?:regarder (?:une|la|cette) video|image (?:de la )?page)/.test(a))issues.push('Course instruction or source location is not a learning objective');
  if(/^(?:several functions together(?: should respond)?|plusieurs fonctions ensemble(?: doivent intervenir)?|it depends|various factors|many reasons)[.!]?$/.test(a.trim()))issues.push('Recall answer lacks the decisive actors, conditions or mechanism');
  if(/^(?:what (?:is|are)|define|qu.est.ce)/.test(q)&&/\b(?:crucial|important|essential|key) (?:functions?|concepts?|aspects?|factors?)\b/.test(a))issues.push('Definition describes importance but does not define the concept');
  const recallWords=a.match(/[a-z]{3,}/g)?.filter(w=>!['the','and','for','with','that','this','are','its','une','les','des','est'].includes(w))??[];
  if(recallWords.length>=3&&recallWords.every(w=>new RegExp(`\\b${w}\\b`).test(q)))issues.push('Question already supplies the substantive recall answer');
  if(/^(?:what (?:is|are)|define)/.test(q)&&/\b(?:is|are) (?:part of|included in) (?:the )?(?:operations?|functions?|activities)/.test(a))issues.push('Definition only locates the concept instead of explaining its meaning');
  if(/^(?:what|which|how)\b/.test(q)&&/\b(?:is|are) (?:functions?|activities|operations?) (?:within|in|of) (?:an? |the )?(?:insurance )?company[.!]?$/.test(a.trim()))issues.push('The answer names a generic category instead of the requested function or mechanism');
  if(/why is it important to (?:know|identify|understand|recognize)/.test(q)&&/top|players|ranking|market/.test(q)&&/crucial|important|trends|dynamics/.test(a))issues.push('Generic importance is not a source-grounded learning target');
  if(/(?:what|which).*(?:source for|data source|source of the data|reference for)/.test(q)&&/https?:\/\//.test(a))issues.push('A reference URL is provenance, not subject knowledge');
  if(/^what does (?:the )?(?:primary )?(?:document|slide|page|course)\b/.test(q)||sourceQuestionClaim(card.objective))issues.push('Restating a source question or agenda does not recall subject knowledge');
  if(/(?:which|what) (?:sectors|topics|subjects|questions).*(?:questioned|asked|queried|in the document|in the slide)/.test(q))issues.push('Listing the subjects of unanswered source questions does not recall their answers');
  if(card.answer.split(/[,;]| & /).length>7)issues.push('Recall target is an oversized list; split into meaningful distinctions');
  if(/^(?:key-ideas|comprehensive)$/.test(card.objective))issues.push('Generation detail is not a learning objective');
  if(/(?:products? practice|simulation summary|course expectations)/i.test(card.topic))issues.push('Activity or course heading is not a subject concept');
  return issues;
}
