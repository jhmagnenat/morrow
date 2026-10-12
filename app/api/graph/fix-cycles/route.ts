import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { deleteLink, getGraph } from "@/lib/db";
import { detectAndBreakCycles } from "@/lib/graphHealth";

// Standalone trigger for the same cycle-break generation runs
// automatically — a manual merge (or any other direct edit) can introduce
// a cycle too, without going through generation at all.
async function handlePOST() {
  const { links } = getGraph(true);
  const { removed } = detectAndBreakCycles(links);
  for (const link of removed) {
    deleteLink(link.id);
  }
  return NextResponse.json({ cyclesBroken: removed.length });
}

export const POST = courseRoute(handlePOST);
