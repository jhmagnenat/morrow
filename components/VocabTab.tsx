"use client";

import { useState } from "react";
import { useReview } from "@/lib/useReview";
import ReviewIntervals from "@/components/ReviewIntervals";
import { useStudyQueue } from "@/lib/useStudySession";
import type { VocabularyCard } from "@/lib/db";
import type { Grade } from "@/lib/srs";
import { notifyXpUpdated } from "@/lib/xpEvent";
import { useCardShortcuts } from "@/lib/useCardShortcuts";

interface DueVocabularyCard {
  card: VocabularyCard;
  isNew: boolean;
}

interface VocabTabProps {
  initialCards: DueVocabularyCard[];
}

const GRADE_OPTIONS: Array<{ grade: Grade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "Again", hint: "didn't know it", className: "bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30" },
  { grade: "hard", label: "Hard", hint: "struggled", className: "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30" },
  { grade: "good", label: "Good", hint: "got it", className: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30" },
  { grade: "easy", label: "Easy", hint: "trivial", className: "bg-accent-500/20 border-accent-500/40 text-accent-200 hover:bg-accent-500/30" },
];

export default function VocabTab({ initialCards }: VocabTabProps) {
  const { cards, setCards, index, setIndex, revealed, setRevealed, sessionDone, setSessionDone, reviewedCount, setReviewedCount } = useStudyQueue("vocab", initialCards);
  const saveReview=useReview("vocab");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const current = cards[index];

  const grade = async (g: Grade) => {
    if (!current || grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await saveReview("vocabulary", current.card.id, g);
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
    const res = await fetch("/api/vocabulary/queue");
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

  if (sessionDone) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg text-[#D4C6A6]">
          {reviewedCount > 0
            ? `Session done — ${reviewedCount} expression${reviewedCount > 1 ? "s" : ""} reviewed.`
            : "No vocabulary due. Select any English text in the app and press Alt+2 to add one."}
        </p>
        <p className="max-w-sm text-sm text-[#696A61]">
          Same spaced-repetition schedule as the rest of the app, applied to expressions you capture while
          reading.
        </p>
        <button
          onClick={restart}
          className="rounded-md border border-[#423e42] bg-[#28262a] px-4 py-2 text-sm text-[#D4C6A6] hover:bg-[#322f33]"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      {gradeError && <p role="alert" className="text-sm text-red-400">{gradeError}</p>}
      {revealed && <ReviewIntervals type="vocabulary" id={current.card.id}/>}
      <div className="flex items-center justify-between text-xs text-[#696A61]">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        {current.isNew && <span className="text-accent-400">new</span>}
      </div>

      <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-6">
        <p className="text-lg font-medium text-[#D4C6A6]">{current.card.phrase}</p>

        {revealed ? (
          <div className="mt-4 space-y-2 border-t border-[#423e42] pt-4">
            <p className="text-base text-accent-200">{current.card.translationFr}</p>
            {current.card.example && (
              <p className="text-sm italic text-[#8F8978]">&ldquo;{current.card.example}&rdquo;</p>
            )}
            {current.card.note && <p className="text-xs text-[#696A61]">{current.card.note}</p>}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-white/10 bg-[#201f21] p-3 text-center text-sm text-[#696A61]">
            •••
          </div>
        )}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2.5 text-sm text-[#D4C6A6] hover:bg-[#1d2829]"
        >
          Reveal <span className="text-[#696A61]">(space)</span>
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
