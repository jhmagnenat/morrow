import {NextResponse} from 'next/server';
import {courseRoute} from '@/lib/courseScope';
import {ConceptLessonError,deepenConcept} from '@/lib/conceptLesson';
import {LlmNotConfiguredError,LlmProviderError} from '@/lib/llm';

export const POST=courseRoute(async(_request:Request,{params}:{params:Promise<{id:string}>})=>{
  const {id}=await params;
  try{return NextResponse.json({lesson:await deepenConcept(id)});}
  catch(error){
    const status=error instanceof ConceptLessonError?error.status:error instanceof LlmNotConfiguredError?503:error instanceof LlmProviderError?502:500;
    return NextResponse.json({error:error instanceof Error?error.message:'Could not deepen this concept'},{status});
  }
});
