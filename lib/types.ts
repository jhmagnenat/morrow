import type { CardCoverage, ContentLayer, Evidence } from "@/lib/contentQuality";
import type { ClairLesson } from '@/lib/clair';
// Free-form category name (e.g. "Core Concepts", "Reinsurance" — or, for a
// completely different subject, "Cell Biology", "Syntax"...). Not a fixed
// enum: the encyclopedia isn't tied to any one topic, so the set of
// categories is whatever the content actually needs.
export type Domain = string;

export type NotionStatus = "draft" | "validated";
export type CardDetail = 'key-ideas' | 'comprehensive';

export type LinkType = "prerequisite" | "sub-notion" | "related" | "chapter";

export interface Source {
  documentId: string;
  page: number;
}

export interface NotionSourceNote {
  documentId:string;
  page:number;
  explanation:string;
  courseContext:string;
  version:string;
}

// BetterExplained's ADEPT method: five complementary angles on an abstract
// concept, generated on demand — not every notion needs it (concrete,
// simple ones rarely do), so it's absent until the student asks for it.
export interface AdeptExplanation {
  analogy: string;
  // A described visual/spatial way to picture the concept — text, since
  // there's no image generation here, but still framed as "picture this".
  diagram: string;
  example: string;
  plainEnglish: string;
  technical: string;
}

// "Go further": adds TEXT to the notion itself (same spirit as ADEPT) —
// a deeper example, a described next direction, and real-world references
// to look into. Deliberately does NOT create new graph nodes.
export interface GoFurtherNote {
  moreExamples: string;
  nextStep: string;
  references: string;
}

// A Drill (flashcard) front/back, in topic-breakdown style: a short, GENERAL
// definition — never lifted verbatim from a source slide, and never a
// fill-in-the-blank over a specific number from a one-off worked example,
// since there's no way to actually reason your way to a memorized number.
// "Term → general definition (with a brief example)" is the model, e.g.
// "Peril → cause of loss (e.g., fire, theft)". Generated once per notion and
// cached, so a drill session stays instant after the first pass.
export interface DrillCard {
  kind?: 'definition' | 'mechanism' | 'comparison' | 'application';
  presentation?:{packageHash:string;frontHtml:string;backHtml:string};
  explanation?:string;
  definition: string;
  example: string;
}

export interface WorkQuestion {
  question: string;
  // Short, direct answer — a few sentences, not a full essay. Empty string
  // for notions created before this field existed, until backfilled.
  answer: string;
}

export interface Notion {
  contentWarnings?:string[];
  clair?: ClairLesson;
  generationVersion?:string;
  sourceNotes?:NotionSourceNote[];
  cardCoverage?:CardCoverage;
  layer?: ContentLayer;
  evidence?: Evidence[];
  userEdited?: boolean;
  id: string;
  label: string;
  domain: Domain;
  status: NotionStatus;
  // One or two sentences: the quick answer to "what is this".
  definition: string;
  // The mentor-to-intern explanation: multiple paragraphs covering why it
  // matters, how it fits the bigger picture, and at least one concrete
  // worked example with real numbers. Optional for backward compatibility
  // with older/simpler notions.
  explanation?: string;
  // A short paragraph, generated alongside explanation, that situates the
  // notion specifically within THIS course — e.g. "In this course, we learn
  // that..." — as opposed to the universal/textbook framing above it. Shown
  // right after explanation. Absent for older notions (pre-dates the field)
  // and for hand-written/seed notions.
  courseContext?: string;
  // Set only for LLM-generated notions in strict mode: "grounded" if the
  // specifics in the explanation are actually present in the source text,
  // "inferred" if the source was too sparse (e.g. a bare slide bullet) and
  // the model filled the gap from its own general knowledge — which may be
  // wrong. Absent for hand-written/seed notions and open-mode generations.
  grounding?: "grounded" | "inferred";
  // Concrete questions a colleague would actually ask about this on the job
  // (e.g. for "Premium": "Did you calculate the premium?") — ties the notion
  // back to real workplace usage, not just the textbook definition. Each
  // comes with its own short answer so this is useful standalone, not just
  // a list of things to go figure out elsewhere.
  workQuestions?: WorkQuestion[];
  // Generated on demand for abstract notions that benefit from seeing the
  // idea from multiple angles at once, rather than one linear explanation.
  adept?: AdeptExplanation;
  // Same idea as adept — generated on demand, attached to this notion, not
  // a graph-expanding action.
  goFurther?: GoFurtherNote;
  // The Drill flashcard for this notion — generated alongside the notion
  // itself (or lazily backfilled the first time it comes up due) so review
  // sessions stay fast.
  drillCard?: DrillCard;
  sources: Source[];
}

export interface Link {
  evidence?: Evidence[];
  id: string;
  source: string;
  target: string;
  type: LinkType;
  // Sentence (ideally with a concrete example) explaining *why* these two
  // notions are connected. Hand-written for the seed set; LLM-generated with
  // a citation back to the source passage when produced from a PDF.
  description: string;
}

export type DocumentKind = "book" | "course" | "article" | "regulation";

export interface Document {
  id: string;
  title: string;
  kind: DocumentKind;
  filename?: string;
  pageCount?: number;
}

export interface Passage {
  id: string;
  documentId: string;
  page: number;
  ordinal: number;
  text: string;
}

export type GenerationMode = "strict" | "open";

// A fixed, visually-distinct palette. Any domain name gets a deterministic
// color via a string hash — no hardcoded mapping, so a brand new category
// name (for any subject) still gets a stable, sensible color immediately.
const DOMAIN_PALETTE = [
  "#b8864b", // brass
  "#4f9d94", // teal
  "#c4542e", // terracotta
  "#8a9a5b", // sage
  "#8669a3", // plum
  "#b65c7a", // mauve
  "#6b8ca3", // steel blue
  "#c77b3f", // ochre
  "#5f7a52", // forest
  "#9b6b4f", // clay
];

export function colorForDomain(domain: Domain): string {
  if(domain==="Course overview")return "#6b8ca3";
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  return DOMAIN_PALETTE[Math.abs(hash) % DOMAIN_PALETTE.length];
}
