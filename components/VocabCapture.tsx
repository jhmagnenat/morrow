"use client";

import { useEffect, useState } from "react";

interface Toast {
  kind: "success" | "error";
  message: string;
}

// Global Alt+1 / Alt+2 listener: select any English text anywhere in the
// app and press Alt+1 to send it to Pronounce, or Alt+2 to save it as a
// translated Vocab card. Mounted once in the root layout so it works
// everywhere, not just one page.
export default function VocabCapture() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [capturing, setCapturing] = useState<"vocab" | "pronounce" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "1" && e.key !== "2")) return;
      const mode = e.key === "1" ? "pronounce" : "vocab";

      const selection = window.getSelection()?.toString().trim() ?? "";
      if (selection.length === 0) {
        setToast({ kind: "error", message: `Select some text first, then press Alt+${e.key}.` });
        return;
      }
      const maxLength = mode === "pronounce" ? 2000 : 300;
      if (selection.length > maxLength) {
        setToast({
          kind: "error",
          message:
            mode === "pronounce"
              ? "Select a shorter passage (a paragraph or less)."
              : "Select a shorter phrase (not a whole paragraph).",
        });
        return;
      }

      e.preventDefault();
      setCapturing(mode);
      try {
        const res = await fetch(mode === "pronounce" ? "/api/pronunciation/generate" : "/api/vocabulary/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: selection }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast({
            kind: "error",
            message: data.error ?? `Could not save this ${mode === "pronounce" ? "passage" : "expression"}.`,
          });
          return;
        }
        setToast(
          mode === "pronounce"
            ? { kind: "success", message: "Added to Pronounce." }
            : { kind: "success", message: `Added to Vocab: "${data.card.phrase}" → "${data.card.translationFr}"` }
        );
      } catch {
        setToast({ kind: "error", message: "Network error while saving." });
      } finally {
        setCapturing(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!toast && !capturing) return null;

  return (
    <div
      className={
        capturing
          ? "fixed bottom-5 right-5 z-[100] rounded-md border border-[#423e42] bg-[#201f21] px-4 py-2.5 text-sm text-[#8F8978] shadow-2xl"
          : `fixed bottom-5 right-5 z-[100] max-w-sm rounded-md border px-4 py-2.5 text-sm shadow-2xl ${
              toast?.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`
      }
    >
      {capturing ? (capturing === "pronounce" ? "Breaking down…" : "Translating…") : toast?.message}
    </div>
  );
}
