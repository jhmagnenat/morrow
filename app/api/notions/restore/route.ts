import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { insertLink, insertNotion } from "@/lib/db";
import type { Link, Notion } from "@/lib/types";

// Undo for a notion deletion: re-inserts the notion with its original id and
// every link that was touching it, exactly as the client captured them right
// before calling DELETE. Not a general-purpose restore — just enough for the
// one-step "Undo" toast after deleting from the graph.
async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { notion?: Notion; links?: Link[] };
  if (!body.notion) {
    return NextResponse.json({ error: "notion is required" }, { status: 400 });
  }

  const notion = insertNotion(body.notion);
  const links: Link[] = [];
  for (const l of body.links ?? []) {
    links.push(insertLink(l));
  }

  return NextResponse.json({ notion, links });
}

export const POST = courseRoute(handlePOST);
