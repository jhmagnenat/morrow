export interface StudyStore<T> {
  getSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  set: (update: T | ((previous: T) => T)) => void;
}

// A synchronous write means navigation immediately after an action cannot
// leave the saved session one card behind. Storage failure keeps in-memory state.
export function createStudyStore<T>(
  key: string,
  initial: T,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  restore: (value: unknown) => T | null,
): StudyStore<T> {
  let state = initial;
  try {
    const saved = storage?.getItem(key);
    if (saved) state = restore(JSON.parse(saved)) ?? initial;
  } catch {
    // Invalid/blocked browser storage should never block a study session.
  }
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(update) {
      const next = typeof update === "function" ? (update as (previous: T) => T)(state) : update;
      const unchanged=Object.is(next,state);
      state = next;
      try { storage?.setItem(key, JSON.stringify(state)); } catch { /* Keep studying in memory. */ }
      if(unchanged)return;
      for (const listener of listeners) listener();
    },
  };
}

export interface StudyQueue<T> {
  cards: T[];
  index: number;
  revealed: boolean;
  sessionDone: boolean;
  reviewedCount: number;
}

export function studyCardKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const kind = card.kind ?? (card.notion ? "notion" : card.link ? "link" : null);
  const entity = card.notion ?? card.link ?? card.card;
  if (!entity || typeof entity !== "object" || !("id" in entity) || typeof entity.id !== "string") return null;
  if (kind) return `${kind}:${typeof card.cardId === "string" ? card.cardId : entity.id}`;
  if ("phrase" in entity) return `vocabulary:${entity.id}`;
  if ("words" in entity) return `pronunciation:${entity.id}`;
  return null;
}

export function restoreStudyQueue<T>(value: unknown, validCardKeys: Set<string>): StudyQueue<T> | null {
  if (!value || typeof value !== "object") return null;
  const queue = value as StudyQueue<T>;
  if (!Array.isArray(queue.cards) || !Number.isInteger(queue.index) || queue.index < 0 || queue.index > queue.cards.length ||
      !Number.isInteger(queue.reviewedCount) || queue.reviewedCount < 0 ||
      typeof queue.revealed !== "boolean" || typeof queue.sessionDone !== "boolean") return null;
  const valid = (card: T) => {
    const key = studyCardKey(card);
    return key !== null && validCardKeys.has(key);
  };
  const cards = queue.cards.filter(valid);
  if (queue.cards.length > 0 && cards.length === 0) return null;
  const index = queue.cards.slice(0, queue.index).filter(valid).length;
  const currentSurvived = queue.index < queue.cards.length && valid(queue.cards[queue.index]);
  return { ...queue, cards, index, revealed: currentSurvived && queue.revealed,
    sessionDone: queue.sessionDone || index >= cards.length };
}
