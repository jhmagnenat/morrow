import NotionEditor from "@/components/NotionEditor";
import { useEffect, useState } from "react";
import { colorForDomain, type Document, type Link, type Notion } from "@/lib/types";
import type { ChatTurn } from "@/lib/llm";
import type { MasteryInfo } from "@/lib/mastery";
import ChatPanel from "@/components/ChatPanel";
import ClairReader from '@/components/ClairReader';
import {teachingQualityIssues} from '@/lib/contentQuality';

export type Selection =
  | { kind: "node"; notion: Notion }
  | { kind: "edge"; link: Link; source: Notion; target: Notion };

const MASTERY_BADGE: Record<MasteryInfo["level"], { label: string; color: string }> = {
  unknown: { label: "Untested", color: "#696A61" },
  weak: { label: "Weak", color: "#ef4444" },
  learning: { label: "Learning", color: "#f97316" },
  developing: { label: "Developing", color: "#eab308" },
  mastered: { label: "Mastered", color: "#22c55e" },
};

interface SidePanelProps {
  courseId:string;
  selection: Selection | null;
  documents: Document[];
  mastery: Record<string, MasteryInfo>;
  llmConfigured: boolean;
  decomposing: boolean;
  onDecompose: (notionId: string) => void;
  goingFurther: boolean;
  onGoFurther: (notionId: string) => void;
  adeptGenerating: boolean;
  onGenerateAdept: (notionId: string) => void;
  onToggleStatus: (notionId: string) => void;
  onEditNotion: (notion:Notion)=>void;
  chatMessages: ChatTurn[];
  chatLoading: boolean;
  onSendChat: (text: string) => void;
  onDelete: (notionId: string) => void;
  similarNotion: Notion | null;
  onMerge: (fromId: string, intoId: string) => void;
  allNotions: Notion[];
}

export default function SidePanel({
  courseId,
  selection,
  documents,
  mastery,
  llmConfigured,
  decomposing,
  onDecompose,
  goingFurther,
  onGoFurther,
  adeptGenerating,
  onGenerateAdept,
  onToggleStatus,
  onEditNotion,
  chatMessages,
  chatLoading,
  onSendChat,
  onDelete,
  similarNotion,
  onMerge,
  allNotions,
}: SidePanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");

  // Delete/Backspace opens the same confirmation the ✕ button does —
  // never deletes outright, a destructive action still needs that click.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selection || selection.kind !== "node") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      setConfirmingDelete(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  if (!selection) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center border-l border-[#423e42] bg-[#201f21] p-6 text-center text-sm text-[#696A61]">
        Click a node or a link in the graph to see its details here.
      </aside>
    );
  }

  if (selection.kind === "edge") {
    const { link, source, target } = selection;
    return (
      <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-[#423e42] bg-[#201f21] p-5">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#696A61]">
          {link.type.replace("-", " ")}
        </h3>
        <div className="mb-4 flex items-center gap-1.5 text-sm font-medium text-[#D4C6A6]">
          <span style={{ color: colorForDomain(source.domain) }}>{source.label}</span>
          <span className="text-[#696A61]">→</span>
          <span style={{ color: colorForDomain(target.domain) }}>{target.label}</span>
        </div>
        <p className="text-sm leading-relaxed text-[#8F8978]">{link.description}</p>
        {link.evidence?.map((e,i)=><blockquote key={i} className="my-3 border-l-2 border-accent-400 pl-3 text-xs"><a className="text-accent-300" target="_blank" rel="noreferrer" href={`/api/documents/${e.documentId}/file#page=${e.page}`}>Slide {e.page}</a><p>{e.quote}</p></blockquote>)}
      </aside>
    );
  }

  const { notion } = selection;
  const definitionIssues=teachingQualityIssues(notion.label,notion.definition);
  const explanationIssues=teachingQualityIssues(notion.label,notion.explanation??'');
  const color = colorForDomain(notion.domain);
  const masteryInfo = mastery[notion.id];
  const masteryBadge = MASTERY_BADGE[masteryInfo?.level ?? "unknown"];

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-[#423e42] bg-[#201f21] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}66` }}
        >
          {notion.domain}
        </span>
        <span
          className="flex items-center gap-1 rounded-full border border-[#423e42] bg-[#28262a] px-2 py-0.5 text-xs text-[#8F8978]"
          title="Mastery — derived from Drill/Connect/Explain/Interview performance, separate from the SRS review schedule"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: masteryBadge.color }} />
          {masteryBadge.label}
        </span>
        <button
          onClick={() => onToggleStatus(notion.id)}
          className={
            notion.status === "draft"
              ? "rounded border border-dashed border-[#696A61] px-2 py-0.5 text-xs text-[#696A61] hover:border-[#8F8978] hover:text-[#8F8978]"
              : "rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-500/20"
          }
          title="Click to toggle draft/validated"
        >
          {notion.status === "draft" ? "Draft" : "Validated"}
        </button>

        <button
          onClick={() => setConfirmingDelete(true)}
          title="Delete this notion"
          className="ml-auto rounded px-1.5 py-0.5 text-xs text-[#696A61] hover:bg-red-500/10 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      <NotionEditor key={notion.id} courseId={courseId} notion={notion} onSave={onEditNotion}/>
      <p className="mb-3 text-xs text-[#8F8978]">Content: {notion.layer ?? "legacy / unclassified"}</p>
      {!!notion.evidence?.length && <details className="mb-3 text-xs text-[#8F8978]">
        <summary className="cursor-pointer text-accent-300">Sources · {notion.evidence.length} references</summary>
        <div className="mt-3">{notion.evidence.map((e,i)=><blockquote key={i} className="mb-3 border-l-2 border-accent-400 pl-3"><a target="_blank" rel="noreferrer" href={`/api/documents/${e.documentId}/file#page=${e.page}`} className="text-accent-300">Slide {e.page}</a><p>{e.quote || e.visualDescription}</p></blockquote>)}</div>
      </details>}
      {confirmingDelete && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
          <p className="mb-2">
            Delete &quot;{notion.label}&quot; and every link touching it? This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onDelete(notion.id)}
              className="rounded border border-red-500/40 bg-red-500/20 px-2 py-1 text-red-200 hover:bg-red-500/30"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-[#423e42] px-2 py-1 text-[#8F8978] hover:bg-[#322f33]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {similarNotion && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          <p className="mb-2">
            This looks like it might be a duplicate of <strong>{similarNotion.label}</strong>.
          </p>
          <button
            onClick={() => onMerge(notion.id, similarNotion.id)}
            className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-amber-200 hover:bg-amber-500/30"
          >
            Merge into &quot;{similarNotion.label}&quot;
          </button>
        </div>
      )}

      <div className="mb-3">
        {mergePickerOpen ? (
          <div className="rounded-md border border-[#423e42] bg-[#201f21] p-2.5">
            <input
              autoFocus
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              placeholder="Search a notion to merge into…"
              className="mb-2 w-full rounded border border-[#423e42] bg-[#28262a] px-2 py-1 text-xs text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
            />
            {mergeQuery.trim().length > 0 && (
              <ul className="max-h-36 space-y-0.5 overflow-y-auto">
                {allNotions
                  .filter(
                    (n) =>
                      n.id !== notion.id &&
                      n.label.toLowerCase().includes(mergeQuery.trim().toLowerCase())
                  )
                  .slice(0, 6)
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          onMerge(notion.id, n.id);
                          setMergePickerOpen(false);
                          setMergeQuery("");
                        }}
                        className="block w-full truncate rounded px-2 py-1 text-left text-xs text-[#8F8978] hover:bg-[#322f33]"
                        title={`Merge "${notion.label}" into "${n.label}"`}
                      >
                        {n.label}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <button
              onClick={() => {
                setMergePickerOpen(false);
                setMergeQuery("");
              }}
              className="mt-1 text-xs text-[#696A61] hover:text-[#8F8978]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setMergePickerOpen(true)}
            className="text-xs text-[#696A61] hover:text-[#8F8978]"
          >
            Merge with another notion…
          </button>
        )}
      </div>

      <h2 className="mb-2 text-lg font-semibold text-[#D4C6A6]">{notion.label}</h2>

      {notion.grounding === "inferred" && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
          ⚠ The source material here was too sparse to ground this in (e.g. a bare slide bullet) —
          this explanation was filled in from the AI&apos;s general knowledge instead. Worth
          double-checking against the real source.
        </div>
      )}

      <div className="mb-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">Quick answer</p>
        {definitionIssues.length?<p role="alert" className="text-sm text-amber-300">This definition needs correction against the original course before it can be used for learning.</p>:<p className="text-sm font-medium leading-relaxed text-[#8F8978]">{notion.definition}</p>}
      </div>

      {notion.contentWarnings?.length?<p role="alert" className="mb-5 text-sm text-amber-300">The source or lesson changed after verification. Reprocess the original source before studying this explanation.</p>:notion.clair ? <div className="mb-5"><ClairReader key={notion.id} lesson={notion.clair} conceptLabel={notion.label}/></div> : explanationIssues.length?<p role="alert" className="mb-5 text-sm text-amber-300">This explanation needs correction. Open its original source slides and edit the content before studying it.</p>:notion.explanation ? (
        <div className="mb-5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">Explanation</p>
          <div className="space-y-3">
            {notion.explanation
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-[#8F8978]">
                  {paragraph}
                </p>
              ))}
          </div>
        </div>
      ) : (
        <p className="mb-5 text-xs italic text-[#696A61]">
          No detailed explanation yet — decompose it or ask about it below to flesh it out.
        </p>
      )}

      {notion.courseContext && (
        <div className="mb-5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">In this course</p>
          <p className="text-sm italic leading-relaxed text-[#8F8978]">{notion.courseContext}</p>
        </div>
      )}


      {notion.workQuestions && notion.workQuestions.length > 0 && (
        <div className="mb-5 space-y-3 rounded-md border border-[#423e42] bg-[#201f21] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-400">
            On the job, you might get asked
          </p>
          <ul className="space-y-3">
            {notion.workQuestions.map((wq, i) => (
              <li key={i}>
                <p className="text-sm font-medium leading-relaxed text-[#D4C6A6]">{wq.question}</p>
                {wq.answer ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-[#8F8978]">{wq.answer}</p>
                ) : (
                  <p className="mt-0.5 text-xs italic text-[#696A61]">No saved answer yet.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notion.adept && (
        <div className="mb-5 space-y-3 rounded-md border border-[#423e42] bg-[#201f21] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-400">ADEPT breakdown</p>
          {(
            [
              ["Analogy", notion.adept.analogy],
              ["Diagram", notion.adept.diagram],
              ["Example", notion.adept.example],
              ["Plain English", notion.adept.plainEnglish],
              ["Technical", notion.adept.technical],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <p className="text-xs font-medium text-[#8F8978]">{label}</p>
              <p className="text-sm leading-relaxed text-[#8F8978]">{text}</p>
            </div>
          ))}
        </div>
      )}

      {notion.goFurther && (
        <div className="mb-5 space-y-3 rounded-md border border-[#423e42] bg-[#201f21] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-400">Go further</p>
          {(
            [
              ["More examples", notion.goFurther.moreExamples],
              ["What comes next", notion.goFurther.nextStep],
              ["Worth looking into", notion.goFurther.references],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <p className="text-xs font-medium text-[#8F8978]">{label}</p>
              <p className="text-sm leading-relaxed text-[#8F8978]">{text}</p>
            </div>
          ))}
        </div>
      )}

      {notion.sources.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#696A61]">
            Sources
          </h3>
          <ul className="space-y-1.5">
            {notion.sources.map((source, index) => {
              const doc = documents.find((d) => d.id === source.documentId);
              return (
                <li key={index} className="text-sm text-[#8F8978]">
                        <span className="font-medium text-[#8F8978]">{doc?.title ?? source.documentId}</span><span className="text-[#696A61]"> — p. {source.page}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-5 space-y-2 border-t border-[#423e42] pt-4">
        <button
          onClick={() => onDecompose(notion.id)}
          disabled={!llmConfigured || decomposing}
          title={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
          className="w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {decomposing ? "Breaking down…" : "Break down into sub-notions"}
        </button>
        <button
          onClick={() => onGoFurther(notion.id)}
          disabled={!llmConfigured || goingFurther}
          title={
            llmConfigured
              ? "Adds more examples, the next direction, and references to this notion's own text"
              : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"
          }
          className="w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {goingFurther ? "Looking ahead…" : notion.goFurther ? "Regenerate go further" : "Go further →"}
        </button>
        <button
          onClick={() => onGenerateAdept(notion.id)}
          disabled={!llmConfigured || adeptGenerating}
          title={
            llmConfigured
              ? "Explain via analogy, diagram, example, plain English, and the technical definition"
              : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"
          }
          className="w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {adeptGenerating ? "Breaking it down…" : notion.adept ? "Regenerate ADEPT breakdown" : "Explain with ADEPT"}
        </button>
      </div>

      <ChatPanel
        messages={chatMessages}
        loading={chatLoading}
        disabled={!llmConfigured}
        disabledReason={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
        onSend={onSendChat}
      />
    </aside>
  );
}
