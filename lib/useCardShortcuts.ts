"use client";

import { useEffect } from "react";
import type { Grade } from "@/lib/srs";

// Space = Reveal, 1/2/3/4 = Again/Hard/Good/Easy — shared across every card
// review surface (Drill/Connect/Pronounce/Vocab/Today) so the behavior stays
// identical everywhere rather than drifting per-component. Ignored while
// typing in a text field (e.g. Pronounce's free-text generator) so Space
// still types a space there instead of triggering Reveal.
export function useCardShortcuts({
  revealed,
  onReveal,
  onGrade,
  disabled = false,
}: {
  revealed: boolean;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (disabled || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      const target = e.target as HTMLElement | null;
      if(target?.closest('[data-no-review-shortcuts]'))return;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;

      if (!revealed) {
        if (e.code === "Space" || e.key === " ") {
          e.preventDefault();
          onReveal();
        }
        return;
      }

      if (e.key === "1") onGrade("again");
      else if (e.key === "2") onGrade("hard");
      else if (e.key === "3") onGrade("good");
      else if (e.key === "4") onGrade("easy");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, onReveal, onGrade, disabled]);
}
