import {requiresPdfVisualReview,type PdfPageLayout} from '@/lib/pdfLayout';
import {isInsuranceCourse,nonTeachingSlideReason} from '@/lib/coursePedagogy';
export interface SourcePage {page:number;text:string;layout?:PdfPageLayout;}
export function hasSourceTeachingText(text:string):boolean {
  const body=text.replace(/https?:\/\/\S+/g,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^\d+$/.test(s)&&!/^(?:source|sources|credit|credits)\s*:|^based on\b/i.test(s)&&(!/^\d+\.\s+[^.!?]{1,100}$/.test(s)||/[=<>±]/.test(s))).join('\n');
  if(/(?:source|credit)\s*:/i.test(text)&&/^(?:breakdown|distribution|evolution|ranking) of [^.!?=<>\d]+$/i.test(body.replace(/\s+/g,' ').trim()))return false;
  return body.length>=12||/[=<>±]/.test(body);
}
// Explicit student/course logistics, not generic assessment of risks or claims.
export function administrativeContentReason(text:string):string|undefined {
  const s=text.normalize('NFC').toLowerCase().replace(/\s+/g,' ');
  if(/(?:what (?:you )?should not expect from (?:this|the) course|watch (?:this|a|the) video)/.test(s)&&!/\b(?:underwriting|reinsurance|reserving|claims management)\b/.test(s))return 'Course expectations and media instructions are not subject knowledge';
  if(/\b(?:moodle|slido|course logistics|office hours|enrollment phase|enrolment phase)\b/.test(s))return 'Course access and logistics are not subject knowledge';
  if(/\b(?:password|install(?:ation)?|appointment|email|e-mail)\b/.test(s)&&/\b(?:course|class|session|student|app|q&a|professor|instructor)\b/.test(s))return 'Class access, apps and appointments are not subject knowledge';
  if(/\b(?:team formation|form teams|teams? (?:of|are comprised)|nominate a presenter|submission deadline|individual reflections?|project submission)\b/.test(s))return 'Student organization and submissions are not subject knowledge';
  if(/\b(?:teamwork|report.writing|internship.like|motivations? for|academic backgrounds?|email.s tone|tone of (?:the|an) email|most proud|participants? (?:feedback|introductions?))\b/.test(s)&&/\b(?:course|class|student|session|skills|participants?|professional development|academic background)\b/.test(s))return 'Participant introductions and course feedback are not subject knowledge';
  if(/\b(?:final grade|course grade|final mark|course assessment|course grading|grading policy|grading scheme|note finale|note du cours)\b/.test(s)&&/\b(?:submission|assignment|exam|reflections?|attendance|individual|student|weight|pondération|examen|devoir|rendu)\b/.test(s))return 'Student grading policy is not subject knowledge';
  if(/\b(?:submit|upload|hand in|submission deadline|date de remise)\b/.test(s)&&/\b(?:assignment|reflection|homework|moodle|devoir|rendu)\b/.test(s))return 'Course submission instructions are not subject knowledge';
}
export function isKnowledgeCheck(text:string):boolean {return /(?:knowledge check|quiz|testez vos connaissances|contr[o\u00f4]le des connaissances|who are the top\s+\d+)/i.test(text)&&/\?/.test(text);}
export function knowledgeCheckQuestions(page:SourcePage):Array<{key:string;page:number;question:string}> {
  if(!isKnowledgeCheck(page.text))return [];
  const questions=[...page.text.matchAll(/(?:^|\n)\s*(\d+)\s+([^\n]*\?)/g)].map(m=>({key:`p${page.page}q${m[1]}`,page:page.page,question:m[2].trim()}));
  if(questions.length)return questions;
  const ranking=page.text.match(/who are the top\s+(\d+)/i);
  if(ranking){
    const segments=page.text.split(/\r?\n/).map(line=>line.match(/^\s*[\u2022*-]\s+(.+?)\s*$/)?.[1]).filter((line):line is string=>Boolean(line&&!/^who are the top\b/i.test(line))).map(line=>line.replace(/[?;:]$/,'').trim());
    if(segments.length>1)return segments.map((segment,index)=>({key:`p${page.page}q${index+1}`,page:page.page,question:`Who are the top ${ranking[1]} players among ${segment}?`}));
    return [{key:`p${page.page}q1`,page:page.page,question:page.text.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()}];
  }
  return [];
}
export function administrativePageReason(page:SourcePage,documentPages:SourcePage[]=[]):string|undefined {
  if(isKnowledgeCheck(page.text))return;
  const heading=page.text.split('\n').find(line=>line.trim())?.trim()??'';
  if(/^(?:about me|about the instructor|instructor biography|today.s lesson|course agenda|session agenda|plan du cours)$/i.test(heading))return 'Agenda or instructor biography does not teach subject knowledge';
  if(/what (?:you )?should not expect from (?:this|the) course/i.test(page.text))return 'Course expectations are not subject knowledge';
  if(/\b(?:underwriting|claims? management|claims? frequency|risk pooling|value chain|premium|formula|equation|derivative|liability|sinistralité|chaîne de valeur)\b/i.test(page.text))return;
  const overview=documentPages.slice(0,3).map(p=>p.text).join('\n');
  const known=nonTeachingSlideReason(page.text,isInsuranceCourse(overview));if(known)return known;
  if(/^\s*\d+\s*$/.test(page.text)&&/difficult challenges you faced during the class/i.test(documentPages.find(p=>p.page===page.page-1)?.text??'')&&/slido|sli\.do/i.test(documentPages.find(p=>p.page===page.page+1)?.text??''))return 'Responses to participant feedback, not subject teaching';
  return administrativeContentReason(page.text);
}
export function requiresSourceImage(page:SourcePage){return !hasSourceTeachingText(page.text)||requiresPdfVisualReview(page.layout)||page.text.trim().length<100||page.text.length<1200&&/\b(?:diagram|figure|chart|plot|schéma|graphique|organigramme)\b/i.test(page.text);}
export function planSourceBatches(pending:number[],source:SourcePage[]){
  const byPage=new Map(source.map(p=>[p.page,p])),batches:Array<{pages:number[]}>=[];
  let pages:number[]=[],characters=0,images=0;
  const flush=()=>{if(pages.length)batches.push({pages});pages=[];characters=0;images=0;};
  for(const number of [...new Set(pending)].sort((a,b)=>a-b)){
    const page=byPage.get(number);if(!page)throw Error('Generation page absent from the source revision');
    const image=requiresSourceImage(page);
    const heading=page.text.split('\n').find(line=>line.trim())??'';
    const boundary=/^(?:chapter|chapitre|section|part(?:ie)?)\s+(?:\d+|[IVX]+)\b/i.test(heading.trim());
    if(pages.length&&(boundary||pages.length>=3||characters+page.text.length>9000||images+Number(image)>2||number!==pages.at(-1)!+1))flush();
    pages.push(number);characters+=page.text.length;images+=Number(image);
    if(!batches.length||characters>=9000)flush();
  }
  flush();return batches;
}
export function sourceContext(primary:number[],source:SourcePage[]){
  const terms=(text:string)=>new Set(text.toLowerCase().match(/[\p{L}][\p{L}\p{N}]{3,}/gu)??[]);
  const query=terms(source.filter(p=>primary.includes(p.page)).map(p=>p.text).join('\n'));
  const quiz=source.some(p=>primary.includes(p.page)&&isKnowledgeCheck(p.text));
  const references=new Set([...source.filter(p=>primary.includes(p.page)).map(p=>p.text).join('\n').matchAll(/\b(?:slide|page|diapositive)\s+(\d{1,4})\b/gi)].map(m=>Number(m[1])));
  const ranked=source.filter(p=>!primary.includes(p.page)).map(p=>{
    const distance=Math.min(...primary.map(n=>Math.abs(n-p.page)));
    const overlap=[...terms(p.text)].filter(t=>query.has(t)).length;
    return {page:p,score:(references.has(p.page)?1000:0)+(distance===1?(quiz?20:80):distance===2?(quiz?10:60):0)+Math.min(quiz?90:30,overlap*(quiz?3:1))};
  }).sort((a,b)=>b.score-a.score||a.page.page-b.page.page);
  const context:SourcePage[]=[];let characters=0;
  for(const {page,score} of ranked){
    if(context.length>=6)break;
    if(!score||characters+page.text.length>18000)continue;
    context.push(page);characters+=page.text.length;
  }
  return [...source.filter(p=>primary.includes(p.page)),...context].sort((a,b)=>a.page-b.page);
}
