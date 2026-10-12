import { randomUUID } from "node:crypto";
import { claimDocument, renewClaim, releaseClaim } from "@/lib/qualityDb";
import { courseRoute } from "@/lib/courseScope";
import { NextResponse,after } from "next/server";
import {getDocumentGeneration,startDocumentGeneration,waitForDocumentGeneration} from '@/lib/documentGeneration';
import { scopedCourseId, withCourse } from "@/lib/courseScope";
import { generationLocks } from "@/lib/generationLocks";
import {generateConfiguredSection} from '@/lib/generationDispatch';
import { isLlmConfigured } from "@/lib/llm";
import {findGenerationDocument} from '@/lib/generationRepository';
async function handlePOST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const courseId=scopedCourseId(), {id}=await params;
  const body=await request.json().catch(()=>({}));
  if(!body || typeof body!=="object")return NextResponse.json({error:"Invalid generation request"},{status:400});
  if(body.cardDetail!==undefined&&!['key-ideas','comprehensive'].includes(body.cardDetail))return NextResponse.json({error:'Choose key ideas or comprehensive card coverage'},{status:400});
  if(body.reprocess!==undefined&&typeof body.reprocess!=='boolean')return NextResponse.json({error:'Invalid regeneration choice'},{status:400});
  if(body.pages!==undefined && (!Array.isArray(body.pages) || !body.pages.length || body.pages.length>3 || body.pages.some((p:unknown)=>!Number.isInteger(p) || Number(p)<1)))return NextResponse.json({error:"Select 1 to 3 valid pages"},{status:400});
  const document=findGenerationDocument(id);
  if(!document)return NextResponse.json({error:"Document not found in this course"},{status:404});
  if(body.pages?.some((p:number)=>p>(document.pageCount ?? 0)))return NextResponse.json({error:"Slide exceeds the document's page count"},{status:400});
  if (!isLlmConfigured()) return NextResponse.json({error:"No LLM configured"},{status:503});
  if(body.background===true){
    try {
      const job=startDocumentGeneration(id,{mode:body.mode==='open'?'open':'strict',enrichment:body.enrichment===true,cardDetail:body.cardDetail,pages:body.pages,reprocess:body.reprocess===true});
      after(()=>waitForDocumentGeneration(job.id));
      return NextResponse.json({job},{status:job.status==='running'?202:200});
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not start generation'},{status:409});}
  }
  const lock=`${courseId}:${id}`, locks=generationLocks();
  if (locks.has(lock)) return NextResponse.json({error:"Generation already running"},{status:409});
  const claimId=randomUUID();
  if(!withCourse(courseId,()=>claimDocument(id,claimId)))return NextResponse.json({error:"Generation already running"},{status:409});
  locks.add(lock);
  const heartbeat=setInterval(()=>withCourse(courseId,()=>renewClaim(id,claimId)),60000);heartbeat.unref();
  try {return NextResponse.json(await withCourse(courseId,()=>generateConfiguredSection(id,{mode:body.mode==="open"?"open":"strict",enrichment:body.enrichment===true,cardDetail:body.cardDetail,skipRetried:body.skipRetried===true,pages:body.pages,claimId})));}
  catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Generation failed"},{status:500});}
  finally {clearInterval(heartbeat);withCourse(courseId,()=>releaseClaim(id,claimId));locks.delete(lock);}
}

export const POST = courseRoute(handlePOST);
export const GET=courseRoute(async(_request:Request,{params}:{params:Promise<{id:string}>})=>{
  const {id}=await params;
  if(!findGenerationDocument(id))return NextResponse.json({error:'Document not found in this course'},{status:404});
  return NextResponse.json({job:getDocumentGeneration(id)??null});
});
