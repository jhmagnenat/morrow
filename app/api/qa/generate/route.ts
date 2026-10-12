import {courseRoute} from '@/lib/courseScope';
import {generateQaQuestions} from '@/lib/qaGeneration';
import {LlmNotConfiguredError,LlmProviderError} from '@/lib/llm';
export const POST=courseRoute(async(request:Request)=>{
  const body=await request.json().catch(()=>null);
  if(typeof body?.notionId!=='string'||!Number.isInteger(body.count??3)||(body.count??3)<1||(body.count??3)>5)return Response.json({error:'Choose a notion and one to five questions'},{status:400});
  try{return Response.json(await generateQaQuestions(body.notionId,body.count??3));}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Generation failed'},{status:error instanceof LlmNotConfiguredError||error instanceof LlmProviderError?503:409});}
});
