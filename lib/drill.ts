import { getDueNotions, updateNotionDrillCard } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";
import type { DrillCard, Notion } from "@/lib/types";

// Generates (and persists) the one-time Drill flashcard for a notion that
// doesn't have one yet — older notions created before drillCard existed, or
// ones that slipped through generation. Cached on the notion afterward, so
// this only ever runs once per notion, keeping review sessions instant.
async function generateDrillCard(notion: Notion): Promise<DrillCard> {
  const system =
    "Write a single flashcard for spaced-repetition review, in topic-breakdown glossary style, e.g. " +
    "\"Peril → cause of loss (e.g., fire, theft)\". The definition must be SHORT, GENERAL, and in your own " +
    "words — not copied verbatim from the notion's longer explanation, and not phrased so it only makes sense " +
    "next to one specific example. The example must be brief and illustrative, not a specific number a learner " +
    "would have to memorize by rote with no way to reason their way to it.";
  const userPrompt =
    `Term: "${notion.label}" (category: ${notion.domain})\n` +
    `Definition: ${notion.definition}\n` +
    (notion.explanation ? `Explanation: ${notion.explanation}` : "");

  const card = await structuredCompletion<DrillCard>(
    system,
    userPrompt,
    "drill_card",
    "Write a short, general flashcard definition and a brief illustrative example.",
    {
      type: "object",
      properties: {
        definition: {
          type: "string",
          description: "One short, general sentence in topic-breakdown style, your own words",
        },
        example: { type: "string", description: "One brief, concrete, generically illustrative example" },
      },
      required: ["definition", "example"],
    }
  );
  updateNotionDrillCard(notion.id, card);
  return card;
}

export async function getOrGenerateDrillCard(notion: Notion): Promise<DrillCard> {
  if (notion.drillCard) return notion.drillCard;
  try {
    return await generateDrillCard(notion);
  } catch (error) {
    // No LLM configured, or the call failed — fall back to the notion's own
    // existing one-line definition rather than breaking the review queue.
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return { definition: notion.definition, example: "" };
    }
    throw error;
  }
}

export async function getDueDrillCards(limit: number,mode:'qa'|'notions'='qa') {
  return getDueNotions(limit,mode).map(entry=>({...entry,card:entry.notion.drillCard ?? {definition:entry.notion.definition,example:""}}));
}
