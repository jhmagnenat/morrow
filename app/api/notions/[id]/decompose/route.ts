import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph, getNotionById } from "@/lib/db";
import { decomposeNotion, NoSourceTextError } from "@/lib/decompose";
import { LlmNotConfiguredError, LlmProviderError } from "@/lib/llm";
import type { GenerationMode } from "@/lib/types";

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { mode?: GenerationMode };
  const mode: GenerationMode = body.mode === "open" ? "open" : "strict";

  const notion = getNotionById(id);
  if (!notion) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }

  try {
    const existingLabels = getGraph(true).notions.map((n) => n.label);
    const { notions, links } = await decomposeNotion(notion, mode, existingLabels);
    return NextResponse.json({ notions, links });
  } catch (error) {
    if (error instanceof NoSourceTextError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}

export const POST = courseRoute(handlePOST);
