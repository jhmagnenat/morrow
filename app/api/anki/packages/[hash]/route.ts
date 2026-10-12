import {courseRoute} from '@/lib/courseScope';
import {openDb} from '@/lib/db';
export const GET=courseRoute(async(_request:Request,{params}:{params:Promise<{hash:string}>})=>{
  const {hash}=await params;if(!/^[a-f0-9]{64}$/.test(hash))return Response.json({error:'Invalid package identifier'},{status:400});
  const row=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`anki-package:${hash}`);
  if(!row)return Response.json({error:'Package not found in this course'},{status:404});
  const value=JSON.parse(String(row.value));return new Response(new Uint8Array(Buffer.from(value.base64,'base64')),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="original-anki.apkg"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});
