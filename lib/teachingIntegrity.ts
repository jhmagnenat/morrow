import {createHash} from 'node:crypto';
import type {TeachingLesson,TeachingTrace} from '@/lib/teachingCourse';

export function validTeachingLesson(value:unknown):value is TeachingLesson {
  if(!value||typeof value!=='object')return false;
  const l=value as TeachingLesson;
  return typeof l.id==='string'&&l.id.length>0&&typeof l.version==='string'&&typeof l.documentId==='string'&&typeof l.title==='string'&&
    /^[a-f0-9]{64}$/.test(l.sourceRevision)&&Array.isArray(l.pages)&&l.pages.length>0&&l.pages.every(p=>Number.isInteger(p)&&p>0)&&
    Array.isArray(l.units)&&l.units.every(u=>u&&typeof u.id==='string'&&typeof u.title==='string'&&typeof u.explanation==='string'&&Array.isArray(u.claims)&&u.claims.length>0&&u.claims.every(c=>c&&typeof c.id==='string'&&typeof c.statement==='string'&&c.statement.trim()&&['slide','background','illustration'].includes(c.origin)&&Array.isArray(c.sourceIds)&&c.sourceIds.length>0&&c.sourceIds.every(id=>typeof id==='string')&&c.uncertainty===''))&&
    Array.isArray(l.unresolved)&&l.unresolved.every(u=>u&&typeof u.statement==='string'&&typeof u.reason==='string')&&typeof l.reviewer==='string'&&typeof l.reviewedAt==='string'&&Number.isFinite(Date.parse(l.reviewedAt));
}

export function teachingLessonHash(lesson:TeachingLesson) {
  const {reviewedAt,...content}=lesson;void reviewedAt;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
export function validTeachingTrace(value:unknown):value is TeachingTrace {
  if(!value||typeof value!=='object')return false;
  const t=value as TeachingTrace;
  return typeof t.lessonId==='string'&&/^[a-f0-9]{64}$/.test(t.lessonHash)&&
    ['slide','background','illustration','mixed'].includes(t.origin)&&Array.isArray(t.claimIds)&&t.claimIds.length>0&&
    t.claimIds.every(id=>typeof id==='string')&&Array.isArray(t.claims)&&t.claims.length===t.claimIds.length&&
    t.claims.every(c=>c&&typeof c.id==='string'&&typeof c.statement==='string'&&['slide','background','illustration'].includes(c.origin)&&Array.isArray(c.sourceIds)&&c.sourceIds.every(id=>typeof id==='string')&&typeof c.uncertainty==='string')&&
    typeof t.reviewer==='string'&&typeof t.reviewedAt==='string'&&Number.isFinite(Date.parse(t.reviewedAt));
}
export function teachingTraceIssues(trace:TeachingTrace,lessons:Map<string,TeachingLesson>):string[] {
  if(!validTeachingTrace(trace))return ['Invalid teaching provenance'];
  const lesson=lessons.get(trace.lessonId);
  if(!lesson||teachingLessonHash(lesson)!==trace.lessonHash)return ['The reconstructed lesson changed or its original slides are unavailable'];
  const claims=lesson.units.flatMap(u=>u.claims);
  if(new Set(trace.claimIds).size!==trace.claimIds.length||trace.claims.some((c,index)=>c.id!==trace.claimIds[index]||!claims.some(a=>JSON.stringify(a)===JSON.stringify(c))))return ['Teaching claims changed after independent review'];
  const origins=new Set(trace.claims.map(c=>c.origin));
  if(trace.origin!==(origins.size===1?[...origins][0]:'mixed'))return ['Teaching origin does not match reviewed claims'];
  return [];
}
