"use client";

import { useState } from "react";
import { useCourseFetch } from "@/lib/useCourseFetch";
import {useModalFocus} from '@/lib/useModalFocus';

interface BackupPanelProps {
  courseId:string;
  open: boolean;
  onClose: () => void;
}

export default function BackupPanel({ open, onClose,courseId }: BackupPanelProps) {
  const fetch=useCourseFetch(courseId);
  const modal=useModalFocus(open,onClose);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingClearMapping, setConfirmingClearMapping] = useState(false);
  const [clearingMapping, setClearingMapping] = useState(false);
  const busy = importing || resetting || clearingMapping;

  if (!open) return null;

  const doImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setDone(`Restored ${data.notions} notions, ${data.links} links, ${data.documents} documents.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setError("Network error during import.");
    } finally {
      setImporting(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (res.ok) window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  const doClearMapping = async () => {
    setClearingMapping(true);
    setError(null);
    try {
      const res = await fetch("/api/graph/clear", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Could not clear the mapping.");
      }
      window.location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error while clearing the mapping.");
    } finally {
      setClearingMapping(false);
    }
  };

  return (
    <div ref={modal} role="dialog" aria-modal="true" aria-label="Backup" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-lg border border-[#423e42] bg-[#201f21] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#423e42] px-5 py-3">
          <h2 className="font-display text-base font-medium tracking-wide text-accent-200">Backup</h2>
          <button onClick={onClose} className="text-[#696A61] hover:text-[#8F8978]">
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#696A61]">Export</h3>
            <p className="mb-2.5 text-xs text-[#696A61]">
              Download everything — notions, links, documents and their extracted text, drill
              scheduling, original PDFs, card edits, quality audits, and explain history — as one JSON file.
            </p>
            <a
              href="/api/export"
              download
              className="inline-block rounded-md border border-[#423e42] bg-[#322f33] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#1d2829]"
            >
              Download backup (.json)
            </a>
          </div>

          <div className="border-t border-[#423e42] pt-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#696A61]">
              Restore
            </h3>
            <p className="mb-2.5 text-xs text-[#696A61]">
              Restoring a backup <span className="text-red-400">replaces everything currently here</span>{" "}
              — there&apos;s no undo. Export first if you want to keep what&apos;s here now.
            </p>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setConfirming(false);
                setDone(null);
                setError(null);
              }}
              className="mb-2.5 block w-full text-xs text-[#8F8978] file:mr-3 file:rounded file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:text-[#D4C6A6] hover:file:bg-white/[0.14]"
            />

            {file && !confirming && !done && (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
              >
                Restore from this file…
              </button>
            )}

            {confirming && !done && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <p className="mb-2">
                  This will permanently delete everything currently in this encyclopedia and
                  replace it with the contents of &quot;{file?.name}&quot;. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={doImport}
                    disabled={busy}
                    className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? "Restoring…" : "Yes, replace everything"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded border border-[#423e42] px-2 py-1 text-[#8F8978] hover:bg-[#322f33]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {done && <p className="text-xs text-emerald-400">{done} Reloading…</p>}
          </div>

          <div className="border-t border-[#423e42] pt-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#696A61]">Mapping only</h3>
            <p className="mb-2.5 text-xs text-[#696A61]">
              Clear the mapping for this course. All cards in Browse, review progress and documents are kept.
              You can generate a new mapping from your documents afterwards.
            </p>
            {!confirmingClearMapping ? (
              <button
                onClick={() => setConfirmingClearMapping(true)}
                disabled={busy}
                className="rounded-md border border-[#423e42] bg-[#322f33] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#28262a] disabled:opacity-50"
              >
                Clear mapping only…
              </button>
            ) : (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="mb-2">Clear this course&apos;s mapping? Your Browse cards and their progress will be preserved.</p>
                <div className="flex gap-2">
                  <button onClick={doClearMapping} disabled={busy} className="border border-amber-500/40 bg-amber-500/20 px-2 py-1 hover:bg-amber-500/30 disabled:opacity-50">
                    {clearingMapping ? "Clearing…" : "Yes, clear mapping only"}
                  </button>
                  <button onClick={() => setConfirmingClearMapping(false)} disabled={busy} className="border border-[#423e42] px-2 py-1 text-[#8F8978] hover:bg-[#322f33]">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#423e42] pt-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#696A61]">Reset</h3>
            <p className="mb-2.5 text-xs text-[#696A61]">
              Empties this course completely — every notion, link, document, and study deck.{" "}
              <span className="text-red-400">No undo.</span> Export a backup first if you want to keep
              anything.
            </p>

            {!confirmingReset ? (
              <button
                onClick={() => setConfirmingReset(true)}
                className="rounded-md border border-red-500/20 bg-red-500/[0.04] px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                Reset this course…
              </button>
            ) : (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <p className="mb-2">Permanently delete everything in this course? There&apos;s no undo.</p>
                <div className="flex gap-2">
                  <button
                    onClick={doReset}
                    disabled={busy}
                    className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetting ? "Resetting…" : "Yes, empty this course"}
                  </button>
                  <button
                    onClick={() => setConfirmingReset(false)}
                    className="rounded border border-[#423e42] px-2 py-1 text-[#8F8978] hover:bg-[#322f33]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
