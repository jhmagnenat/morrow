import {createHash} from 'node:crypto';
import type {MasteryDimension} from '@/lib/mastery';
// The same application in Interview and Drills is one task, even if its card
// ID or session ID differs. Preserve numbers/operators in the normalized text.
export function learningTaskIdentity(notionId:string,dimension:MasteryDimension,question:string){
  const normalized=question.normalize('NFKC').replace(/^Hypothetical practice:\s*/i,'').replace(/\s+/g,' ').trim().toLowerCase();
  return `${notionId}:${dimension}:${createHash('sha256').update(normalized).digest('hex').slice(0,32)}`;
}
