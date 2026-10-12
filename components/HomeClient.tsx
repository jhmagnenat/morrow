"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import type { ReactFlowInstance } from "@xyflow/react";

import Graph from "@/components/Graph";
import SidePanel, { type Selection } from "@/components/SidePanel";
import { useCourseFetch } from "@/lib/useCourseFetch";
import {requestDocumentGeneration,watchDocumentGeneration} from '@/lib/documentGenerationClient';
import {MAX_PDF_UPLOAD_BYTES,PDF_UPLOAD_LIMIT_MESSAGE} from '@/lib/documentUpload';
import type {DocumentGenerationJob} from '@/lib/documentGeneration';
import SearchBar from "@/components/SearchBar";
import DocumentsPanel from "@/components/DocumentsPanel";
import BackupPanel from "@/components/BackupPanel";
import ModeToggle from "@/components/ModeToggle";
import type { ChatTurn } from "@/lib/llm";
import type { MasteryInfo } from "@/lib/mastery";
import { findOrphans, findRootNotions } from "@/lib/graphHealth";
import { useDragResize } from "@/lib/useDragResize";
import {
  colorForDomain,
  type Document,
  type GenerationMode,
  type Link,
  type Notion,
} from "@/lib/types";

interface DocumentWithStats extends Document {
  passageCount: number;
  generatedPassageCount: number;
  generationJob?:DocumentGenerationJob;
}

interface HomeClientProps {
  courseId:string;
  initialNotions: Notion[];
  initialLinks: Link[];
  initialDocuments: DocumentWithStats[];
  initialMastery: Record<string, MasteryInfo>;
  llmConfigured: boolean;
  providerLabel: string;
}

type SelectionRef = { kind: "node"; id: string } | { kind: "edge"; id: string };

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Flags a likely duplicate so the UI can offer a one-click merge — mainly
// useful after decompose/generate runs on a weaker local model, which
// sometimes proposes a notion that already exists elsewhere in the graph.
// Deliberately strict (exact match after normalizing case/punctuation only):
// a fuzzier word-overlap heuristic also caught legitimate specializations
// like "Catastrophe Excess of Loss" as a "duplicate" of "Excess of Loss",
// which is actively harmful to suggest merging away. The always-available
// manual "merge with..." search in the side panel covers near-duplicates
// this conservative check misses.
function findLikelyDuplicate(notion: Notion, all: Notion[]): Notion | null {
  const norm = normalizeLabel(notion.label);
  if (norm.length === 0) return null;
  return all.find((n) => n.id !== notion.id && normalizeLabel(n.label) === norm) ?? null;
}

// Every group of 2+ notions sharing the same normalized label — same
// conservative exact-match rule as findLikelyDuplicate, just across the
// whole graph at once instead of one selected notion at a time.
function findDuplicateGroups(notions: Notion[], links: Link[]): Notion[][] {
  const byNorm = new Map<string, Notion[]>();
  for (const n of notions) {
    const norm = normalizeLabel(n.label);
    if (!norm) continue;
    const list = byNorm.get(norm) ?? [];
    list.push(n);
    byNorm.set(norm, list);
  }
  const linkCount = new Map<string, number>();
  for (const l of links) {
    linkCount.set(l.source, (linkCount.get(l.source) ?? 0) + 1);
    linkCount.set(l.target, (linkCount.get(l.target) ?? 0) + 1);
  }
  return [...byNorm.values()]
    .filter((group) => group.length > 1)
    // Most-connected notion in each group first — it becomes the merge
    // target, so the richer/better-linked copy is the one that survives.
    .map((group) => [...group].sort((a, b) => (linkCount.get(b.id) ?? 0) - (linkCount.get(a.id) ?? 0)));
}

export default function HomeClient({
  courseId,
  initialNotions,
  initialLinks,
  initialDocuments,
  initialMastery,
  llmConfigured,
  providerLabel,
}: HomeClientProps) {
  const fetch=useCourseFetch(courseId);
  const [notions, setNotions] = useState<Notion[]>(initialNotions);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [documents, setDocuments] = useState<DocumentWithStats[]>(initialDocuments);
  const generationWatch=useRef<{id:string;courseId:string;canceled:boolean}|null>(null);
  // Server-fetched on every load of this page (force-dynamic) — no client
  // state needed since mastery only changes via Study/Interview, both
  // separate routes the user navigates back from.
  const mastery = initialMastery;
  const [selection, setSelection] = useState<SelectionRef | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<GenerationMode>("strict");
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(initialDocuments.length===0);
  const [backupOpen, setBackupOpen] = useState(false);

  // Escape deselects the current node/edge (closing the side panel) — the
  // only other way to do that today is clicking empty graph space, which
  // isn't always reachable without losing your pan/zoom position.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      setSelection(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Direct-manipulation resize handles on the actual bars, not a settings
  // menu — drag the header's bottom edge up to shrink it (more room for the
  // map), drag the side panel's left edge to make it wider or narrower.
  const headerContentRef = useRef<HTMLElement>(null);
  const headerResize = useDragResize({ storageKey: "ui.headerHeight", axis: "y", min: 0, max: 260, initial: null });
  const sidePanelResize = useDragResize({
    storageKey: "ui.sidePanelWidth",
    axis: "x",
    min: 280,
    max: 800,
    initial: 420,
    invert: true,
  });
  // Plain inline styles + React-driven hover (not Tailwind classes) for the
  // two grip indicators — arbitrary-value width/background utility classes
  // on these particular bare <span>s weren't being generated into the CSS
  // bundle for reasons not worth chasing further; inline style sidesteps it.
  const [headerHandleHover, setHeaderHandleHover] = useState(false);
  const [sidePanelHandleHover, setSidePanelHandleHover] = useState(false);
  const gripLineStyle = (hovered: boolean, horizontal: boolean) => ({
    width: horizontal ? 32 : 2,
    height: horizontal ? 2 : 32,
    borderRadius: 999,
    backgroundColor: hovered ? "#c18a38" : "#696A61",
  });

  const [decomposing, setDecomposing] = useState(false);
  const [decomposeError, setDecomposeError] = useState<string | null>(null);

  const [goingFurther, setGoingFurther] = useState(false);
  const [goFurtherError, setGoFurtherError] = useState<string | null>(null);

  const [adeptGenerating, setAdeptGenerating] = useState(false);
  const [adeptError, setAdeptError] = useState<string | null>(null);

  const [chatByNotion, setChatByNotion] = useState<Record<string, ChatTurn[]>>({});
  const [chatLoading, setChatLoading] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const [undoAction, setUndoAction] = useState<{ message: string; perform: () => Promise<void> } | null>(
    null
  );

  useEffect(() => {
    if (!undoAction) return;
    const t = setTimeout(() => setUndoAction(null), 8000);
    return () => clearTimeout(t);
  }, [undoAction]);

  const selectionForPanel: Selection | null = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "node") {
      const notion = notions.find((n) => n.id === selection.id);
      return notion ? { kind: "node", notion } : null;
    }
    const link = links.find((l) => l.id === selection.id);
    if (!link) return null;
    const source = notions.find((n) => n.id === link.source);
    const target = notions.find((n) => n.id === link.target);
    if (!source || !target) return null;
    return { kind: "edge", link, source, target };
  }, [selection, notions, links]);

  const similarNotion = useMemo(() => {
    if (!selectionForPanel || selectionForPanel.kind !== "node") return null;
    return findLikelyDuplicate(selectionForPanel.notion, notions);
  }, [selectionForPanel, notions]);

  const refreshGraph = async () => {
    const res = await fetch("/api/graph");
    if (!res.ok) return;
    const data = (await res.json()) as { notions: Notion[]; links: Link[] };
    setNotions(data.notions);
    setLinks(data.links);
  };

  // Just selects — no viewport change. Used for a direct click on a node
  // already visible in the graph, so the view stays exactly where the user
  // left it instead of re-centering/re-zooming on every click.
  const selectNode = (id: string) => {
    setSelection({ kind: "node", id });
  };

  // Selects AND jumps the viewport to the node — for when the user doesn't
  // already know where it is on screen (search results), where re-centering
  // AND re-zooming to a sane level is the actual point.
  const focusNode = useCallback(
    (id: string) => {
      setSelection({ kind: "node", id });
      flowInstance?.fitView({ nodes: [{ id }], duration: 500, maxZoom: 1.2 });
    },
    [flowInstance]
  );

  const selectEdge = (id: string) => {
    setSelection({ kind: "edge", id });
  };

  const toggleStatus = async (notionId: string) => {
    const notion = notions.find((n) => n.id === notionId);
    if (!notion) return;
    const nextStatus = notion.status === "draft" ? "validated" : "draft";
    setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, status: nextStatus } : n)));
    await fetch(`/api/notions/${notionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  };

  const decompose = async (notionId: string) => {
    setDecomposing(true);
    setDecomposeError(null);
    try {
      const res = await fetch(`/api/notions/${notionId}/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDecomposeError(data.error ?? "Failed to decompose");
        return;
      }
      setNotions((prev) => [...prev, ...data.notions]);
      setLinks((prev) => [...prev, ...data.links]);
      const newIds: string[] = data.notions.map((n: Notion) => n.id);
      if (newIds.length === 0) {
        setDecomposeError("Nothing new to add — already covered by existing notions.");
      } else {
        setUndoAction({
          message: `Added ${newIds.length} notion${newIds.length > 1 ? "s" : ""}`,
          perform: async () => {
            for (const id of newIds) {
              await fetch(`/api/notions/${id}`, { method: "DELETE" });
            }
            setUndoAction(null);
            await refreshGraph();
          },
        });
      }
    } catch {
      setDecomposeError("Network error while contacting the model.");
    } finally {
      setDecomposing(false);
    }
  };

  const goFurther = async (notionId: string) => {
    setGoingFurther(true);
    setGoFurtherError(null);
    try {
      const res = await fetch(`/api/notions/${notionId}/go-further`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setGoFurtherError(data.error ?? "Failed to generate the go-further note");
        return;
      }
      setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, goFurther: data.goFurther } : n)));
    } catch {
      setGoFurtherError("Network error while contacting the model.");
    } finally {
      setGoingFurther(false);
    }
  };

  const generateAdept = async (notionId: string) => {
    setAdeptGenerating(true);
    setAdeptError(null);
    try {
      const res = await fetch(`/api/notions/${notionId}/adept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAdeptError(data.error ?? "Failed to generate the ADEPT breakdown");
        return;
      }
      setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, adept: data.adept } : n)));
    } catch {
      setAdeptError("Network error while contacting the model.");
    } finally {
      setAdeptGenerating(false);
    }
  };

  const deleteNotionHandler = async (notionId: string) => {
    const notionSnapshot = notions.find((n) => n.id === notionId);
    const linksSnapshot = links.filter((l) => l.source === notionId || l.target === notionId);

    await fetch(`/api/notions/${notionId}`, { method: "DELETE" });
    setChatByNotion((prev) => {
      const next = { ...prev };
      delete next[notionId];
      return next;
    });
    if (selection?.kind === "node" && selection.id === notionId) {
      setSelection(null);
    }
    await refreshGraph();

    if (notionSnapshot) {
      setUndoAction({
        message: `Deleted "${notionSnapshot.label}"`,
        perform: async () => {
          await fetch("/api/notions/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notion: notionSnapshot, links: linksSnapshot }),
          });
          setUndoAction(null);
          await refreshGraph();
        },
      });
    }
  };

  const mergeNotionHandler = async (fromId: string, intoId: string) => {
    await fetch(`/api/notions/${fromId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intoId }),
    });
    setChatByNotion((prev) => {
      const next = { ...prev };
      delete next[fromId];
      return next;
    });
    setSelection({ kind: "node", id: intoId });
    await refreshGraph();
  };

  const [mergeAllConfirming, setMergeAllConfirming] = useState(false);
  const [mergingAll, setMergingAll] = useState(false);
  const duplicateGroups = useMemo(() => findDuplicateGroups(notions, links), [notions, links]);
  const orphanNotions = useMemo(() => findOrphans(notions, links), [notions, links]);
  const rootNotions = useMemo(() => findRootNotions(notions, links), [notions, links]);
  const [consolidating, setConsolidating] = useState(false);
  const consolidateRootsHandler = async () => {
    setConsolidating(true);
    try {
      await fetch("/api/graph/consolidate-roots", { method: "POST" });
      await refreshGraph();
    } finally {
      setConsolidating(false);
    }
  };

  const mergeAllDuplicates = async () => {
    setMergingAll(true);
    try {
      for (const group of duplicateGroups) {
        const [into, ...rest] = group;
        for (const dup of rest) {
          await fetch(`/api/notions/${dup.id}/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intoId: into.id }),
          });
        }
      }
      await refreshGraph();
    } finally {
      setMergingAll(false);
      setMergeAllConfirming(false);
    }
  };

  const sendChat = async (text: string) => {
    if (!selection || selection.kind !== "node") return;
    const notionId = selection.id;
    const history = chatByNotion[notionId] ?? [];
    const withUser = [...history, { role: "user" as const, content: text }];
    setChatByNotion((prev) => ({ ...prev, [notionId]: withUser }));
    setChatLoading(true);
    try {
      const res = await fetch(`/api/notions/${notionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, messages: withUser }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : `Error: ${data.error ?? "request failed"}`;
      setChatByNotion((prev) => ({
        ...prev,
        [notionId]: [...withUser, { role: "assistant", content: reply,sources:data.sources,outsideKnowledge:data.outsideKnowledge }],
      }));
    } catch {
      setChatByNotion((prev) => ({
        ...prev,
        [notionId]: [...withUser, { role: "assistant", content: "Error: network request failed." }],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  const uploadDocument = async (file: File, title: string) => {
    setUploadError(null);
    if(file.size>MAX_PDF_UPLOAD_BYTES){setUploadError(PDF_UPLOAD_LIMIT_MESSAGE);return false;}
    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await res.json().catch(()=>null);
      if (!res.ok || !data?.document) {
        setUploadError(data?.error ?? (res.status===413?'The PDF exceeds the 128 MiB upload limit.':`Upload failed (${res.status}). Please retry the PDF.`));
        return false;
      }
      setDocuments((prev) => [data.document, ...prev]);
      return true;
    } catch {
      setUploadError("Network error during upload.");
      return false;
    }
  };

  const observeGeneration=useCallback(async(job:DocumentGenerationJob)=>{
    if(generationWatch.current?.id===job.id && !generationWatch.current.canceled)return;
    if(generationWatch.current)generationWatch.current.canceled=true;
    const watch={id:job.id,courseId,canceled:false};generationWatch.current=watch;
    setGeneratingId(job.documentId);setGenerateError(null);
    let lastUpdate='';
    try {
      await watchDocumentGeneration(fetch,job,async current=>{
        if(watch.canceled || current.updatedAt===lastUpdate)return;
        lastUpdate=current.updatedAt;
        const running=current.status==='running';
        setGenerateInfo(running
          ? `Generating: ${current.processedPages??0}/${current.totalPages} pages processed, ${current.coveredPages??0} covered, ${current.skippedPages??0} excluded, ${current.cardsCreated} new cards. ${Object.entries(current.activeStages??{}).map(([page,stage])=>`Slide ${page}: ${stage}`).join(' · ') || 'Processing the remaining pages automatically.'}`
          : current.status==='complete'
            ? `Done: ${current.coveredPages??0} pages covered, ${current.skippedPages??0} excluded, ${current.cardsCreated} new cards.`
            : current.status==='needs_review'
              ? `Generation ended: ${current.processedPages??current.completedPages}/${current.totalPages} pages processed, ${current.coveredPages??0} covered, ${current.skippedPages??0} excluded, ${current.readyCards??0} ready cards, ${current.draftCards??0} drafts. ${current.reviewPages.length} page(s) have coverage or source checks to review in Browse. Accepted cards are saved.`
              : `${current.coveredPages??0} pages covered, ${current.skippedPages??0} excluded, ${current.reviewPages.length} to review. Accepted cards are saved.`);
        if(!running && (current.error||['failed','canceled','interrupted'].includes(current.status)))setGenerateError(current.error??'Generation stopped. Saved cards are preserved.');
        if(current.attemptedPages.length || !running){
          const [graphRes,docsRes]=await Promise.all([fetch('/api/graph'),fetch('/api/documents')]);
          const graph=graphRes.ok?await graphRes.json():null,docs=docsRes.ok?await docsRes.json():null;
          if(watch.canceled)return;
          if(graph){setNotions(graph.notions);setLinks(graph.links);}
          if(docs)setDocuments(docs.documents);
        }
      },()=>watch.canceled);
    }catch(error){if(!watch.canceled)setGenerateError(error instanceof Error?error.message:'Unable to read generation progress.');}
    finally {if(generationWatch.current===watch){generationWatch.current=null;setGeneratingId(null);}}
  },[courseId,fetch]);

  useEffect(()=>{
    let canceled=false;
    void fetch('/api/documents').then(async response=>{
      if(!response.ok)return;
      const data=await response.json() as {documents:DocumentWithStats[]};
      if(canceled)return;
      setDocuments(data.documents);
      const running=data.documents.find(d=>d.generationJob?.status==='running');
      if(running?.generationJob)void observeGeneration(running.generationJob);
    }).catch(()=>{});
    return ()=>{canceled=true;if(generationWatch.current?.courseId===courseId)generationWatch.current.canceled=true;};
  },[courseId,fetch,observeGeneration]);

  const generateFromDocument=async(documentId:string,enrichment=false,options?:{cardDetail:'key-ideas'|'comprehensive';pages?:number[];reprocess?:boolean})=>{
    setGeneratingId(documentId);setGenerateError(null);setGenerateInfo(null);
    try {await observeGeneration(await requestDocumentGeneration(fetch,documentId,{mode,enrichment,...options}));}
    catch(error){setGenerateError(error instanceof Error?error.message:'Could not start generation.');setGeneratingId(null);}
  };

  const deleteDocumentHandler = async (documentId: string) => {
    await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    // A deleted document's citations disappear from any notion that had
    // them, so refresh the graph to pick that up.
    await refreshGraph();
  };

  const selectedNodeId = selection?.kind === "node" ? selection.id : null;
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null;
  const chatMessages = selectedNodeId ? chatByNotion[selectedNodeId] ?? [] : [];

  return (
    <div className="flex h-full flex-col bg-[#1a1a1b]">
      <div
        style={headerResize.size === null ? undefined : { height: headerResize.size, overflow: "hidden" }}
        className="map-header-shell shrink-0"
      >
      <header
        ref={headerContentRef}
        className="map-header flex flex-col gap-4 border-b border-[#423e42] bg-[#201f21] px-4 py-3 sm:px-6 sm:py-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-medium tracking-wide text-accent-200">Morrow</h1>
            <p className="mt-1 text-sm text-[#aaa596]">Import slides → understand the explained course → review your cards</p>
            <p className="text-xs text-[#696A61]">
              {notions.length} notions · {links.length} links · {documents.length} documents
              {" · "}
              {llmConfigured ? `AI: ${providerLabel}` : "AI features need OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rootNotions.length > 2 && (
              <button
                onClick={consolidateRootsHandler}
                disabled={consolidating}
                title="Use AI to arrange top-level notions into subject categories. Changes the map organization; does not verify or improve the course content."
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {consolidating ? "Organizing…" : "Organize map into categories"}
              </button>
            )}
            {orphanNotions.length > 0 && (
              <button
                onClick={() => focusNode(orphanNotions[0].id)}
                title={`Not connected to anything else in the map: ${orphanNotions.map((n) => n.label).join(", ")}`}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
              >
                {orphanNotions.length} isolated
              </button>
            )}
            {duplicateGroups.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setMergeAllConfirming((v) => !v)}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
                >
                  Merge duplicates ({duplicateGroups.length})
                </button>
                {mergeAllConfirming && (
                  <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-[#423e42] bg-[#201f21] p-3 shadow-xl">
                    <p className="mb-2 text-xs text-[#8F8978]">
                      Merge {duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0)} notion(s) into their most-connected
                      duplicate:
                    </p>
                    <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-xs text-[#696A61]">
                      {duplicateGroups.map((group) => (
                        <li key={group[0].id}>
                          {group.slice(1).map((n) => n.label).join(", ")} → <span className="text-[#8F8978]">{group[0].label}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <button
                        onClick={mergeAllDuplicates}
                        disabled={mergingAll}
                        className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {mergingAll ? "Merging…" : "Merge all"}
                      </button>
                      <button
                        onClick={() => setMergeAllConfirming(false)}
                        className="rounded border border-[#423e42] px-2 py-1 text-xs text-[#8F8978] hover:bg-[#322f33]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setBackupOpen(true)}
              className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
            >
              Backup
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1.35fr] lg:gap-8">
          <div className="min-w-0">
            <details><summary className="cursor-pointer text-xs text-[#8F8978]">Chat settings</summary><div className="mt-2"><ModeToggle mode={mode} onChange={setMode}/><p className="mt-2 text-xs text-[#8F8978]">Course generation always adds the teaching context needed to explain your slides.</p></div></details>
          </div>

          <div className="flex items-center gap-3">
            <NextLink
              href="/study"
              className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
            >
              Course & review
            </NextLink>
            <NextLink
              href="/interview"
              className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
            >
              Interview
            </NextLink>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-end lg:gap-4">
            <div className="flex items-center gap-3 lg:border-l lg:border-[#423e42] lg:pl-4">
              <NextLink
                href="/progress"
                className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
              >
                Progress
              </NextLink>
              <NextLink
                href="/browse"
                className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
              >
                Browse
              </NextLink>
              <button
                onClick={() => setDocumentsOpen(true)}
                className="rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33]"
              >
                Import slides
              </button>
            </div>
            <SearchBar notions={notions} query={query} onQueryChange={setQuery} onPickNotion={focusNode} />
          </div>
        </div>
      </header>
      </div>
      <div
        onPointerDown={(e) => headerResize.onDragStart(e, () => headerContentRef.current?.scrollHeight ?? 140)}
        onMouseEnter={() => setHeaderHandleHover(true)}
        onMouseLeave={() => setHeaderHandleHover(false)}
        title="Drag to resize"
        className="flex h-2 w-full shrink-0 cursor-row-resize flex-col items-center justify-center gap-0.5 bg-[#201f21]"
      >
        <span style={gripLineStyle(headerHandleHover, true)} />
        <span style={gripLineStyle(headerHandleHover, true)} />
      </div>

      {decomposeError && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-300">
          {decomposeError}
        </div>
      )}
      {goFurtherError && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-300">
          {goFurtherError}
        </div>
      )}
      {adeptError && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-300">
          {adeptError}
        </div>
      )}

      {undoAction && (
        <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#423e42] bg-[#201f21] px-4 py-2.5 text-sm text-[#D4C6A6] shadow-2xl">
          <span>{undoAction.message}</span>
          <button
            onClick={() => undoAction.perform()}
            className="rounded px-2 py-1 text-xs font-medium text-[#1c140d] bg-accent-300 hover:bg-accent-200"
          >
            Undo
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1">
          <Graph
            notions={notions}
            links={links}
            mastery={mastery}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            searchQuery={query}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onInit={setFlowInstance}
            onClearSearch={() => setQuery("")}
          />
          <Legend notions={notions} />
        </div>
        <div
          onPointerDown={sidePanelResize.onDragStart}
          onMouseEnter={() => setSidePanelHandleHover(true)}
          onMouseLeave={() => setSidePanelHandleHover(false)}
          title="Drag to resize"
          className="map-panel-resizer flex w-2 shrink-0 cursor-col-resize flex-row items-center justify-center gap-0.5 bg-[#201f21]"
        >
          <span style={gripLineStyle(sidePanelHandleHover, false)} />
          <span style={gripLineStyle(sidePanelHandleHover, false)} />
        </div>
        <div style={{ width: sidePanelResize.size ?? 420 }} data-selected={Boolean(selection)} className="map-side-panel h-full shrink-0">
          <button className="map-panel-back border-b border-[#423e42] px-4 py-3 text-sm text-accent-200" onClick={()=>setSelection(null)}>← Back to map</button>
          <SidePanel
            key={selection ? `${selection.kind}-${selection.id}` : "none"}
            selection={selectionForPanel}
            courseId={courseId}
            documents={documents}
            mastery={mastery}
            llmConfigured={llmConfigured}
            decomposing={decomposing}
            onDecompose={decompose}
            goingFurther={goingFurther}
            onGoFurther={goFurther}
            adeptGenerating={adeptGenerating}
            onGenerateAdept={generateAdept}
            onToggleStatus={toggleStatus}
            onEditNotion={updated=>setNotions(previous=>previous.map(n=>n.id===updated.id?updated:n))}
            chatMessages={chatMessages}
            chatLoading={chatLoading}
            onSendChat={sendChat}
            onDelete={deleteNotionHandler}
            similarNotion={similarNotion}
            onMerge={mergeNotionHandler}
            allNotions={notions}
          />
        </div>
      </div>

      <DocumentsPanel
        open={documentsOpen}
        onClose={() => setDocumentsOpen(false)}
        documents={documents}
        llmConfigured={llmConfigured}
        onUpload={uploadDocument}
        onGenerate={generateFromDocument}
        mode={mode}
        onDelete={deleteDocumentHandler}
        generatingId={generatingId}
        uploadError={uploadError}
        generateError={generateError}
        generateInfo={generateInfo}
      />

      <BackupPanel courseId={courseId} open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  );
}

function Legend({ notions }: { notions: Notion[] }) {
  const domains = [...new Set(notions.map((n) => n.domain))].sort();
  return (
    <div
      title="Each color is a thematic area of the subject (like a course chapter) that the AI grouped notions into — not a fixed taxonomy, just whatever areas this course's own content actually covers."
      className="pointer-events-auto absolute bottom-4 left-4 rounded-lg border border-[#423e42] bg-[#201f21]/90 p-3 text-xs shadow-lg backdrop-blur"
    >
      {domains.map((domain) => {
        const color = colorForDomain(domain);
        return (
          <div key={domain} className="flex items-center gap-1.5 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}99` }} />
            <span className="text-[#8F8978]">{domain}</span>
          </div>
        );
      })}
    </div>
  );
}
