import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph, getPassagesForDocument } from "@/lib/db";
import { computePageCoverage, detectAndBreakCycles, findDuplicateGroups, findOrphans } from "@/lib/graphHealth";

// Read-only diagnostic — generation already auto-fixes cycles as they're
// created, but this lets the current state be checked anytime (e.g. after
// a manual edit, an import, or just to verify nothing regressed).
async function handleGET() {
  const { notions, links, documents } = getGraph(true);
  const { removed: cycleLinks } = detectAndBreakCycles(links);
  const orphans = findOrphans(notions, links);
  const duplicateGroups = findDuplicateGroups(notions);
  const allPassages = documents.flatMap((d) => getPassagesForDocument(d.id));
  const coverage = computePageCoverage(allPassages, notions);

  return NextResponse.json({
    cycleLinkCount: cycleLinks.length,
    orphanCount: orphans.length,
    orphanLabels: orphans.map((n) => n.label),
    duplicateGroupCount: duplicateGroups.length,
    coverage,
  });
}

export const GET = courseRoute(handleGET);
