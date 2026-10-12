import {courseRoute,withCourse} from '@/lib/courseScope';
import {listCourses} from '@/lib/courses';
import {ankiMedia} from '@/lib/ankiMedia';
export const GET=courseRoute(async(request:Request,{params}:{params:Promise<{hash:string;name:string}>})=>{
  const {hash,name}=await params,course=new URL(request.url).searchParams.get('courseId');
  if(course&&!listCourses().some(c=>c.id===course))return Response.json({error:'Media not found'},{status:404});
  const media=course?withCourse(course,()=>ankiMedia(hash,name)):ankiMedia(hash,name);
  if(!media)return Response.json({error:'Media not found'},{status:404});
  return new Response(new Uint8Array(media.bytes),{headers:{'Content-Type':media.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
});
