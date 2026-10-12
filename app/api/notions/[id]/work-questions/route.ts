import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getNotionById } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError } from "@/lib/llm";
import { getOrGenerateWorkQuestions } from "@/lib/workQuestions";

// Backfills short answers for notions created before each workQuestion
// carried one (see lib/workQuestions.ts) — called from the client the first
// time such a notion is viewed, same pattern as the drillCard backfill but
// triggered by viewing rather than reviewing.
async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notion = getNotionById(id);
  if (!notion) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }

  try {
    const workQuestions = await getOrGenerateWorkQuestions(notion);
    return NextResponse.json({ workQuestions });
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}

export const POST = courseRoute(handlePOST);
