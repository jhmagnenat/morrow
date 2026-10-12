import { AsyncLocalStorage } from "node:async_hooks";
import { getActiveCourseId, listCourses } from "@/lib/courses";
import {authEnabled,requestUser} from '@/lib/auth';
import {withUser} from '@/lib/identityScope';

declare global { var __courseScope: AsyncLocalStorage<string> | undefined; }
const scope = global.__courseScope ??= new AsyncLocalStorage<string>();
export function scopedCourseId() { return scope.getStore() ?? getActiveCourseId(); }
export function withCourse<T>(courseId: string, work: () => T): T { return scope.run(courseId, work); }
export function courseRoute<A extends unknown[]>(handler:(...args:A)=>Promise<Response>) {
  return (...args:A):Promise<Response> => {
    const request=args[0] instanceof Request ? args[0] : null;
    const user=request&&authEnabled()?requestUser(request):undefined;
    if(request&&authEnabled()&&!user)return Promise.resolve(Response.json({error:'Sign in to access this workspace'},{status:401}));
    return withUser(user,()=>{
    if(request&&!['GET','HEAD','OPTIONS'].includes(request.method)){
      const origin=request.headers.get('Origin');
      const allowed=process.env.MORROW_PUBLIC_ORIGIN??new URL(request.url).origin;
      // Browser requests from another site must not modify a local course
      // or launch paid generation through a simple cross-origin POST.
      if(request.headers.get('Sec-Fetch-Site')==='cross-site'||origin&&origin!==allowed){
        return Promise.resolve(Response.json({error:'Cross-origin course changes are not allowed'},{status:403}));
      }
    }
    const cookie=request?.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('morrow-course='))?.slice(14);
    const requested=request?.headers.get("X-Course-Id")??cookie;
    // Only identifiers already present in the local registry may select a DB.
    if(requested && !listCourses().some(c=>c.id===requested))return Promise.resolve(new Response(JSON.stringify({error:"The requested course no longer exists"}),{status:409,headers:{"Content-Type":"application/json"}}));
    const courseId=requested ?? scope.getStore() ?? (request?listCourses()[0].id:scopedCourseId());
    return withCourse(courseId,()=>handler(...args));
    });
  };
}
