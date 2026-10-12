// Audit every displayed assertion, not just the concept heading. The model
// decides semantic support; local checks require complete, source-bound decisions.
export interface SectionAssertion {key:string;concept:string;text:string;kind:'fact'|'deduction'|'exercise';pages:number[];}
export interface AssertionDecision {key:string;supported:boolean;pages:number[];reason:string;}
interface Concept {
  key:string;definition:string;sources:Array<{page:number;quote:string}>;
  lesson?:{intuition:string;goalAnswer:string;mechanism:string[];technical:string;conditions?:string;limits?:string;experiment:{setup:string;rule:string;question:string;answer:string;why:string}};
}
export function sectionAssertions(concepts:Concept[]):SectionAssertion[]{
  return concepts.flatMap(c=>{
    const fields:Array<[string,string,SectionAssertion['kind']]>=[
      ['definition',c.definition,'fact'],
      ...(c.lesson?[['intuition',c.lesson.intuition,'deduction'],
      ['answer',c.lesson.goalAnswer,'deduction'],['technical',c.lesson.technical,'fact'],
      ['conditions',c.lesson.conditions??'','fact'],['limits',c.lesson.limits??'','deduction'],
      ...c.lesson.mechanism.map((step,i)=>[`step-${i}`,step,'deduction'] as [string,string,SectionAssertion['kind']]),
      ['exercise',Object.values(c.lesson.experiment).join('\n'),'exercise']] as Array<[string,string,SectionAssertion['kind']]>:[]),
    ];
    return fields.filter(([,text])=>text.trim()).map(([field,text,kind])=>({key:`${c.key}:${field}`,concept:c.key,text,kind,pages:[...new Set(c.sources.map(s=>s.page))]}));
  });
}
export function assertionIssues(assertions:SectionAssertion[],decisions:AssertionDecision[]|undefined):Map<string,string[]>{
  const issues=new Map<string,string[]>();
  for(const assertion of assertions){
    const matches=(decisions??[]).filter(d=>d.key===assertion.key),decision=matches.length===1?matches[0]:undefined;
    let issue='';
    if(!decision)issue=`Missing or duplicate assertion audit: ${assertion.key}`;
    else if(!decision.supported)issue=`Unsupported assertion ${assertion.key}: ${decision.reason||'requires source verification'}`;
    else if(!decision.pages?.length||decision.pages.some(page=>!assertion.pages.includes(page)))issue=`Assertion ${assertion.key} does not identify its verified supporting source`;
    if(issue)issues.set(assertion.concept,[...(issues.get(assertion.concept)??[]),issue]);
  }
  if((decisions??[]).some(d=>!assertions.some(a=>a.key===d.key))){
    for(const concept of new Set(assertions.map(a=>a.concept)))issues.set(concept,[...(issues.get(concept)??[]),'Unexpected assertion audit identity']);
  }
  return issues;
}
