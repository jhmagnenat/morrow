import { updateNotionWorkQuestions } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";
import type { Notion, WorkQuestion } from "@/lib/types";

interface AnswersResult {
  answers: string[];
}

// Backfills short answers for notions created before each workQuestion
// carried its own answer (just bare question strings back then). Persisted
// afterward so this only ever runs once per notion, same pattern as
// lib/drill.ts's getOrGenerateDrillCard.
async function generateAnswers(notion: Notion, questions: string[]): Promise<string[]> {
  const system =
    "Write a short, direct answer to each of these on-the-job questions about the given concept — a few " +
    "sentences at most, the way a knowledgeable colleague would actually answer out loud, not a textbook essay. " +
    "Ground answers in the notion's own explanation where it's relevant.";
  const userPrompt =
    `Concept: "${notion.label}" (category: ${notion.domain})\n` +
    `Definition: ${notion.definition}\n` +
    (notion.explanation ? `Explanation: ${notion.explanation}\n\n` : "\n") +
    `Questions (answer each one, in the same order):\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;

  const result = await structuredCompletion<AnswersResult>(
    system,
    userPrompt,
    "answer_work_questions",
    "Answer each on-the-job question briefly and directly.",
    {
      type: "object",
      properties: {
        answers: {
          type: "array",
          minItems: questions.length,
          maxItems: questions.length,
          items: { type: "string" },
          description: "One short answer per question, same order, a few sentences each",
        },
      },
      required: ["answers"],
    }
  );
  return result.answers;
}

export async function getOrGenerateWorkQuestions(notion: Notion): Promise<WorkQuestion[]> {
  const existing = notion.workQuestions ?? [];
  const missing = existing.filter((wq) => !wq.answer.trim());
  if (missing.length === 0) return existing;

  try {
    const answers = await generateAnswers(
      notion,
      missing.map((wq) => wq.question)
    );
    let i = 0;
    const filled = existing.map((wq) => (wq.answer.trim() ? wq : { question: wq.question, answer: answers[i++] ?? "" }));
    updateNotionWorkQuestions(notion.id, filled);
    return filled;
  } catch (error) {
    // No LLM configured, or the call failed — show the questions without
    // answers rather than breaking the panel.
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return existing;
    }
    throw error;
  }
}
