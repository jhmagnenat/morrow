import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getRecentExplainAttemptsWithCorrections } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";

const MIN_ATTEMPTS = 3;

interface PatternsResult {
  patterns: Array<{
    name: string;
    example: string;
    betterVersion: string;
    why: string;
  }>;
}

async function handleGET() {
  const attempts = getRecentExplainAttemptsWithCorrections(30);
  if (attempts.length < MIN_ATTEMPTS) {
    return NextResponse.json(
      { error: `Write a few more explanations first (${attempts.length}/${MIN_ATTEMPTS} with a correction so far).` },
      { status: 422 }
    );
  }

  const samples = attempts
    .map((a, i) => `${i + 1}. You wrote: "${a.answerText}"\n   Natural rewrite: "${a.correctedText}"`)
    .join("\n\n");

  const system =
    "You are a writing coach analyzing a student's own past sentences against their natural-English rewrites, " +
    "looking for RECURRING personal habits in how they express themselves — not one-off mistakes, not content/factual " +
    "errors, purely style and phrasing patterns that show up more than once across these samples. " +
    "Typical things to look for: habitual hedging or filler phrases (\"I think that...\", \"basically\", \"kind of\"), " +
    "overly complex or roundabout phrasing where a direct sentence would work, passive voice where active voice reads " +
    "more naturally, a repeated crutch word or sentence opener, unnecessary qualifiers. " +
    "Only report a pattern if it genuinely recurs across multiple samples — if nothing recurs, return fewer patterns " +
    "rather than inventing one. For the suggested replacement, always prefer pragmatic, direct, simple language over " +
    "anything more elaborate — the goal is for the student to sound clearer and more direct, not more sophisticated.";

  const userPrompt = `The student's own sentences, paired with their natural rewrite:\n\n${samples}\n\nIdentify recurring personal patterns.`;

  let result: PatternsResult;
  try {
    result = await structuredCompletion<PatternsResult>(
      system,
      userPrompt,
      "report_writing_patterns",
      "Identify recurring personal phrasing patterns and suggest more pragmatic, direct replacements.",
      {
        type: "object",
        properties: {
          patterns: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short name for the pattern, e.g. \"Hedging with 'I think that'\"" },
                example: { type: "string", description: "A real quote from the student's own samples showing this pattern" },
                betterVersion: { type: "string", description: "The same idea rephrased in pragmatic, direct, simple language" },
                why: { type: "string", description: "One short sentence on why the direct version communicates better" },
              },
              required: ["name", "example", "betterVersion", "why"],
            },
          },
        },
        required: ["patterns"],
      }
    );
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  return NextResponse.json({ patterns: result.patterns, sampleCount: attempts.length });
}

export const GET = courseRoute(handleGET);
