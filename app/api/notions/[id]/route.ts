import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { deleteNotion, getNotionById, updateNotionStatus, openDb } from "@/lib/db";
import { setNotionMetadata } from "@/lib/qualityDb";

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = getNotionById(id);
  if (!existing) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }
  deleteNotion(id);
  return NextResponse.json({ ok: true });
}

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { status?: "draft" | "validated";label?:string;definition?:string;explanation?:string };
  if (body.status !== undefined && body.status !== "draft" && body.status !== "validated") {
    return NextResponse.json({ error: "status must be 'draft' or 'validated'" }, { status: 400 });
  }

  const existing = getNotionById(id);
  if (!existing) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }

  for(const field of ["label","definition","explanation"] as const)if(body[field]!==undefined && (typeof body[field]!=="string" || body[field]!.length>20000 || (field!=="explanation" && !body[field]!.trim())))return NextResponse.json({error:`Invalid ${field}`},{status:400});
  if(body.status)updateNotionStatus(id,body.status);
  if(body.label!==undefined || body.definition!==undefined || body.explanation!==undefined){
    openDb().prepare("UPDATE notions SET label=?,definition=?,explanation=?,grounding=NULL WHERE id=?").run(body.label ?? existing.label,body.definition ?? existing.definition,body.explanation ?? existing.explanation ?? null,id);
    setNotionMetadata(id,existing.layer ?? "course",existing.evidence ?? []);
    openDb().prepare("UPDATE notion_metadata SET user_edited=1 WHERE notion_id=?").run(id);
    // A generated structured lesson must not shadow a newer manual correction.
    openDb().prepare('UPDATE notion_metadata SET clair=NULL WHERE notion_id=?').run(id);
  }
  return NextResponse.json(getNotionById(id));
}

export const DELETE = courseRoute(handleDELETE);
export const PATCH = courseRoute(handlePATCH);
