import type {Evidence} from '@/lib/contentQuality';
import type {DirectCard,DirectDraft,DirectReview} from '@/lib/directCardContracts';
import type {TeachingLesson,TeachingTrace} from '@/lib/teachingCourse';

// Publication contract shared by current teaching and historical migrations.
// It contains no prompting or subject-specific generation rules.
export interface ReviewedCandidate {
  candidate:DirectCard;evidence:Evidence[];issues:string[];contractValid:boolean;
  teaching?:TeachingTrace;
}
export interface GenerationOutput {
  lesson?:TeachingLesson;repairs?:GenerationOutput[];diagnostics?:string[];
  draft:DirectDraft;review:DirectReview;cards:ReviewedCandidate[];
  excludedCards?:Array<{key:string;reason:string}>;
}
