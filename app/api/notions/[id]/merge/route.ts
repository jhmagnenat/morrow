import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { deleteLink, getGraph, getNotionById, mergeNotions } from "@/lib/db";
import { detectAndBreakCycles } from "@/lib/graphHealth";

// Merges the notion at [id] INTO body.intoId: [id] is deleted, its sources
// and links are reattached to intoId.
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { intoId?: string };

  if (!body.intoId) {
    return NextResponse.json({ error: "intoId is required" }, { status: 400 });
  }
  if (body.intoId === id) {
    return NextResponse.json({ error: "Cannot merge a notion into itself" }, { status: 400 });
  }
  if (!getNotionById(id) || !getNotionById(body.intoId)) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }

  mergeNotions(id, body.intoId);

  // Reattaching the merged notion's own links onto intoId can close a loop
  // that didn't exist before (e.g. intoId was already an ancestor of one of
  // the merged notion's children) — same deterministic check generation
  // runs automatically, applied here too since a merge bypasses it.
  const { links } = getGraph();
  const { removed } = detectAndBreakCycles(links);
  for (const link of removed) deleteLink(link.id);

  return NextResponse.json({ ok: true, keptId: body.intoId, cyclesBroken: removed.length });
}

export const POST = courseRoute(handlePOST);
