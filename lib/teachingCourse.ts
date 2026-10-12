// Shared, serializable contract: slides are anchors, not a complete transcript.
export const TEACHING_VERSION = 'teacher-course-v1';
export type TeachingOrigin = 'slide' | 'background' | 'illustration';
export interface TeachingClaim {
  id:string; statement:string; origin:TeachingOrigin; sourceIds:string[];
  uncertainty:string;
}
export interface TeachingUnit {
  id:string; title:string; explanation:string; claims:TeachingClaim[];
}
export interface TeachingLesson {
  id:string; version:string; documentId:string; title:string; pages:number[];
  sourceRevision:string; units:TeachingUnit[];
  unresolved:Array<{statement:string;reason:string}>;
  reviewedAt:string; reviewer:string;
}
export interface TeachingTrace {
  lessonId:string; lessonHash:string; claimIds:string[];
  origin:TeachingOrigin|'mixed'; claims:TeachingClaim[];
  reviewer:string; reviewedAt:string;
}
export function teachingOriginLabel(origin:TeachingTrace['origin']) {
  return origin==='slide'?'From the slides':origin==='background'?'Added teaching context':origin==='illustration'?'Illustrative exercise':'Slides + added teaching context';
}
