import {timingSafeEqual} from 'node:crypto';
import {courseRoute} from '@/lib/courseScope';
import {courseTransferStatus,exportCourseTransfer,readCourseTransfer,importCourseTransfer,TransferConflict} from '@/lib/courseTransfer';
function authorized(request:Request){
  const configured=process.env.MORROW_TRANSFER_TOKEN;if(!configured||configured.length<32)return Response.json({error:'Configure MORROW_TRANSFER_TOKEN with at least 32 characters before using transfer APIs'},{status:503});
  const supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(configured)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(configured)))return Response.json({error:'Unauthorized transfer'},{status:401});
}
export const GET=courseRoute(async(request:Request)=>{
  const denied=authorized(request);if(denied)return denied;
  if(new URL(request.url).searchParams.get('download')==='true'){
    const result=exportCourseTransfer();return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="course.morrow"','Cache-Control':'no-store','ETag':`"${result.revision}"`}});
  }
  return Response.json(courseTransferStatus(),{headers:{'Cache-Control':'no-store'}});
});
export const POST=courseRoute(async(request:Request)=>{
  const denied=authorized(request);if(denied)return denied;
  const expected=request.headers.get('If-Match')?.replace(/^"|"$/g,'');
  if(!expected||!/^[a-f0-9]{64}$/.test(expected))return Response.json({error:'If-Match must contain the last known destination revision'},{status:428});
  if(Number(request.headers.get('Content-Length'))>256*1024*1024)return Response.json({error:'Transfer exceeds 256 MiB'},{status:413});
  try{
    // Stream with a bound instead of allocating an unbounded request body.
    const chunks:Buffer[]=[];let size=0;const reader=request.body?.getReader();if(!reader)throw Error('Transfer file required');
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024*1024){await reader.cancel();return Response.json({error:'Transfer exceeds 256 MiB'},{status:413});}chunks.push(Buffer.from(value));}
    const bytes=Buffer.concat(chunks);
    if(new URL(request.url).searchParams.get('preview')==='true'){
      const incoming=readCourseTransfer(bytes),current=courseTransferStatus();return Response.json({sourceCourseId:incoming.sourceCourseId,revision:incoming.revision,conflict:current.revision!==expected,notions:incoming.snapshot.notions.length,documents:incoming.snapshot.documents.length,reviews:incoming.snapshot.reviewLog.length});
    }
    return Response.json(importCourseTransfer(bytes,expected));
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Transfer failed; current data preserved'},{status:error instanceof TransferConflict?409:400});}
});
