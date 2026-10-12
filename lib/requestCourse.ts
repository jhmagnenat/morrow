import {cookies,headers} from 'next/headers';
import {listCourses} from '@/lib/courses';
import {withCourse} from '@/lib/courseScope';
import {authEnabled,requestUser} from '@/lib/auth';
import {withUser} from '@/lib/identityScope';
import {redirect} from 'next/navigation';

// Course selection belongs to the browser, not the server process. Two
// devices selecting different courses must never redirect each other's work.
export async function withRequestCourse<T>(render:()=>T){
  const incoming=await headers(),user=authEnabled()?requestUser(new Request('http://localhost',{headers:incoming})):undefined;
  if(authEnabled()&&!user)redirect('/login');
  const selected=incoming.get('X-Course-Id')??(await cookies()).get('morrow-course')?.value;
  return withUser(user,()=>{
  const courses=listCourses(),id=courses.find(c=>c.id===selected)?.id??courses[0].id;
  return withCourse(id,render);
  });
}
