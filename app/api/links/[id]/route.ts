import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { deleteLink, updateLink } from "@/lib/db";
import type { LinkType } from "@/lib/types";

// Edits an existing link — e.g. swapping source/target to fix a hierarchy
// pointing the wrong way, or correcting its type (sub-notion/prerequisite/
// related). No UI for this yet; used directly for one-off corrections.
async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    source?: string;
    target?: string;
    type?: LinkType;
    description?: string;
  };
  const updated = updateLink(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  return NextResponse.json({ link: updated });
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteLink(id);
  return NextResponse.json({ ok: true });
}

export const PATCH = courseRoute(handlePATCH);
export const DELETE = courseRoute(handleDELETE);
