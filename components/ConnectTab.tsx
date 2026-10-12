"use client";

import { useState } from "react";
import { useReview } from "@/lib/useReview";
import ReviewIntervals from "@/components/ReviewIntervals";
import { useStudyQueue } from "@/lib/useStudySession";
import { colorForDomain } from "@/lib/types";
import type { Grade } from "@/lib/srs";
import { notifyXpUpdated } from "@/lib/xpEvent";
import { useCardShortcuts } from "@/lib/useCardShortcuts";
import type { DueLink } from "@/components/StudyClient";

interface ConnectTabProps {
  initialCards: DueLink[];
}

const GRADE_OPTIONS: Array<{ grade: Grade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "Again", hint: "didn't know it", className: "bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30" },
  { grade: "hard", label: "Hard", hint: "struggled", className: "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30" },
  { grade: "good", label: "Good", hint: "got it", className: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30" },
  { grade: "easy", label: "Easy", hint: "trivial", className: "bg-accent-500/20 border-accent-500/40 text-accent-200 hover:bg-accent-500/30" },
];

export function NotionPill({ label, domain }: { label: string; domain: string }) {
  const color = colorForDomain(domain);
  return (
    <div
      className="min-w-0 max-w-[160px] shrink-0 rounded-full border bg-[#28262a] px-4 py-2.5 text-center text-[13px] font-medium text-[#D4C6A6]"
      style={{ borderColor: color, boxShadow: `0 0 14px -4px ${color}` }}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

export function Connector({ type, color }: { type: string; color: string }) {
  return (
    <div className="relative flex min-w-[80px] flex-1 items-center">
      <div className="h-[2px] flex-1" style={{ backgroundColor: color, opacity: 0.6 }} />
      <div
        className="h-0 w-0 shrink-0 border-y-[5px] border-l-[8px] border-y-transparent"
        style={{ borderLeftColor: color, opacity: 0.6 }}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-[#423e42] bg-[#1a1a1b] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#696A61]"
      >
        {type.replace("-", " ")}
      </span>
    </div>
  );
}

export default function ConnectTab({ initialCards }: ConnectTabProps) {
  const { cards, setCards, index, setIndex, revealed, setRevealed, sessionDone, setSessionDone, reviewedCount, setReviewedCount } = useStudyQueue("connect", initialCards);
  const saveReview=useReview("connect");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const current = cards[index];

  const grade = async (g: Grade) => {
    if (!current || grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await saveReview("link", current.cardId ?? current.link.id, g);
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
    const res = await fetch("/api/review/connect-queue");
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
            ? `Session done — ${reviewedCount} connection${reviewedCount > 1 ? "s" : ""} reviewed.`
            : "No connections due right now."}
        </p>
        <p className="max-w-sm text-sm text-[#696A61]">
          Same spaced-repetition schedule as Drill, applied to how notions relate to each other
          instead of the notions themselves.
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

  const sourceColor = colorForDomain(current.source.domain);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      {gradeError && <p role="alert" className="text-sm text-red-400">{gradeError}</p>}
      {revealed && <ReviewIntervals type="link" id={current.cardId ?? current.link.id}/>}
      <div className="flex items-center justify-between text-xs text-[#696A61]">
        <span>
          Connection {index + 1} / {cards.length}
        </span>
        {current.isNew && <span className="text-accent-400">new</span>}
      </div>

      <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-6">
        <div className="mb-6 flex items-center gap-2">
          <NotionPill label={current.source.label} domain={current.source.domain} />
          <Connector type={current.link.type} color={sourceColor} />
          <NotionPill label={current.target.label} domain={current.target.domain} />
        </div>

        <p className="text-center text-xs uppercase tracking-wide text-[#696A61] mb-3">
          {current.question ?? "How are these connected?"}
        </p>

        {revealed ? (
          <p className="rounded-md bg-accent-500/10 p-3 text-sm leading-relaxed text-[#8F8978]">
            {current.link.description}
          </p>
        ) : (
          <div className="rounded-md border border-dashed border-white/10 bg-[#201f21] p-3 text-center text-sm text-[#696A61]">
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
