import {NextResponse} from 'next/server';
import {courseRoute,withCourse} from '@/lib/courseScope';
import {listRecoveryPoints,recoverySnapshot} from '@/lib/recovery';
import {restoreWithPdfs} from '@/lib/backup';
export const GET=courseRoute(async(request:Request)=>{
  const source=new URL(request.url).searchParams.get('sourceCourseId');
  if(source&&!/^[a-zA-Z0-9_-]+$/.test(source))return NextResponse.json({error:'Invalid source course'},{status:400});
  return NextResponse.json({points:source?withCourse(source,listRecoveryPoints):listRecoveryPoints()});
});
export const POST=courseRoute(async(request:Request)=>{
  const body=await request.json().catch(()=>null);
  if(typeof body?.id!=='string')return NextResponse.json({error:'Recovery point id required'},{status:400});
  if(body.sourceCourseId!==undefined&&(typeof body.sourceCourseId!=='string'||!/^[a-zA-Z0-9_-]+$/.test(body.sourceCourseId)))return NextResponse.json({error:'Invalid source course'},{status:400});
  try{const snapshot=body.sourceCourseId?withCourse(body.sourceCourseId,()=>recoverySnapshot(body.id)):recoverySnapshot(body.id);restoreWithPdfs(snapshot);return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Recovery failed'},{status:400});}
});
