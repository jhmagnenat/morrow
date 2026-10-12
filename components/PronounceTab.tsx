"use client";
import { useReview } from "@/lib/useReview";
import ReviewIntervals from "@/components/ReviewIntervals";

import { useEffect, useState } from "react";
import { useStudyQueue, useStudyState } from "@/lib/useStudySession";
import type { PronunciationCard, PronunciationWord } from "@/lib/db";
import type { Grade } from "@/lib/srs";
import { PRONUNCIATION_RULES } from "@/lib/pronunciation";
import { notifyXpUpdated } from "@/lib/xpEvent";
import { useCardShortcuts } from "@/lib/useCardShortcuts";

interface DuePronunciationCard {
  card: PronunciationCard;
  isNew: boolean;
}

interface PronounceTabProps {
  initialCards: DuePronunciationCard[];
  pendingCard: PronunciationCard | null;
  llmConfigured: boolean;
}

const GRADE_OPTIONS: Array<{ grade: Grade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "Again", hint: "couldn't say it right", className: "bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30" },
  { grade: "hard", label: "Hard", hint: "struggled", className: "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30" },
  { grade: "good", label: "Good", hint: "got it", className: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30" },
  { grade: "easy", label: "Easy", hint: "trivial", className: "bg-accent-500/20 border-accent-500/40 text-accent-200 hover:bg-accent-500/30" },
];

export function stressClassName(stress: "primary" | "secondary" | "none") {
  if (stress === "primary") return "font-semibold text-accent-200 underline underline-offset-4";
  if (stress === "secondary") return "text-[#D4C6A6]";
  return "text-[#696A61]";
}

// Groups adjacent words that blend together in connected speech (liaison)
// so the UI can draw one visual link across the pair instead of treating
// them as two independent words.
export function groupLinkedWords(words: PronunciationWord[]): Array<PronunciationWord[]> {
  const groups: Array<PronunciationWord[]> = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w.linksToNext && w.blendWithNext && words[i + 1]) {
      groups.push([w, words[i + 1]]);
      i += 2;
    } else {
      groups.push([w]);
      i += 1;
    }
  }
  return groups;
}

export function WordCell({ word }: { word: PronunciationWord }) {
  return (
    <span className="inline-block align-top">
      <span className={stressClassName(word.sentenceStress)}>{word.word}</span>
      <br />
      <span className="text-xs text-[#696A61]">{word.syllables}</span>
      <br />
      <span className="text-[11px] text-[#696A61]">{word.ipa}</span>
      {word.note && <span className="block max-w-[8rem] text-[10px] text-amber-400/80">{word.note}</span>}
    </span>
  );
}

// Renders two liaising words joined by a curved "wave" (the visual analogue
// of the IPA tie bar ‿), with the blended colloquial form captioned below —
// e.g. "let" + "me" drawn with an arc under them and "≈ lemme" underneath.
export function LinkedPair({ words }: { words: [PronunciationWord, PronunciationWord] }) {
  const [a, b] = words;
  return (
    <span className="inline-flex flex-col items-center">
      <span className="flex gap-3">
        <WordCell word={a} />
        <WordCell word={b} />
      </span>
      <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="mt-0.5 h-3 w-16 text-accent-400">
        <path d="M4,2 Q50,16 96,2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] italic text-accent-300">≈ &ldquo;{a.blendWithNext}&rdquo;</span>
    </span>
  );
}

function RulesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5 shrink-0">
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-[#696A61] hover:text-[#8F8978]">
        {open ? "▾" : "▸"} Pronunciation rules
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-md border border-[#423e42] bg-[#201f21] p-3">
          {PRONUNCIATION_RULES.map((rule) => (
            <div key={rule.title}>
              <p className="text-sm font-medium text-[#D4C6A6]">{rule.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#696A61]">{rule.body}</p>
              <ul className="mt-1 space-y-0.5">
                {rule.examples.map((ex) => (
                  <li key={ex} className="text-xs text-[#8F8978]">
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const restorePendingId = (value: unknown) => typeof value === "string" || value === null ? value : null;

export default function PronounceTab({ initialCards, pendingCard, llmConfigured }: PronounceTabProps) {
  const { cards, setCards, index, setIndex, revealed, setRevealed, sessionDone, setSessionDone, reviewedCount, setReviewedCount } = useStudyQueue("pronounce", initialCards);
  const saveReview=useReview("pronounce");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [freeText, setFreeText] = useStudyState("pronounce-text", "");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastPendingId, setLastPendingId] = useStudyState<string | null>("pronounce-last-pending", null, restorePendingId);

  // Consume the handoff once, without interrupting the existing queue.
  useEffect(() => {
    if (!pendingCard || pendingCard.id === lastPendingId) return;
    setLastPendingId(pendingCard.id);
    setCards((prev) => [{ card: pendingCard, isNew: true }, ...prev.slice(index).filter((entry) => entry.card.id !== pendingCard.id)]);
    setIndex(0);
    setRevealed(false);
    setSessionDone(false);
  }, [pendingCard, lastPendingId, index, setLastPendingId, setCards, setIndex, setRevealed, setSessionDone]);

  const current = cards[index];

  const grade = async (g: Grade) => {
    if (!current || grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await saveReview("pronunciation", current.card.id, g);
      if (!res.ok) throw new Error("Your review could not be saved. Please try again.");
      notifyXpUpdated();
      setReviewedCount((n) => n + 1);
      if (index + 1 >= cards.length) {
        setSessionDone(true);
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
      }
    } catch (error) {
      setGradeError(error instanceof Error ? error.message : "Your review could not be saved. Please try again.");
    } finally {
      setGrading(false);
    }
  };

  const restart = async () => {
    const res = await fetch("/api/pronunciation/queue");
    if (res.ok) {
      const data = await res.json();
      setCards(data.cards);
      setIndex(0);
      setRevealed(false);
      setReviewedCount(0);
      setSessionDone(data.cards.length === 0);
    }
  };

  useCardShortcuts({
    revealed,
    onReveal: () => setRevealed(true),
    onGrade: grade,
    disabled: grading || sessionDone || !current,
  });

  const generateFromText = async () => {
    if (freeText.trim().length < 3 || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/pronunciation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: freeText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "Could not generate a card.");
        return;
      }
      setCards((prev) => [{ card: data.card, isNew: true }, ...prev]);
      setIndex(0);
      setRevealed(false);
      setSessionDone(false);
      setFreeText("");
    } finally {
      setGenerating(false);
    }
  };

  const generatorBlock = (
    <div className="mb-5 shrink-0 rounded-md border border-[#423e42] bg-[#201f21] p-3">
      <p className="mb-2 text-xs text-[#696A61]">Or paste any English text to practice its pronunciation:</p>
      <textarea
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        rows={2}
        placeholder="A sentence or short paragraph…"
        className="w-full resize-none rounded-md border border-[#423e42] bg-[#28262a] p-2 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
      />
      <button
        onClick={generateFromText}
        disabled={!llmConfigured || generating || freeText.trim().length < 3}
        title={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
        className="mt-2 rounded-md border border-[#423e42] bg-[#322f33] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#1d2829] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating ? "Generating…" : "Generate pronunciation card"}
      </button>
      {generateError && <p className="mt-2 text-xs text-red-400">{generateError}</p>}
    </div>
  );

  if (sessionDone) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-10">
        <RulesPanel />
        {generatorBlock}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg text-[#D4C6A6]">
            {reviewedCount > 0
              ? `Session done — ${reviewedCount} card${reviewedCount > 1 ? "s" : ""} practiced.`
              : "No pronunciation cards due. Generate one from an Explain attempt, or paste text above."}
          </p>
          <button
            onClick={restart}
            className="rounded-md border border-[#423e42] bg-[#28262a] px-4 py-2 text-sm text-[#D4C6A6] hover:bg-[#322f33]"
          >
            Check again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-8 overflow-y-auto">
      {gradeError && <p role="alert" className="mb-3 text-sm text-red-400">{gradeError}</p>}
      {revealed && <ReviewIntervals type="pronunciation" id={current.card.id}/>}
      <RulesPanel />
      {generatorBlock}

      <div className="mb-3 flex shrink-0 items-center justify-between text-xs text-[#696A61]">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        {current.isNew && <span className="text-accent-400">new</span>}
      </div>

      <div className="mb-6 rounded-lg border border-[#423e42] bg-[#201f21] p-6">
        {!revealed ? (
          <p className="text-base leading-relaxed text-[#8F8978]">{current.card.text}</p>
        ) : (
          <>
            {current.card.fullIpa && (
              <p className="mb-4 border-b border-[#423e42] pb-3 text-center text-sm text-accent-200">
                {current.card.fullIpa}
              </p>
            )}
            <p className="flex flex-wrap items-start gap-x-3 gap-y-4 text-base leading-relaxed">
              {groupLinkedWords(current.card.words).map((group, i) =>
                group.length === 2 ? (
                  <LinkedPair key={i} words={group as [PronunciationWord, PronunciationWord]} />
                ) : (
                  <WordCell key={i} word={group[0]} />
                )
              )}
            </p>
          </>
        )}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2.5 text-sm text-[#D4C6A6] hover:bg-[#1d2829]"
        >
          Reveal pronunciation <span className="text-[#696A61]">(space)</span>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {GRADE_OPTIONS.map((opt, idx) => (
            <button
              key={opt.grade}
              onClick={() => grade(opt.grade)}
              disabled={grading}
              title={opt.hint}
              className={`rounded-md border px-3 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${opt.className}`}
            >
              {opt.label} <span className="opacity-60">{idx + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
