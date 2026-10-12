import {courseRoute} from '@/lib/courseScope';
import {updateNotionAdept} from '@/lib/db';
import {sourceAdept} from '@/lib/sourceSupplement';
import {SourceContextError} from '@/lib/notionSources';
import {LlmNotConfiguredError,LlmProviderError} from '@/lib/llm';
async function handlePOST(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  try{const adept=await sourceAdept(id);updateNotionAdept(id,adept);return Response.json({adept});}
  catch(error){if(error instanceof SourceContextError)return Response.json({error:error.message},{status:error.status});if(error instanceof LlmNotConfiguredError||error instanceof LlmProviderError)return Response.json({error:error.message},{status:503});throw error;}
}
export const POST=courseRoute(handlePOST);
