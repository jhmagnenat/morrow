import type { Link, Notion } from "@/lib/types";

export type ExplainLevel = "child" | "nonexpert" | "expert";

export const EXPLAIN_LEVELS: ExplainLevel[] = ["child", "nonexpert", "expert"];

export const EXPLAIN_LEVEL_LABELS: Record<ExplainLevel, string> = {
  child: "Explain to a child",
  nonexpert: "Explain to a non-expert colleague",
  expert: "Explain to an expert",
};

export const EXPLAIN_LEVEL_PROMPTS: Record<ExplainLevel, string> = {
  child:
    "Explain this notion in plain language a curious 10-year-old could follow. No jargon, no formulas — use an everyday analogy if it helps.",
  nonexpert:
    "Explain this notion to a competent colleague from a different field who has no background in this subject. Light jargon is fine if you define it; focus on why it matters and how it works.",
  expert:
    "Explain this notion to a fellow practitioner in this field. Use precise technical vocabulary, be specific about mechanics and details, and make sure you correctly use every required keyword below in a way that shows you understand it, not just that you can spell it.",
};

// Labels of every notion directly connected to `notion` in the graph —
// shared by the Explain keyword lists and the Drill cloze-blank priority
// list, so both reuse the same real graph structure rather than each
// re-deriving it.
export function getNeighborLabels(notion: Notion, allNotions: Notion[], allLinks: Link[]): string[] {
  const neighborIds = allLinks
    .filter((l) => l.source === notion.id || l.target === notion.id)
    .map((l) => (l.source === notion.id ? l.target : l.source));
  return [...new Set(neighborIds)]
    .map((id) => allNotions.find((n) => n.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}

// Required-keyword lists are derived from the graph itself (the notion's own
// label plus its directly linked notions), not invented or LLM-generated —
// instant, free, and it reinforces the graph structure as part of studying.
export function getRequiredKeywords(
  level: ExplainLevel,
  notion: Notion,
  allNotions: Notion[],
  allLinks: Link[]
): string[] {
  if (level === "child") return [];

  const neighborLabels = getNeighborLabels(notion, allNotions, allLinks);

  if (level === "nonexpert") {
    return [notion.label, ...neighborLabels.slice(0, 2)];
  }

  // expert: the notion itself plus every directly connected notion
  return [notion.label, ...neighborLabels];
}
