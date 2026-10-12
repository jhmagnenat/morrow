import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph } from "@/lib/db";
import { pageAnalyses, retryPages } from "@/lib/qualityDb";
async function handleGET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;return NextResponse.json({pages:pageAnalyses(id)});
}
async function handlePOST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params, body=await request.json().catch(()=>({})), doc=getGraph().documents.find(d=>d.id===id);
  if (!doc) return NextResponse.json({error:"Document not found"},{status:404});
  if (!Array.isArray(body.pages) || !body.pages.length || body.pages.some((p:unknown)=>!Number.isInteger(p) || Number(p)<1 || Number(p)>(doc.pageCount ?? 0))) return NextResponse.json({error:"Invalid page numbers"},{status:400});
  retryPages(id,body.pages);return NextResponse.json({ok:true});
}

export const GET = courseRoute(handleGET);
export const POST = courseRoute(handlePOST);
