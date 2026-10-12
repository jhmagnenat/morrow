"use client";

import { useContext, useMemo, useState } from "react";
import {notionRecallCards} from '@/lib/studyModes';
import { useReview } from "@/lib/useReview";
import ReviewIntervals from "@/components/ReviewIntervals";
import { StudySessionContext, useStudyQueue } from "@/lib/useStudySession";
import { useCourseFetch } from '@/lib/useCourseFetch';
import { colorForDomain } from "@/lib/types";
import type { Grade } from "@/lib/srs";
import { notifyXpUpdated } from "@/lib/xpEvent";
import { useCardShortcuts } from "@/lib/useCardShortcuts";
import type { DueCard } from "@/components/StudyClient";
import AnkiContent from '@/components/AnkiContent';
import QaGenerator from '@/components/QaGenerator';
import type {Notion} from '@/lib/types';
import {teachingOriginLabel} from '@/lib/teachingCourse';

interface DrillTabProps {
  allowQuestionGenerator?:boolean;
  initialCards: DueCard[];
  mode?: 'notions' | 'qa';
  allNotions?: Notion[];
  llmConfigured?: boolean;
}

const GRADE_OPTIONS: Array<{ grade: Grade; label: string; hint: string; className: string }> = [
  { grade: "again", label: "Again", hint: "didn't know it", className: "bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30" },
  { grade: "hard", label: "Hard", hint: "struggled", className: "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30" },
  { grade: "good", label: "Good", hint: "got it", className: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30" },
  { grade: "easy", label: "Easy", hint: "trivial", className: "bg-accent-500/20 border-accent-500/40 text-accent-200 hover:bg-accent-500/30" },
];

export default function DrillTab({ initialCards,mode='qa',allNotions=[],llmConfigured=false,allowQuestionGenerator=true }: DrillTabProps) {
  const {courseId} = useContext(StudySessionContext);
  const fetch = useCourseFetch(courseId);
  const selected=useMemo(()=>mode==='notions'?notionRecallCards(initialCards):initialCards,[initialCards,mode]);
  const queueName=mode==='notions'?'notions':'qa';
  const { cards, setCards, index, setIndex, revealed, setRevealed, sessionDone, setSessionDone, reviewedCount, setReviewedCount } = useStudyQueue(queueName, selected);
  const saveReview=useReview(queueName);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const current = cards[index];

  const grade = async (g: Grade) => {
    if (!current || grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await saveReview("notion", current.cardId ?? current.notion.id, g);
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
    const res = await fetch(mode==='notions'?"/api/review/queue?mode=notions":"/api/review/queue");
    if (res.ok) {
      const data = await res.json();
      const next=mode==='notions'?notionRecallCards(data.cards):data.cards;
      setCards(next);
      setIndex(0);
      setRevealed(false);
      setReviewedCount(0);
      setSessionDone(next.length === 0);
    }
  };
  const appendGenerated=async()=>{
    const response=await fetch('/api/review/queue');if(!response.ok)throw Error('Questions were saved, but the review queue could not be refreshed. Use Check again.');
    const data=await response.json();
    const known=new Set(cards.map(c=>c.cardId??c.notion.id)),extra=(data.cards as DueCard[]).filter(c=>!known.has(c.cardId??c.notion.id));
    if(extra.length){setCards(previous=>{const ids=new Set(previous.map(c=>c.cardId??c.notion.id));return [...previous,...extra.filter(c=>!ids.has(c.cardId??c.notion.id))];});if(sessionDone){setIndex(cards.length);setRevealed(false);setSessionDone(false);}}
  };
  const generator=mode==='qa'&&allowQuestionGenerator?<QaGenerator notions={allNotions} llmConfigured={llmConfigured} onGenerated={appendGenerated}/>:null;

  useCardShortcuts({
    revealed,
    onReveal: () => setRevealed(true),
    onGrade: grade,
    disabled: grading || sessionDone || !current,
  });

  if (sessionDone) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        {generator}
        <p className="text-lg text-[#D4C6A6]">
          {reviewedCount > 0
            ? `Session done — ${reviewedCount} card${reviewedCount > 1 ? "s" : ""} reviewed.`
            : "Nothing due right now."}
        </p>
        <p className="max-w-sm text-sm text-[#696A61]">
          Cards come back on a schedule based on how well you know them — check back later, or
          {mode==='notions'?'approve definition cards in Browse to grow this deck. Other questions remain in Q&A.':'approve more course questions in Browse to grow the deck.'}
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

  const color = colorForDomain(current.notion.domain);
  const sources=current.evidence?.length?current.evidence:current.notion.sources;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      {generator}
      <p className="text-xs text-[#aaa596]">{mode==='notions'?'Notions · Recall the definition and essential characteristics.':'Review · Recall, explain, distinguish or apply before revealing.'}</p>
      {gradeError && <p role="alert" className="text-sm text-red-400">{gradeError}</p>}
      {revealed && <ReviewIntervals type="notion" id={current.cardId ?? current.notion.id}/>}
      <div className="flex items-center justify-between text-xs text-[#696A61]">
        <span>
          Card {index + 1} / {cards.length}
        </span>
        {current.isNew && <span className="text-accent-400">new</span>}
      </div>

      <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-6">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {current.notion.domain}
          </span>
          {(mode==='notions'||revealed)&&<h2 className="text-base font-semibold text-[#D4C6A6]">{current.notion.label}</h2>}
        </div>

        {!revealed ? (
          mode==='notions'?<p className="text-sm text-[#aaa596]">Recall its definition and essential characteristics, then reveal.</p>:<AnkiContent presentation={current.card.presentation} face="front" courseId={courseId} fallback={current.question??'Recall the definition, then reveal.'}/>
        ) : (
          <div className="space-y-3">
            <AnkiContent presentation={current.card.presentation} face="back" courseId={courseId} fallback={current.card.definition}/>
            {current.teaching&&<p className="text-xs text-accent-300">{teachingOriginLabel(current.teaching.origin)} · {current.card.kind}</p>}
            {current.card.explanation&&<details className="border-t border-[#423e42] pt-3 text-sm text-[#aaa596]"><summary className="cursor-pointer">Why / more context</summary><p className="mt-2 whitespace-pre-line leading-relaxed">{current.card.explanation}</p></details>}
            {sources.length>0&&<details className="border-t border-[#423e42] pt-3 text-xs text-[#aaa596]"><summary className="cursor-pointer">Course sources</summary><div className="mt-2 flex flex-wrap gap-3">{sources.map(source=><a key={`${source.documentId}:${source.page}`} className="text-accent-200 underline" target="_blank" rel="noreferrer" href={`/api/documents/${source.documentId}/file#page=${source.page}`}>Slide {source.page}</a>)}</div></details>}
            {current.card.example && (
              <p className="text-sm leading-relaxed text-[#8F8978]">
                <span className="font-medium text-[#696A61]">Example: </span>
                {current.card.example}
              </p>
            )}
            {mode==='qa' && current.notion.workQuestions && current.notion.workQuestions.length > 0 && (
              <p className="border-t border-[#423e42] pt-3 text-sm leading-relaxed text-[#8F8978]">
                <span className="font-medium text-accent-400">Could you answer: </span>
                {current.notion.workQuestions[0].question}
              </p>
            )}
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
