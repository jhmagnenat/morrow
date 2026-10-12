import {createHash} from 'node:crypto';
import type {Snapshot} from '@/lib/db';
import type {StudyCard} from '@/lib/contentQuality';
import {verifiesQuote,verifiedVisualEvidence,type Evidence} from '@/lib/contentQuality';

export const EVALUATION_DIMENSIONS=['sourceAccuracy','mechanism','connections','assumptions','transfer','reconstruction','conciseness'] as const;
type Dimension=typeof EVALUATION_DIMENSIONS[number];
export interface EvaluationCase {id:string;label:string;lesson:unknown;cards:Array<{question:string;answer:string;kind:string}>;excludedDraftCards?:number;sources:Array<{title:string;page:number;text:string;visualDescriptions?:string[]}>;provenanceIssues:string[];ratings:Record<Dimension,number|null>;criticalErrors:number|null;comment:string;}
export interface LearningEvaluation {version:1;system:string;createdAt:string;courseId:string;cases:EvaluationCase[];}
export function buildLearningEvaluation(snapshot:Snapshot,courseId:string,limit=30):LearningEvaluation{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Evaluation sample must contain 1–100 concepts');
  const cards=(snapshot.quality?.study_cards??[]).map(row=>JSON.parse(String((row as {payload:string}).payload)) as StudyCard);
  const byNotion=new Map<string,StudyCard[]>();for(const card of cards)if(card.notionId){const list=byNotion.get(card.notionId)??[];list.push(card);byNotion.set(card.notionId,list);}
  const documents=new Map(snapshot.documents.map(doc=>[doc.id,doc]));
  const fingerprints=new Map(snapshot.documents.map(doc=>[doc.id,doc.pdfBase64?createHash('sha256').update(Buffer.from(doc.pdfBase64,'base64')).digest('hex'):undefined]));
  const validEvidence=(e:Evidence)=>{
    const doc=documents.get(e.documentId);
    return Boolean(doc&&Number.isInteger(e.page)&&e.page>0&&(doc.pageCount===undefined||e.page<=doc.pageCount)&&(verifiesQuote(e.quote,doc.passages.filter(p=>p.page===e.page).map(p=>p.text).join('\n'))||verifiedVisualEvidence(e,fingerprints.get(e.documentId))));
  };
  // Stable sampling prevents silently selecting only the most polished lessons.
  const key=(id:string)=>createHash('sha256').update(`${courseId}:${id}`).digest('hex');
  const notions=snapshot.notions.filter(n=>n.layer!=='organizer').sort((a,b)=>key(a.id).localeCompare(key(b.id))).slice(0,limit);
  return {version:1,system:'Morrow',createdAt:new Date().toISOString(),courseId,cases:notions.map(notion=>{
    const allCards=byNotion.get(notion.id)??[],selected=allCards.filter(c=>c.status==='ready'),lessonEvidence=[...(notion.evidence??[]),...(notion.clair?.sources??[])],references=[...notion.sources,...lessonEvidence,...selected.flatMap(card=>card.evidence)],seen=new Set<string>();
    const sources=references.flatMap(source=>{
      const reference=`${source.documentId}:${source.page}`;if(seen.has(reference))return [];seen.add(reference);
      const doc=documents.get(source.documentId),visualDescriptions=[...lessonEvidence,...selected.flatMap(c=>c.evidence)].filter(e=>e.documentId===source.documentId&&e.page===source.page&&e.visualDescription).map(e=>e.visualDescription!);
      return doc?[{title:doc.title,page:source.page,text:doc.passages.filter(p=>p.page===source.page).sort((a,b)=>a.ordinal-b.ordinal).map(p=>p.text).join('\n'),visualDescriptions:[...new Set(visualDescriptions)]}]:[];
    });
    const issues=selected.flatMap(card=>card.evidence.filter(e=>{
      return !validEvidence(e);
    }).map(()=>`Unverified citation in card ${card.id}`));
    for(const source of lessonEvidence)if(!validEvidence(source))issues.push('Unverified concept/lesson citation');
    if(!sources.length||sources.some(source=>!source.text.trim()))issues.push('No source text available for this concept or a cited page');
    return {id:notion.id,label:notion.label,lesson:notion.clair??{definition:notion.definition,explanation:notion.explanation,courseContext:notion.courseContext},cards:selected.map(c=>({question:c.question,answer:c.answer,kind:c.kind})),excludedDraftCards:allCards.length-selected.length,sources,provenanceIssues:[...new Set(issues)],ratings:Object.fromEntries(EVALUATION_DIMENSIONS.map(d=>[d,null])) as Record<Dimension,null>,criticalErrors:null,comment:''};
  })};
}
export function scoreLearningEvaluation(input:LearningEvaluation){
  if(input?.version!==1||!Array.isArray(input.cases)||input.cases.length>100||typeof input.system!=='string')throw Error('Invalid learning evaluation');
  const ids=new Set<string>(),reviewed:EvaluationCase[]=[],unreviewed:string[]=[];
  for(const item of input.cases){
    if(!item||typeof item.id!=='string'||ids.has(item.id)||!item.ratings||!Array.isArray(item.provenanceIssues))throw Error('Invalid or duplicate evaluation case');ids.add(item.id);
    for(const d of EVALUATION_DIMENSIONS){const value=item.ratings[d];if(value!==null&&(!Number.isInteger(value)||value<0||value>4))throw Error(`Rating ${d} must be null or an integer from 0 to 4`);}
    if(item.criticalErrors!==null&&(!Number.isInteger(item.criticalErrors)||item.criticalErrors<0))throw Error('Critical error count must be null or a non-negative integer');
    if(item.criticalErrors===null||EVALUATION_DIMENSIONS.some(d=>item.ratings[d]===null)){unreviewed.push(item.id);continue;}reviewed.push(item);
  }
  const averages=Object.fromEntries(EVALUATION_DIMENSIONS.map(d=>[d,reviewed.length?reviewed.reduce((n,item)=>n+item.ratings[d]!,0)/reviewed.length:null]));
  const passed=reviewed.filter(item=>!item.criticalErrors&&!item.provenanceIssues.length&&EVALUATION_DIMENSIONS.every(d=>item.ratings[d]!>=3));
  return {system:input.system,total:input.cases.length,reviewed:reviewed.length,unreviewed:unreviewed.length,coverage:input.cases.length?reviewed.length/input.cases.length:0,averages,criticalErrors:reviewed.reduce((n,item)=>n+item.criticalErrors!,0),passed:passed.length,passRate:reviewed.length?passed.length/reviewed.length:null,limitations:['Ratings are human-provided, not automatic proof of truth.','Incomplete cases are excluded from quality averages and remain visible in coverage.','A comparison requires the same courses, sample, rubric and independent reviewers.']};
}
