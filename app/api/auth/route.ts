import {NextResponse} from 'next/server';
import {authEnabled,login,logout,requestUser} from '@/lib/auth';
import {withUser} from '@/lib/identityScope';
import {listCourses} from '@/lib/courses';
export async function GET(request:Request){
  const user=authEnabled()?requestUser(request):undefined;
  return NextResponse.json({enabled:authEnabled(),user:user?{name:user.name}:null},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const origin=request.headers.get('Origin');
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||origin&&origin!==(process.env.MORROW_PUBLIC_ORIGIN??new URL(request.url).origin))return NextResponse.json({error:'Cross-origin sign-in is not allowed'},{status:403});
  if(!authEnabled())return NextResponse.json({error:'Account mode is not enabled'},{status:400});
  const body=await request.json().catch(()=>null);
  if(body?.action==='logout'){
    const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('morrow-session='))?.slice(15);
    if(token)logout(token);
    const response=NextResponse.json({ok:true});
    response.cookies.set('morrow-session','',{maxAge:0,path:'/'});response.cookies.set('morrow-course','',{maxAge:0,path:'/'});
    response.headers.set('Clear-Site-Data','"cache", "storage"');return response;
  }
  try{
    const {token,user}=await login(body?.name,body?.password);
    const course=withUser(user,()=>listCourses()[0]);
    const response=NextResponse.json({ok:true});
    const secure=(process.env.MORROW_PUBLIC_ORIGIN??request.url).startsWith('https:');
    response.cookies.set('morrow-session',token,{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:30*86400});
    response.cookies.set('morrow-course',course.id,{httpOnly:true,sameSite:'lax',secure,path:'/',maxAge:365*86400});
    response.headers.set('Cache-Control','no-store');return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sign-in failed'},{status:401});}
}
