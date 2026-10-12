"use client";

import { Activity, useEffect,useMemo, useState } from "react";
import {useRouter} from 'next/navigation';
import { StudySessionContext, useStudyState } from "@/lib/useStudySession";
import Link from "next/link";
import type { DrillCard, Notion } from "@/lib/types";
import type {Evidence} from '@/lib/contentQuality';
import type { DueLink as DueLinkCard, PronunciationCard, VocabularyCard } from "@/lib/db";
import type { TodayCard } from "@/lib/today";
import DrillTab from "@/components/DrillTab";
import ExplainTab from "@/components/ExplainTab";
import ConnectTab from "@/components/ConnectTab";
import PronounceTab from "@/components/PronounceTab";
import VocabTab from "@/components/VocabTab";
import TodayTab from "@/components/TodayTab";
import UnderstandTab from '@/components/UnderstandTab';
import type {TeachingLesson,TeachingTrace} from '@/lib/teachingCourse';

export interface DueCard {
  teaching?:TeachingTrace;
  evidence?: Evidence[];
  cardId?: string;
  question?: string;
  notion: Notion;
  isNew: boolean;
  card: DrillCard;
}

export type DueLink = DueLinkCard;

export interface DuePronunciationCard {
  card: PronunciationCard;
  isNew: boolean;
}

export interface DueVocabularyCard {
  card: VocabularyCard;
  isNew: boolean;
}

interface StudyClientProps {
  initialLessons?:TeachingLesson[];
  courseId: string;
  validCardKeys: string[];
  initialCards: DueCard[];
  initialNotionCards: DueCard[];
  initialLinkCards: DueLink[];
  initialPronunciationCards: DuePronunciationCard[];
  initialVocabularyCards: DueVocabularyCard[];
  initialTodayCards: TodayCard[];
  allNotions: Notion[];
  llmConfigured: boolean;
}

type Tab = "understand" | "today" | "drill" | "qa" | "connect" | "explain" | "pronounce" | "vocab";

const TAB_LABELS: Record<Tab, string> = {
  understand: 'Course',
  today: "Today",
  drill: "Notions",
  qa: "Review",
  connect: "Connect",
  explain: "Explain",
  pronounce: "Pronounce",
  vocab: "Vocab",
};

export default function StudyClient({
  courseId,
  validCardKeys,
  ...props
}: StudyClientProps) {
  const router=useRouter();
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<{courseId:string;contentChanged:boolean}>).detail;if(detail.courseId===courseId&&detail.contentChanged)router.refresh();};
    window.addEventListener('morrow:review-inventory',update);return()=>window.removeEventListener('morrow:review-inventory',update);
  },[courseId,router]);
  const context = useMemo(() => ({ courseId, validCardKeys: new Set(validCardKeys) }), [courseId, validCardKeys]);
  return (
    <StudySessionContext.Provider value={context}>
      <StudyTabs {...props} />
    </StudySessionContext.Provider>
  );
}

const restoreTab = (value: unknown): Tab | null => typeof value === "string" && Object.hasOwn(TAB_LABELS, value) ? value as Tab : null;

function StudyTabs({
  initialLessons=[],
  initialCards,
  initialNotionCards,
  initialLinkCards,
  initialPronunciationCards,
  initialVocabularyCards,
  initialTodayCards,
  allNotions,
  llmConfigured,
}: Omit<StudyClientProps, "courseId" | "validCardKeys">) {
  const [tab, setTab] = useStudyState<Tab>("tab", initialLessons.length||allNotions.some(n => n.clair) ? 'understand' : 'qa', restoreTab);
  const [pendingPronunciationCard, setPendingPronunciationCard] = useState<PronunciationCard | null>(null);

  const practicePronunciation = (card: PronunciationCard) => {
    setPendingPronunciationCard(card);
    setTab("pronounce");
  };

  return (
    <div className="flex h-full flex-col bg-[#1a1a1b]">
      <header className="study-header flex flex-wrap items-center justify-between gap-4 border-b border-[#423e42] bg-[#201f21] px-5 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-[#696A61] hover:text-[#8F8978]">
            ← Back to graph
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-[#D4C6A6]">Study</h1>
        </div>
        <div className="study-navigation flex min-w-0 flex-wrap items-center gap-2">
          <Link href="/browse" className="text-xs text-[#696A61] hover:text-[#8F8978]">
            Cards →
          </Link>
          <Link
            href="/progress"
            className="text-xs text-[#696A61] hover:text-[#8F8978]"
          >
            Progress →
          </Link>
          <div aria-label="Study modes" className="study-modes flex max-w-full flex-wrap border border-[#423e42] bg-[#28262a] p-0.5 text-xs">
            {(["understand", "qa"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={tab===t}
                onClick={() => setTab(t)}
                className={
                  tab === t
                    ? "rounded px-3 py-1.5 font-medium text-[#1c140d] bg-accent-300"
                    : "rounded px-3 py-1.5 text-[#696A61] hover:text-[#8F8978]"
                }
              >
                {TAB_LABELS[t]}
              </button>
            ))}
            <details className="relative"><summary className="cursor-pointer px-3 py-1.5 text-[#8F8978]">More practice</summary><div className="absolute right-0 z-20 mt-2 grid min-w-40 gap-1 rounded border border-[#423e42] bg-[#28262a] p-2">{(["today","drill","connect","explain","pronounce","vocab"] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)} className="px-3 py-2 text-left text-[#aaa596]">{TAB_LABELS[t]}</button>)}</div></details>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Activity mode={tab === 'understand' ? 'visible' : 'hidden'}><UnderstandTab allNotions={allNotions} lessons={initialLessons}/></Activity>
        <Activity mode={tab === "today" ? "visible" : "hidden"}>
          <TodayTab initialCards={initialTodayCards} />
        </Activity>
        <Activity mode={tab === "drill" ? "visible" : "hidden"}>
          <DrillTab initialCards={initialNotionCards} mode="notions" />
        </Activity>
        <Activity mode={tab === "qa" ? "visible" : "hidden"}>
          <DrillTab initialCards={initialCards} mode="qa" allNotions={allNotions} llmConfigured={llmConfigured} allowQuestionGenerator={!initialLessons.length} />
        </Activity>
        <Activity mode={tab === "connect" ? "visible" : "hidden"}>
          <ConnectTab initialCards={initialLinkCards} />
        </Activity>
        <Activity mode={tab === "explain" ? "visible" : "hidden"}>
          <ExplainTab
            allNotions={allNotions}
            llmConfigured={llmConfigured}
            onPracticePronunciation={practicePronunciation}
          />
        </Activity>
        <Activity mode={tab === "pronounce" ? "visible" : "hidden"}>
          <PronounceTab
            initialCards={initialPronunciationCards}
            pendingCard={pendingPronunciationCard}
            llmConfigured={llmConfigured}
          />
        </Activity>
        <Activity mode={tab === "vocab" ? "visible" : "hidden"}>
          <VocabTab initialCards={initialVocabularyCards} />
        </Activity>
      </div>
    </div>
  );
}
