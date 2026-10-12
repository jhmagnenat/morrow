"use client";

import { useEffect, useState } from "react";
import { XP_UPDATED_EVENT } from "@/lib/xpEvent";

interface ProgressStats {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
}

// Always-mounted level/XP bar and daily streak counter — a small layer of
// gamification over the existing spaced-repetition review system. XP itself
// has no separate storage; it's derived from review_log, so this component
// is purely a read+display of /api/xp, refetched on every graded card via
// a lightweight custom event rather than polling.
export default function XpBar() {
  const [stats, setStats] = useState<ProgressStats | null>(null);

  const refresh = () => {
    fetch("/api/xp")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    window.addEventListener(XP_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(XP_UPDATED_EVENT, refresh);
  }, []);

  if (!stats) return null;

  const pct = Math.min(100, Math.round((stats.xpIntoLevel / stats.xpForNextLevel) * 100));

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-accent-700/60 bg-[#28262a] px-2 py-0.5 text-[10px] font-semibold text-accent-300">
          Lvl {stats.level}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#322f33]" title={`${stats.xpIntoLevel} / ${stats.xpForNextLevel} XP`}>
          <div className="h-full rounded-full bg-accent-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {stats.currentStreak > 0 && (
        <span
          className="rounded-full border border-[#423e42] bg-[#28262a] px-2 py-0.5 text-[10px] font-medium text-[#8F8978]"
          title={`Longest streak: ${stats.longestStreak} day${stats.longestStreak > 1 ? "s" : ""}`}
        >
          Streak {stats.currentStreak}d
        </span>
      )}
    </div>
  );
}
