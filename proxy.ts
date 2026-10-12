import {NextResponse,type NextRequest} from 'next/server';
import {authEnabled,requestUser} from '@/lib/auth';
export function proxy(request:NextRequest){
  if(!authEnabled()||requestUser(request))return NextResponse.next();
  if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:'Sign in to continue'},{status:401});
  return NextResponse.redirect(new URL('/login',request.url));
}
export const config={matcher:['/((?!login|api/auth|_next/static|_next/image|fonts/|icons/|manifest.webmanifest|favicon.ico|study-worker.js).*)']};
