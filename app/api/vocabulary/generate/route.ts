import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { insertVocabularyCard } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";

interface TranslateResult {
  translationFr: string;
  example: string;
  note: string;
}

async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; context?: string };
  const phrase = (body.text ?? "").trim();

  if (phrase.length < 1 || phrase.length > 300) {
    return NextResponse.json(
      { error: "Select a shorter phrase (a word or a short expression, not a whole paragraph)." },
      { status: 400 }
    );
  }

  const system =
    "You are a bilingual English-French tutor. Given an English word or expression a French-speaking learner " +
    "just selected because they didn't know it (or liked it), give: the single best natural French translation " +
    "(not a literal word-for-word one if the expression is idiomatic — translate the MEANING); a short new " +
    "example sentence in English using the expression naturally; and, only if genuinely useful, a one-line note " +
    "on register or usage (e.g. \"informal\", \"used mainly in writing\") — leave the note empty otherwise.";

  const userPrompt =
    `Expression: "${phrase}"` + (body.context ? `\nFound in context: "${body.context}"` : "");

  let result: TranslateResult;
  try {
    result = await structuredCompletion<TranslateResult>(
      system,
      userPrompt,
      "translate_expression",
      "Translate an English expression to French with a usage example.",
      {
        type: "object",
        properties: {
          translationFr: { type: "string", description: "The natural French translation" },
          example: { type: "string", description: "A short new English example sentence using the expression" },
          note: { type: "string", description: "A one-line usage/register note, or empty if not needed" },
        },
        required: ["translationFr", "example", "note"],
      }
    );
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const card = insertVocabularyCard({
    phrase,
    translationFr: result.translationFr,
    example: result.example,
    note: result.note || undefined,
    context: body.context,
  });

  return NextResponse.json({ card });
}

export const POST = courseRoute(handlePOST);
