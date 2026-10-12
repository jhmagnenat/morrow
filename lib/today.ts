import { getReviewSettings } from "@/lib/qualityDb";
import { getDueLinks, getDuePronunciationCards, getDueVocabularyCards, type DueLink, type PronunciationCard, type VocabularyCard } from "@/lib/db";
import { getDueDrillCards } from "@/lib/drill";
import type { DrillCard, Notion } from "@/lib/types";

export type TodayCard =
  | { cardId?: string; question?: string; kind: "notion"; isNew: boolean; notion: Notion; card: DrillCard }
  | { cardId?: string; question?: string; kind: "link"; isNew: boolean; link: DueLink["link"]; source: Notion; target: Notion }
  | { kind: "pronunciation"; isNew: boolean; card: PronunciationCard }
  | { kind: "vocabulary"; isNew: boolean; card: VocabularyCard };

// Round-robin merge (not a shuffle) — alternating card type on every step is
// the actual "interleaving" studied in the spacing-effect literature, which
// a random shuffle only approximates by luck. Each input array is assumed
// already in due-urgency order; that order is preserved within each type.
export function interleaveTodayQueue(
  notionCards: Array<{ cardId?: string; question?: string; notion: Notion; isNew: boolean; card: DrillCard }>,
  linkCards: DueLink[],
  pronunciationCards: Array<{ card: PronunciationCard; isNew: boolean }>,
  vocabularyCards: Array<{ card: VocabularyCard; isNew: boolean }>
): TodayCard[] {
  const queues: TodayCard[][] = [
    notionCards.map((c) => ({ ...c, kind: "notion", isNew: c.isNew, notion: c.notion, card: c.card })),
    linkCards.map((c) => ({ ...c, kind: "link", isNew: c.isNew, link: c.link, source: c.source, target: c.target })),
    pronunciationCards.map((c) => ({ kind: "pronunciation", isNew: c.isNew, card: c.card })),
    vocabularyCards.map((c) => ({ kind: "vocabulary", isNew: c.isNew, card: c.card })),
  ];

  const result: TodayCard[] = [];
  const indices = [0, 0, 0, 0];
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (let q = 0; q < queues.length; q++) {
      if (indices[q] < queues[q].length) {
        result.push(queues[q][indices[q]]);
        indices[q]++;
        anyLeft = true;
      }
    }
  }
  return result;
}

export async function getTodayQueue(limitPerType = getReviewSettings().sessionLimit): Promise<TodayCard[]> {
  const [notionCards, linkCards, pronunciationCards, vocabularyCards] = await Promise.all([
    getDueDrillCards(limitPerType),
    Promise.resolve(getDueLinks(limitPerType)),
    Promise.resolve(getDuePronunciationCards(limitPerType)),
    Promise.resolve(getDueVocabularyCards(limitPerType)),
  ]);
  const interleaved=interleaveTodayQueue(notionCards, linkCards, pronunciationCards, vocabularyCards);
  return [...interleaved.filter(c=>!c.isNew),...interleaved.filter(c=>c.isNew)].slice(0,getReviewSettings().sessionLimit);
}
