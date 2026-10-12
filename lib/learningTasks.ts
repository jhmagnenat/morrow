import { MASTERY_DIMENSIONS, type MasteryDimension, type MasteryInfo } from '@/lib/mastery';
import type { Notion } from '@/lib/types';
import type { Evidence } from '@/lib/contentQuality';
import {verifiedVisualEvidence,clairQualityIssues,teachingQualityIssues} from '@/lib/contentQuality';
import {learningTaskIdentity} from '@/lib/taskIdentity';

export interface LearningTask {
  taskId?:string;
  question: string;
  relatedNotionIds: string[];
  learningDimension: MasteryDimension;
  referenceAnswer: string;
  sourceEvidence: Evidence[];
}

export function courseTasks(notions: Notion[], mastery: Record<string, MasteryInfo>, limit = 10,previous:Array<{question:string;answeredAt?:string}>=[],sourceFingerprints:Record<string,string>={}): LearningTask[] {
  const tasks: Array<LearningTask & {priority: number}> = [];
  for (const notion of notions.filter(n => n.clair&&!n.contentWarnings?.length&&!clairQualityIssues(n.label,n.clair).length&&!teachingQualityIssues(n.label,n.definition).length&&n.clair.sources.some(s => s.quote.trim()||verifiedVisualEvidence(s,sourceFingerprints[s.documentId])))) {
    const lesson = notion.clair!;
    for (const dimension of MASTERY_DIMENSIONS) {
      let question = '', referenceAnswer = '';
      if (dimension === 'definition') {question = `In this course, what does ${notion.label} mean? State its defining feature and scope.`; referenceAnswer = notion.definition;}
      if (dimension === 'mechanism') {question = `Explain how ${notion.label} works and why each step follows. What problem does it solve?`; referenceAnswer = [lesson.logic.answer, ...lesson.logic.steps].join('\n');}
      if (dimension === 'relations') {
        const connection = lesson.articulations.find(c => c.type === 'prerequisite' || c.type === 'related');
        question = connection?`What is the specific ${connection.type === 'prerequisite' ? 'dependency' : 'connection'} between ${notion.label} and ${connection.label}, and why does it hold?`:`For ${notion.label}, how do the stated inputs or conditions lead to its outcome? Explain the dependency rather than restating the definition.`;
        referenceAnswer = connection?connection.explanation:[...lesson.logic.steps,lesson.logic.formalism].join('\n');
      }
      if (dimension === 'application') {question = `${lesson.implications.setup}\nAssume: ${lesson.implications.assumptions}\n${lesson.implications.question}`; referenceAnswer = `${lesson.implications.answer}\n${lesson.implications.why}`;}
      if (dimension === 'reconstruction') {question = lesson.reconstruction.question; referenceAnswer = lesson.reconstruction.expectedAnswer;}
      const score = mastery[notion.id]?.dimensions?.[dimension].score;
      // Actual failures have priority over untested skills; definition-only
      // successes never hide a weak mechanism, relation or transfer skill.
      const priority = score === null || score === undefined ? 0.55 : score;
      const add=(q:string,answer:string,suffix:string)=>{
        const repetitions=previous.filter(p=>p.answeredAt&&p.question===q).length;
        void suffix;
        tasks.push({taskId:learningTaskIdentity(notion.id,dimension,q),question:q,referenceAnswer:answer,relatedNotionIds:[notion.id],learningDimension:dimension,sourceEvidence:lesson.sources,priority:priority+(dimension==='definition'?0.1:0)+Math.min(repetitions,5)*0.02});
      };
      add(question,referenceAnswer,'main');
      if(dimension==='application')for(const [index,variant] of (lesson.practice??[]).entries())add(`Hypothetical practice: ${variant.setup}\nAssume: ${variant.assumptions}\n${variant.question}`,`${variant.answer}\n${variant.reasoning}`,`transfer-${index}`);
      if(dimension==='reconstruction')add(`Without notes, teach ${notion.label} to a beginner: start from the problem, derive the mechanism, then explain when the formal rule applies.`,referenceAnswer,'teach');
    }
  }
  tasks.sort((a, b) => a.priority - b.priority);
  const selected: LearningTask[] = [], seen = new Set<string>();
  // Spread the first pass across concepts before asking several questions
  // about the same concept. Preserve weakness priority within each pass.
  while (tasks.length && selected.length < limit) {
    let index = tasks.findIndex(t => !seen.has(t.relatedNotionIds[0]));
    if (index < 0) {seen.clear(); index = 0;}
    const task = tasks.splice(index, 1)[0]; seen.add(task.relatedNotionIds[0]);
    const {priority: _priority, ...publicTask} = task; void _priority;
    selected.push(publicTask);
  }
  return selected;
}
