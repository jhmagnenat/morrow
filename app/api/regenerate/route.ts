import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { resetGraphForRegeneration } from "@/lib/db";

// Keeps documents/PDFs/passages, wipes notions+links, and flips every
// passage back to ungenerated so "Generate notions" reprocesses the same
// source text under the current prompt. Unlike /api/reset, this is NOT a
// full wipe — the point is to throw away stale LLM output, not the
// already-extracted source material.
async function handlePOST() {
  resetGraphForRegeneration();
  return NextResponse.json({ ok: true });
}

export const POST = courseRoute(handlePOST);
