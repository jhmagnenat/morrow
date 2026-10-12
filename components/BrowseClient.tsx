"use client";

import { useMemo, useState } from "react";
import CardEditor from "@/components/CardEditor";
import { useCourseFetch } from "@/lib/useCourseFetch";
import type { StudyCard } from "@/lib/contentQuality";
import QualityPanel from "@/components/QualityPanel";
import type { BrowseCard, CardType } from "@/lib/db";

interface BrowseClientProps {
  courseId:string;
  initialCards: BrowseCard[];
}

const MATURE_THRESHOLD_DAYS = 21;

const TYPE_LABELS: Record<CardType, string> = {
  notion: "Drill",
  link: "Connect",
  pronunciation: "Pronounce",
  vocabulary: "Vocab",
};

const TYPE_BADGE_CLASS: Record<CardType, string> = {
  notion: "bg-accent-500/15 text-accent-300",
  link: "bg-sky-500/15 text-sky-300",
  pronunciation: "bg-pink-500/15 text-pink-300",
  vocabulary: "bg-lime-500/15 text-lime-300",
};

function maturityOf(card: BrowseCard): "new" | "young" | "mature" {
  if (card.isNew) return "new";
  return card.intervalDays >= MATURE_THRESHOLD_DAYS ? "mature" : "young";
}

const MATURITY_BADGE_CLASS: Record<"new" | "young" | "mature", string> = {
  new: "bg-slate-500/15 text-slate-400",
  young: "bg-amber-500/15 text-amber-300",
  mature: "bg-emerald-500/15 text-emerald-300",
};

function formatDue(card: BrowseCard): string {
  if (card.isNew) return "new";
  if (!card.dueAt) return "—";
  const due = new Date(card.dueAt).getTime();
  const now = Date.now();
  const days = Math.round((due - now) / 86_400_000);
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "today";
  return `in ${days}d`;
}

export default function BrowseClient({ initialCards,courseId }: BrowseClientProps) {
  const fetch=useCourseFetch(courseId);
  const [editing,setEditing]=useState<StudyCard|null>(null);
  const [statusFilter,setStatusFilter]=useState("all");
  const [cards, setCards] = useState(initialCards);
  const [filter, setFilter] = useState<"all" | CardType>("all");
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((c) => filter === "all" || c.cardType === filter)
      .filter((c)=>statusFilter==="all" || c.studyCard?.status===statusFilter || (statusFilter==="legacy" && c.studyCard?.promptVersion==="legacy"))
      .filter((c) => !q || `${c.label} ${c.studyCard?.answer ?? ""}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const aKey = a.isNew || !a.dueAt ? -Infinity : new Date(a.dueAt).getTime();
        const bKey = b.isNew || !b.dueAt ? -Infinity : new Date(b.dueAt).getTime();
        return aKey - bKey;
      });
  }, [cards, filter, query, statusFilter]);

  const counts = useMemo(() => {
    const result: Record<"all" | CardType, number> = {
      all: cards.length,
      notion: 0,
      link: 0,
      pronunciation: 0,
      vocabulary: 0,
    };
    for (const c of cards) result[c.cardType]++;
    return result;
  }, [cards]);

  const runAction = async (card: BrowseCard, action: "reset" | "due-now") => {
    const key = `${card.cardType}:${card.cardId}:${action}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/review/${card.cardType}/${card.cardId}/${action}`, { method: "POST" });
      if (!res.ok) return;
      setCards((prev) =>
        prev.map((c) => {
          if (c.cardType !== card.cardType || c.cardId !== card.cardId) return c;
          if (action === "reset") return { ...c, isNew: true, intervalDays: 0, dueAt: null, repetitions: 0 };
          return { ...c, isNew: false, dueAt: new Date().toISOString() };
        })
      );
    } finally {
      setBusyKey(null);
    }
  };

  const deleteCard = async (card: BrowseCard) => {
    const noun = "card";
    if (!window.confirm(`Delete this ${noun} permanently? "${card.label}"`)) return;
    const key = `${card.cardType}:${card.cardId}:delete`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/review/${card.cardType}/${card.cardId}`, { method: "DELETE" });
      if (!res.ok) return;
      setCards((prev) => prev.filter((c) => !(c.cardType === card.cardType && c.cardId === card.cardId)));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <QualityPanel courseId={courseId} onGeneration={async()=>{const response=await fetch('/api/browse',{cache:'no-store'});if(!response.ok)throw Error('Could not refresh the saved card list');const result=await response.json();setCards(result.cards);}}/>
      {editing && <CardEditor key={editing.id} courseId={courseId} card={editing} onClose={()=>setEditing(null)} onSave={updated=>{setCards(previous=>previous.map(c=>c.cardId===updated.id?{...c,label:updated.question,detail:updated.status,studyCard:updated}:c));setEditing(null);}}/>}
      <select className="mb-4 rounded bg-[#28262a] p-2" aria-label="Card status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{["all","ready","draft","suspended","legacy"].map(v=><option key={v} value={v}>{v}</option>)}</select>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", "notion", "link", "pronunciation", "vocabulary"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={
              filter === t
                ? "rounded-md border border-accent-400/40 bg-accent-300 px-3 py-1.5 text-xs font-medium text-[#1c140d]"
                : "rounded-md border border-[#423e42] bg-[#201f21] px-3 py-1.5 text-xs text-[#8F8978] hover:bg-[#322f33]"
            }
          >
            {t === "all" ? "All" : TYPE_LABELS[t]} ({counts[t]})
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="ml-auto w-48 rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#696A61]">No cards match.</p>
      ) : (
        <div className="divide-y divide-white/[0.06] rounded-lg border border-[#423e42] bg-[#201f21]">
          {visible.map((card) => {
            const maturity = maturityOf(card);
            return (
              <div key={`${card.cardType}:${card.cardId}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#D4C6A6]">{card.label}</p>
                  {card.studyCard && <p className="mt-1 line-clamp-2 text-xs text-[#8F8978]">{card.studyCard.answer}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASS[card.cardType]}`}>
                      {TYPE_LABELS[card.cardType]}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${MATURITY_BADGE_CLASS[maturity]}`}>
                      {maturity}
                    </span>
                    <span className="text-[11px] text-[#696A61]">{card.detail}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-[#696A61]">
                  <p>{formatDue(card)}</p>
                  {!card.isNew && <p className="text-[10px] text-[#696A61]">{card.repetitions} reviews</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {card.studyCard && <button className="rounded border border-[#423e42] px-2 py-1 text-xs" onClick={()=>setEditing(card.studyCard!)}>Verify / edit</button>}
                  <button
                    onClick={() => runAction(card, "due-now")}
                    disabled={card.isNew || busyKey === `${card.cardType}:${card.cardId}:due-now`}
                    className="rounded border border-[#423e42] bg-[#28262a] px-2 py-1 text-[11px] text-[#8F8978] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Review now
                  </button>
                  <button
                    onClick={() => runAction(card, "reset")}
                    disabled={card.isNew || busyKey === `${card.cardType}:${card.cardId}:reset`}
                    className="rounded border border-[#423e42] bg-[#28262a] px-2 py-1 text-[11px] text-[#8F8978] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => deleteCard(card)}
                    disabled={busyKey === `${card.cardType}:${card.cardId}:delete`}
                    className="rounded border border-red-500/20 bg-red-500/[0.04] px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
