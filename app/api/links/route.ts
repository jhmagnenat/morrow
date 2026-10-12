import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { insertLink } from "@/lib/db";
import type { LinkType } from "@/lib/types";

// Creates a link directly — no UI for this yet; used for one-off manual
// hierarchy corrections (e.g. nesting a notion under the broader one it's
// actually a component of, when generation left it as a flat root instead).
async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: string;
    target?: string;
    type?: LinkType;
    description?: string;
  };
  if (!body.source || !body.target || !body.type) {
    return NextResponse.json({ error: "source, target, and type are required" }, { status: 400 });
  }
  const link = insertLink({
    source: body.source,
    target: body.target,
    type: body.type,
    description: body.description ?? "",
  });
  return NextResponse.json({ link });
}

export const POST = courseRoute(handlePOST);
