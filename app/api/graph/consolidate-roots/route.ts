import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph } from "@/lib/db";
import { consolidateRoots } from "@/lib/consolidateRoots";
import { LlmNotConfiguredError, LlmProviderError } from "@/lib/llm";

// Reorganize existing concepts by meaning without regenerating source notes.
async function handlePOST() {
  const { notions, links } = getGraph(true);
  try {
    const { links: newLinks } = await consolidateRoots(notions, links);
    return NextResponse.json({ rootsConsolidated: newLinks.length });
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}

export const POST = courseRoute(handlePOST);
