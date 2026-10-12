"use client";

import { useState } from "react";
import type { Document, GenerationMode } from "@/lib/types";
import type {DocumentGenerationJob} from '@/lib/documentGeneration';

interface DocumentWithStats extends Document {
  passageCount: number;
  generatedPassageCount: number;
  generationJob?:DocumentGenerationJob;
}

interface DocumentsPanelProps {
  open: boolean;
  onClose: () => void;
  documents: DocumentWithStats[];
  llmConfigured: boolean;
  onUpload: (file: File, title: string) => Promise<boolean>;
  onGenerate: (documentId: string, enrichment?:boolean, options?:{cardDetail:'key-ideas'|'comprehensive';pages?:number[];reprocess?:boolean}) => Promise<void>;
  mode:GenerationMode;
  onDelete: (documentId: string) => Promise<void>;
  generatingId: string | null;
  uploadError: string | null;
  generateError: string | null;
  generateInfo: string | null;
}

export default function DocumentsPanel({
  open,
  onClose,
  documents,
  llmConfigured,
  onUpload,
  onGenerate,
  onDelete,
  generatingId,
  uploadError,
  generateError,
  generateInfo,
}: DocumentsPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cardDetail,setCardDetail]=useState<'key-ideas'|'comprehensive'>('key-ideas');
  const [pageSelection,setPageSelection]=useState('');
  const [selectionError,setSelectionError]=useState('');
  const generate=async(documentId:string,pageCount:number|undefined,reprocess:boolean)=>{
    const pages=pageSelection.trim()?Array.from(new Set(pageSelection.split(',').map(s=>Number(s.trim())))):undefined;
    if(pages&&(!pages.length||pages.length>3||pages.some(p=>!Number.isInteger(p)||p<1||p>(pageCount??0)))){setSelectionError('Choose up to 3 page numbers, separated by commas.');return;}
    setSelectionError('');await onGenerate(documentId,true,{cardDetail,pages,reprocess:reprocess||Boolean(pages)});
  };
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      if(await onUpload(file, title)){
        setFile(null);
        setTitle("");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[560px] flex-col overflow-hidden rounded-lg border border-[#423e42] bg-[#201f21] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#423e42] px-5 py-3">
          <h2 className="font-display text-base font-medium tracking-wide text-accent-200">Documents</h2>
          <a href="/browse" className="text-xs text-accent-300">Sources, drafts & coverage</a>
          <button onClick={onClose} className="text-[#696A61] hover:text-[#8F8978]">
            ✕
          </button>
        </div>

        <div className="space-y-2 border-b border-[#423e42] p-5">
          <p className="text-xs text-[#696A61]">
            Import your course slides. The AI reconstructs the missing explanations,
            then creates cards for recall, understanding, distinctions and application.
          </p>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-[#8F8978] file:mr-3 file:rounded file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:text-[#D4C6A6] hover:file:bg-white/[0.14]"
          />
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional — defaults to filename)"
              className="flex-1 rounded-md border border-[#423e42] bg-[#28262a] px-2.5 py-1.5 text-xs text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
            />
            <button
              onClick={submit}
              disabled={!file || uploading}
              className="rounded-md border border-[#423e42] bg-[#322f33] px-3 text-xs text-[#D4C6A6] hover:bg-[#1d2829] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 space-y-3 text-xs text-[#aaa596]">
            <label className="block">What to learn <select className="ml-2 rounded border border-[#423e42] bg-[#28262a] p-2" value={cardDetail} onChange={e=>setCardDetail(e.target.value as 'key-ideas'|'comprehensive')}><option value="key-ideas">Essential ideas (recommended)</option><option value="comprehensive">Detailed coverage</option></select></label>
            <label className="block">Pages <input className="ml-2 w-40 rounded border border-[#423e42] bg-[#28262a] p-2" placeholder="All, or e.g. 19,20" value={pageSelection} onChange={e=>setPageSelection(e.target.value)}/></label>
            <p>Start with 1–3 slides. Read the reconstructed explanation in Course, check the cards, then Review. Added teaching context is identified separately from the slides.</p>
            {!llmConfigured&&<p className="text-amber-300">New explanations and cards need an AI provider. Existing courses and revisions remain available. A local Ollama model can run without API credits.</p>}
            {selectionError&&<p role="alert" className="text-red-400">{selectionError}</p>}
          </div>
          {documents.length === 0 ? (
            <p className="text-xs text-[#696A61]">No documents uploaded yet.</p>
          ) : (
            <ul className="space-y-3">
              {documents.map((doc) => {
                const remaining = doc.passageCount - doc.generatedPassageCount;
                const fullyGenerated = doc.passageCount > 0 && remaining <= 0;
                return (
                  <li
                    key={doc.id}
                    className="rounded-md border border-[#423e42] bg-[#201f21] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[#D4C6A6]">{doc.title}</p>
                        <p className="text-xs text-[#696A61]">
                          {doc.pageCount ?? "?"} pages · {doc.generatedPassageCount}/{doc.passageCount}{" "}
                          passages processed
                          {fullyGenerated && " · done"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => generate(doc.id,doc.pageCount,fullyGenerated)}
                          disabled={!llmConfigured || generatingId === doc.id}
                          title={
                            !llmConfigured
                              ? "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"
                              : fullyGenerated
                                ? "Regenerate with these choices; edits and review history are preserved"
                                : undefined
                          }
                          className="rounded-md border border-[#423e42] bg-[#28262a] px-2.5 py-1.5 text-xs text-[#D4C6A6] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {generatingId === doc.id
                            ? "Generating…"
                            : fullyGenerated
                              ? "Rebuild course & cards"
                              : doc.generationJob?.status==='needs_review' || doc.generationJob?.status==='failed'
                                ? "Retry incomplete pages"
                              : doc.generatedPassageCount > 0
                                ? "Resume generation"
                                : "Explain & create cards"}
                        </button>
                        {!fullyGenerated&&doc.generatedPassageCount>0&&<button disabled={!llmConfigured||generatingId===doc.id} onClick={()=>generate(doc.id,doc.pageCount,true)} className="rounded border border-[#423e42] px-2 py-1.5 text-xs text-[#aaa596]" title="Reprocess the selected pages or entire document; edits and review history are preserved">Rebuild</button>}
                        <button
                          onClick={() => setConfirmingDeleteId(doc.id)}
                          title="Remove this source document"
                          className="rounded px-1.5 py-1.5 text-xs text-[#696A61] hover:bg-red-500/10 hover:text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {doc.generationJob?.status==='needs_review' && (
                      <p className="mt-2 text-xs text-accent-300">
                        {doc.generationJob.readyCards??0} ready cards · {doc.generationJob.draftCards??0} drafts.{' '}
                        <a href="/browse" className="underline">Review sources and coverage</a>
                      </p>
                    )}

                    {confirmingDeleteId === doc.id && (
                      <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                        <p className="mb-1.5">
                          Remove &quot;{doc.title}&quot;? Its extracted passages are deleted and any
                          notion citing it loses that source (the notion itself stays).
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setDeletingId(doc.id);
                              try {
                                await onDelete(doc.id);
                              } finally {
                                setDeletingId(null);
                                setConfirmingDeleteId(null);
                              }
                            }}
                            disabled={deletingId === doc.id}
                            className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-red-200 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === doc.id ? "Removing…" : "Remove"}
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteId(null)}
                            className="rounded border border-[#423e42] px-2 py-1 text-[#8F8978] hover:bg-[#322f33]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {generateInfo && <p className="mt-3 text-xs text-accent-300">{generateInfo}</p>}
          {generateError && <p className="mt-3 text-xs text-red-400">{generateError}</p>}
          {(/no credits remaining|insufficient[_ ](?:quota|credits)|credit balance|billing/i.test(generateError??'')||documents.some(d=>/no credits remaining|insufficient[_ ](?:quota|credits)|credit balance/i.test(d.generationJob?.error??'')))&&<p className="mt-3 text-xs text-amber-300">AI credits are exhausted. Your saved course, cards and review history remain available. Add provider credits or configure a local Ollama model before restarting generation.</p>}
        </div>
      </div>
    </div>
  );
}
