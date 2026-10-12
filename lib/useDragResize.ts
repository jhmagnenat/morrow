"use client";

import { useState, useSyncExternalStore } from "react";

interface UseDragResizeOptions {
  storageKey: string;
  axis: "x" | "y";
  min: number;
  max: number;
  // null = no fixed size until the user actually drags — the element just
  // renders at its natural CSS height/width. Avoids ever having to guess a
  // "natural" pixel number up front (a guess that's wrong clips real
  // content, as the header's search bar did at a too-short guessed 140px).
  initial: number | null;
  // true when dragging toward the origin (left for x, up for y) should grow
  // the size instead of shrink it — e.g. a panel resized from its left edge.
  invert?: boolean;
}

function readStored(storageKey: string, min: number, max: number, fallback: number | null): number | null {
  const saved = window.localStorage.getItem(storageKey);
  const parsed = saved ? parseFloat(saved) : NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

const neverSubscribe = () => () => {};

// A plain pointer-drag resize, persisted per-browser in localStorage —
// direct manipulation of the actual bar/panel, not a settings slider
// elsewhere. Used for the header bar's height and the side panel's width.
export function useDragResize({ storageKey, axis, min, max, initial, invert = false }: UseDragResizeOptions) {
  // useSyncExternalStore (not useEffect+useState) so the stored value reads
  // correctly on the very first client render with no hydration-mismatch
  // dance — localStorage IS an external store, this is its textbook use.
  // Nothing else ever writes this key from outside this hook, so the
  // subscription itself is a no-op; only the initial read matters.
  const stored = useSyncExternalStore(
    neverSubscribe,
    () => readStored(storageKey, min, max, initial),
    () => initial // server snapshot — SSR has no localStorage
  );

  // Once the user drags at least once, this becomes the source of truth
  // instead of `stored` (which never refreshes mid-session) — still
  // persisted to localStorage on every move so a later mount's useSyncExternalStore read picks it up.
  const [dragSize, setDragSize] = useState<number | null>(null);
  const size = dragSize ?? stored;

  // `size` can be null at drag start (never touched, natural CSS size) — in
  // that case the caller must tell us the element's actual current pixel
  // size to start the drag from, since there's no fixed state to read it
  // from. Ignored once `size` is already a real number.
  const onDragStart = (e: React.PointerEvent, measureCurrentSize?: () => number) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startSize = size ?? measureCurrentSize?.() ?? min;
    let latestSize = startSize; // a plain closure variable, not a ref — onUp needs the final value synchronously, and this only ever lives for the duration of one drag gesture

    const onMove = (moveEvent: PointerEvent) => {
      const pos = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const delta = pos - startPos;
      const signedDelta = invert ? -delta : delta;
      latestSize = Math.max(min, Math.min(max, startSize + signedDelta));
      setDragSize(latestSize);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.localStorage.setItem(storageKey, String(latestSize));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { size, onDragStart };
}
