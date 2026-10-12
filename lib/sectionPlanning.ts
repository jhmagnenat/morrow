import {isInsuranceCourse,nonTeachingSlideReason} from '@/lib/coursePedagogy';

export interface LearningSection {pages:number[];kind:'text'|'visual'|'excluded';}
// Direct batches share the same engine for text and diagrams. A short first
// batch exposes checked cards early; later batches amortize API overhead.
export function planDirectCardBatches(pending:number[],passages:Array<{page:number;text:string}>,visualPages:Set<number>=new Set()):LearningSection[]{
  const texts=new Map<number,string>();for(const p of passages)texts.set(p.page,(texts.get(p.page)??'')+'\n'+p.text);
  const batches:LearningSection[]=[];let pages:number[]=[],characters=0,images=0;
  const flush=()=>{if(pages.length)batches.push({pages,kind:images?'visual':'text'});pages=[];characters=0;images=0;};
  for(const page of [...new Set(pending)].sort((a,b)=>a-b)){
    const text=texts.get(page)??'',image=visualPages.has(page)||needsVisualReview(text);
    if(pages.length&&(pages.length>=3||characters+text.length>9000||images+Number(image)>2||page!==pages.at(-1)!+1))flush();
    pages.push(page);characters+=text.length;images+=Number(image);
    if(!batches.length||characters>=9000)flush();
  }
  flush();return batches;
}
export function needsVisualReview(text:string){
  return text.trim().length<100 || text.length<1200&&/\b(?:diagram|figure|chart|plot|schéma|graphique|organigramme)\b/i.test(text);
}

// Bound input and output work, without splitting every slide into a paid job.
// The first short section is processed first so study can begin during import.
export function planLearningSections(pending:number[],passages:Array<{page:number;text:string}>,visualPages:Set<number>=new Set()):LearningSection[]{
  const text=new Map<number,string>();
  for(const p of passages)text.set(p.page,`${text.get(p.page)??''}\n${p.text}`);
  const insurance=isInsuranceCourse([...text.values()].join('\n'));
  const result:LearningSection[]=[];
  let current:number[]=[],length=0,first=true;
  const flush=()=>{if(current.length){result.push({pages:current,kind:'text'});current=[];length=0;first=false;}};
  for(const page of [...new Set(pending)].sort((a,b)=>a-b)){
    const content=(text.get(page)??'').trim();
    const excluded=nonTeachingSlideReason(content,insurance);
    // Sparse extraction cannot establish that figures contain no knowledge.
    if(visualPages.has(page)||excluded||needsVisualReview(content)){flush();result.push({pages:[page],kind:visualPages.has(page)?'visual':excluded?'excluded':'visual'});continue;}
    const heading=content.split('\n').find(line=>line.trim())??'';
    const boundary=/^(?:chapter|chapitre|section|part(?:ie)?)\s+(?:\d+|[IVX]+)\b/i.test(heading);
    if(current.length&&(boundary||page!==current.at(-1)!+1||current.length>=(first?2:6)||length+content.length>(first?3500:9000)))flush();
    current.push(page);length+=content.length;
    if(content.length>4500)flush();
  }
  flush();return result;
}
