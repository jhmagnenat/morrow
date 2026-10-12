import {courseRoute,scopedCourseId} from '@/lib/courseScope';
import {exportSnapshot} from '@/lib/db';
import {buildLearningEvaluation,scoreLearningEvaluation} from '@/lib/learningEvaluation';
export const GET=courseRoute(async()=>Response.json(buildLearningEvaluation(exportSnapshot(),scopedCourseId()),{headers:{'Cache-Control':'no-store'}}));
export const POST=courseRoute(async(request:Request)=>{
  try{return Response.json(scoreLearningEvaluation(await request.json()),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid evaluation'},{status:400});}
});
