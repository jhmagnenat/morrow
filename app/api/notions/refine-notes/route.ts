import { NextResponse } from "next/server";
import { courseRoute } from "@/lib/courseScope";
import { refineCourseNotes } from "@/lib/refineCourseNotes";
async function POSTHandler(request:Request){
  const body=await request.json().catch(()=>null);
  if(!Array.isArray(body?.ids) || body.ids.length<1 || body.ids.length>4 || body.ids.some((id:unknown)=>typeof id!=="string") || new Set(body.ids).size!==body.ids.length)return NextResponse.json({error:"Select one to four distinct notion IDs"},{status:400});
  try{return NextResponse.json(await refineCourseNotes(body.ids));}
  catch(error){return NextResponse.json({error:error instanceof Error ? error.message : "Notes refinement failed"},{status:500});}
}
export const POST=courseRoute(POSTHandler);
