"use client";

import { useContext,useState } from "react";
import { useReview } from "@/lib/useReview";
import ReviewIntervals from "@/components/ReviewIntervals";
import { StudySessionContext,useStudyQueue } from "@/lib/useStudySession";
import AnkiContent from '@/components/AnkiContent';
import { colorForDomain } from "@/lib/types";
import type { Grade } from "@/lib/srs";
import { notifyXpUpdated } from "@/lib/xpEvent";
import { useCardShortcuts } from "@/lib/useCardShortcuts";
import type { TodayCard } from "@/lib/today";
import { NotionPill, Connector } from "@/components/ConnectTab";
import { WordCell, LinkedPair, groupLinkedWords } from "@/components/PronounceTab";

interface TodayTabProps {
  initialCards: TodayCard[];
}

const GRADE_OPTIONS: Array<{ grade: Grade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "Again", hint: "didn't know it", className: "bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30" },
  { grade: "hard", label: "Hard", hint: "struggled", className: "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30" },
  { grade: "good", label: "Good", hint: "got it", className: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30" },
  { grade: "easy", label: "Easy", hint: "trivial", className: "bg-accent-500/20 border-accent-500/40 text-accent-200 hover:bg-accent-500/30" },
];

const KIND_LABELS: Record<TodayCard["kind"], string> = {
  notion: "Drill",
  link: "Connect",
  pronunciation: "Pronounce",
  vocabulary: "Vocab",
};

function cardId(card: TodayCard): string {
  if (card.kind === "notion") return card.cardId ?? card.notion.id;
  if (card.kind === "link") return card.cardId ?? card.link.id;
  return card.card.id;
}

// A mixed, interleaved queue across every due card type (notion/link/
// pronunciation/vocabulary) — the "what's due today" session. Interleaving
// different card types in one sitting is a well-studied retention booster
// over blocking by type, which is why Drill/Connect/Pronounce/Vocab still
// exist separately for generating and managing cards, but reviewing them
// one type at a time isn't the default anymore.
export default function TodayTab({ initialCards }: TodayTabProps) {
  const {courseId}=useContext(StudySessionContext);
  const { cards, setCards, index, setIndex, revealed, setRevealed, sessionDone, setSessionDone, reviewedCount, setReviewedCount } = useStudyQueue("today", initialCards);
  const saveReview=useReview("today");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const current = cards[index];

  const grade = async (g: Grade) => {
    if (!current || grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await saveReview(current.kind, cardId(current), g);
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
    const res = await fetch("/api/review/today");
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
            ? `Session done — ${reviewedCount} card${reviewedCount > 1 ? "s" : ""} reviewed.`
            : "Nothing due right now."}
        </p>
        <p className="max-w-sm text-sm text-[#696A61]">
          Every due card — Drill, Connect, Pronounce, and Vocab — mixed into one interleaved session instead
          of one type at a time.
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
      {revealed && <ReviewIntervals type={current.kind} id={cardId(current)}/>}
      <div className="flex items-center justify-between text-xs text-[#696A61]">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        <span className="flex items-center gap-2">
          {current.isNew && <span className="text-accent-400">new</span>}
          <span className="rounded-full border border-[#423e42] bg-[#28262a] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#696A61]">
            {KIND_LABELS[current.kind]}
          </span>
        </span>
      </div>

      <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-6">
        {current.kind === "notion" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: colorForDomain(current.notion.domain) }}
              >
                {current.notion.domain}
              </span>
              <h2 className="text-base font-semibold text-[#D4C6A6]">{current.notion.label}</h2>
            </div>
            {!revealed ? (
              <AnkiContent presentation={current.card.presentation} face="front" courseId={courseId} fallback={current.question??'Recall the definition, then reveal.'}/>
            ) : (
              <div className="space-y-3">
                <AnkiContent presentation={current.card.presentation} face="back" courseId={courseId} fallback={current.card.definition}/>
                {current.card.explanation&&<details className="border-t border-[#423e42] pt-3 text-sm text-[#aaa596]"><summary className="cursor-pointer">Why / more context</summary><p className="mt-2 whitespace-pre-line leading-relaxed">{current.card.explanation}</p></details>}
                {current.card.example && (
                  <p className="text-sm leading-relaxed text-[#8F8978]">
                    <span className="font-medium text-[#696A61]">Example: </span>
                    {current.card.example}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {current.kind === "link" && (
          <>
            <div className="mb-6 flex items-center gap-2">
              <NotionPill label={current.source.label} domain={current.source.domain} />
              <Connector type={current.link.type} color={colorForDomain(current.source.domain)} />
              <NotionPill label={current.target.label} domain={current.target.domain} />
            </div>
            <p className="mb-3 text-center text-xs uppercase tracking-wide text-[#696A61]">
              How are these connected?
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
          </>
        )}

        {current.kind === "pronunciation" && (
          <>
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
                      <LinkedPair key={i} words={group as [typeof group[0], typeof group[0]]} />
                    ) : (
                      <WordCell key={i} word={group[0]} />
                    )
                  )}
                </p>
              </>
            )}
          </>
        )}

        {current.kind === "vocabulary" && (
          <>
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
          </>
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
