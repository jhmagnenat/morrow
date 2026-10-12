import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph,openDb } from "@/lib/db";
import { exportQuality, getReviewSettings, getStudyCards, pageAnalyses, saveReviewSettings } from "@/lib/qualityDb";
async function handleGET() {
  const graph=getGraph(true), cards=getStudyCards();
  const active=new Set(openDb().prepare("SELECT run_id FROM generation_claims WHERE expires_at>?").all(new Date().toISOString()).map(r=>String(r.run_id)));
  const runs=exportQuality().generation_runs.map(row=>{const payload=JSON.parse(String(row.payload));if(payload.status==="running" && !active.has(String(payload.options?.claimId??row.id)))payload.status="interrupted";return {...row,payload:JSON.stringify(payload)};});
  return NextResponse.json({documents:graph.documents.map(d=>({...d,pages:pageAnalyses(d.id)})),settings:getReviewSettings(),
    summary:{concepts:graph.notions.length,storedConcepts:Number(openDb().prepare('SELECT COUNT(*) AS n FROM notions').get()?.n??0),unsourcedConcepts:graph.notions.filter(n=>!n.sources.length && n.layer!=="organizer").length,ready:cards.filter(c=>c.status==="ready").length,draft:cards.filter(c=>c.status==="draft").length,suspended:cards.filter(c=>c.status==="suspended").length,legacy:cards.filter(c=>c.promptVersion==="legacy").length},runs});
}
async function handlePATCH(request:Request) {
  const body=await request.json().catch(()=>({}));
  if (!Number.isInteger(body.newPerDay) || body.newPerDay<0 || body.newPerDay>200 || !Number.isInteger(body.sessionLimit) || body.sessionLimit<1 || body.sessionLimit>500) return NextResponse.json({error:"New cards/day: 0–200. Session limit: 1–500."},{status:400});
  if(body.retention!==undefined && (!Number.isFinite(body.retention)||body.retention<0.7||body.retention>0.99))return NextResponse.json({error:'Retention: 0.70–0.99.'},{status:400});
  saveReviewSettings({newPerDay:body.newPerDay,sessionLimit:body.sessionLimit,retention:body.retention});return NextResponse.json({ok:true});
}

export const GET = courseRoute(handleGET);
export const PATCH = courseRoute(handlePATCH);
