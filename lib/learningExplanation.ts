export interface LearningWorkflow {before:string;inputs:string;decision:string;after:string;}
export interface LearningConfusion {first:string;second:string;distinction:string;}
export interface LearningSketch {relations:string[];example:string;}
export function composeLearningSketch(sketch:LearningSketch,allowOmissions=false) {
  if(allowOmissions){
    const lines=sketch.relations.filter(r=>r.trim());
    return [lines.length?`At a glance:\n${lines.join('\n')}`:'',sketch.example.trim()?`Concrete example: ${sketch.example.trim()}`:''].filter(Boolean).join('\n\n');
  }
  if(!sketch || !Array.isArray(sketch.relations) || !sketch.relations.length || sketch.relations.length>5 || sketch.relations.some(r=>typeof r!=='string' || !r.trim()) || !sketch.example?.trim())throw new Error('Missing compact relationships and concrete example');
  return `At a glance:\n${sketch.relations.map(r=>r.trim()).join('\n')}\n\nConcrete example: ${sketch.example.trim()}`;
}
export function composeLearningExplanation(explanation:string,workflow:LearningWorkflow,confusions:LearningConfusion[],allowOmissions=false) {
  if(allowOmissions){
    if(!explanation.trim())throw new Error('Missing pedagogical explanation');
    const steps=[workflow.before,workflow.inputs,workflow.decision,workflow.after].map(s=>s.trim()).filter(Boolean);
    const contrasts=confusions.filter(c=>c.first.trim()&&c.second.trim()&&c.distinction.trim()&&c.first.trim().toLowerCase()!==c.second.trim().toLowerCase());
    return [explanation.trim(),steps.length?`In the workflow: ${steps.join(' ')}`:'',contrasts.length?`Do not confuse:\n\n${contrasts.map(c=>`• ${c.first.trim()} and ${c.second.trim()}: ${c.distinction.trim()}`).join('\n\n')}`:''].filter(Boolean).join('\n\n');
  }
  if(!explanation.trim() || !workflow || ['before','inputs','decision','after'].some(k=>!workflow[k as keyof LearningWorkflow]?.trim()))throw new Error('Missing source-supported workflow explanation');
  if(!confusions?.length || confusions.some(c=>!c.first.trim() || !c.second.trim() || !c.distinction.trim() || c.first.trim().toLowerCase()===c.second.trim().toLowerCase()))throw new Error('Missing specific concept distinction');
  return `${explanation.trim()}\n\nIn the workflow: ${workflow.before.trim()} ${workflow.inputs.trim()} ${workflow.decision.trim()} ${workflow.after.trim()}\n\nDo not confuse:\n\n${confusions.map(c=>`• ${c.first.trim()} and ${c.second.trim()}: ${c.distinction.trim()}`).join('\n\n')}`;
}
