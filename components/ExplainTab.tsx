"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { StudySessionContext, useStudyState } from "@/lib/useStudySession";
import { useCourseFetch } from '@/lib/useCourseFetch';
import { colorForDomain, type Notion } from "@/lib/types";
import { EXPLAIN_LEVELS, EXPLAIN_LEVEL_LABELS, type ExplainLevel } from "@/lib/explain";
import type { PronunciationCard } from "@/lib/db";

interface ExplainTabProps {
  allNotions: Notion[];
  llmConfigured: boolean;
  onPracticePronunciation: (card: PronunciationCard) => void;
}

interface AttemptResult {
  id?: string;
  verdict: "pass" | "retry";
  feedback: string;
  coveredKeywords: string[];
  missingKeywords: string[];
  answerText: string;
  correctedText?: string;
  exampleAnswer?: string;
}

interface ExplainSetup {
  level: ExplainLevel;
  prompt: string;
  requiredKeywords: string[];
  history: AttemptResult[];
}

interface WritingPattern {
  name: string;
  example: string;
  betterVersion: string;
  why: string;
}

const restoreSelectedId = (value: unknown) => typeof value === "string" || value === null ? value : null;
const restoreLevel = (value: unknown): ExplainLevel | null => typeof value === "string" && EXPLAIN_LEVELS.includes(value as ExplainLevel) ? value as ExplainLevel : null;

export default function ExplainTab({ allNotions, llmConfigured, onPracticePronunciation }: ExplainTabProps) {
  const {courseId} = useContext(StudySessionContext);
  const fetch = useCourseFetch(courseId);
  const [query, setQuery] = useStudyState("explain-query", "");
  const [selectedId, setSelectedId] = useStudyState<string | null>("explain-notion", null, restoreSelectedId);
  const selected = allNotions.find((notion) => notion.id === selectedId) ?? null;
  const setSelected = (notion: Notion | null) => setSelectedId(notion?.id ?? null);
  const [level, setLevel] = useStudyState<ExplainLevel>("explain-level", "child", restoreLevel);
  const [setup, setSetup] = useState<ExplainSetup | null>(null);
  const [history, setHistory] = useState<AttemptResult[]>([]);
  const [answer, setAnswer] = useStudyState("explain-answer", "");
  const [unaided, setUnaided] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passedLevels, setPassedLevels] = useState<Set<ExplainLevel>>(new Set());
  const [showWorkQuestions, setShowWorkQuestions] = useState(false);
  const [generatingPronunciation, setGeneratingPronunciation] = useState<Record<string, boolean>>({});
  const [patterns, setPatterns] = useState<WritingPattern[] | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [patternsError, setPatternsError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allNotions.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allNotions]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/notions/${selected.id}/explain?level=${level}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load this explanation.");
        return r.json();
      })
      .then((data: ExplainSetup) => {
        setSetup(data);
        setHistory(data.history);
        if (data.history.some((a) => a.verdict === "pass")) {
          setPassedLevels((prev) => new Set(prev).add(level));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSubmitError(error instanceof Error ? error.message : "Could not load this explanation.");
      });
    return () => controller.abort();
  }, [selected, level, fetch]);

  const pickNotion = (n: Notion) => {
    setUnaided(false);
    setSelected(n);
    setLevel("child");
    setQuery("");
    setPassedLevels(new Set());
    setAnswer("");
    setSubmitError(null);
    setShowWorkQuestions(false);
  };

  const changeLevel = (lvl: ExplainLevel) => {
    setUnaided(false);
    setLevel(lvl);
    setAnswer("");
    setSubmitError(null);
  };

  const submit = async () => {
    if (!selected || answer.trim().length < 10) return;
    setSubmitting(true);
    setSubmitError(null);
    const answerText = answer;
    try {
      const res = await fetch(`/api/notions/${selected.id}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, text: answerText, unaided }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Grading failed.");
        return;
      }
      setHistory((prev) => [...prev, { ...data.attempt, answerText }]);
      setAnswer("");
      setUnaided(false);
      if (data.attempt.verdict === "pass") {
        setPassedLevels((prev) => new Set(prev).add(level));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const practicePronunciation = async (attempt: AttemptResult) => {
    if (!selected || !attempt.correctedText) return;
    const key = attempt.id ?? attempt.answerText;
    setGeneratingPronunciation((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/pronunciation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: attempt.correctedText,
          notionId: selected.id,
          sourceAttemptId: attempt.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onPracticePronunciation(data.card);
      }
    } finally {
      setGeneratingPronunciation((prev) => ({ ...prev, [key]: false }));
    }
  };

  const analyzePatterns = async () => {
    setPatternsLoading(true);
    setPatternsError(null);
    try {
      const res = await fetch("/api/explain/patterns");
      const data = await res.json();
      if (!res.ok) {
        setPatternsError(data.error ?? "Could not analyze patterns.");
        return;
      }
      setPatterns(data.patterns);
    } finally {
      setPatternsLoading(false);
    }
  };

  if (!selected) {
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        <p className="mb-4 text-sm text-[#8F8978]">
          Pick a notion to explain. You&apos;ll write it three ways — to a child, to a non-expert
          colleague, then to a fellow practitioner — and get corrected at each level.
        </p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a notion…"
          className="w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
        />
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md border border-[#423e42] bg-[#28262a]">
            {matches.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => pickNotion(n)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#8F8978] hover:bg-[#322f33]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorForDomain(n.domain) }}
                  />
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 border-t border-[#423e42] pt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-[#8F8978]">Personal writing patterns</p>
            <button
              onClick={analyzePatterns}
              disabled={!llmConfigured || patternsLoading}
              title={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
              className="text-xs text-accent-400 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {patternsLoading ? "Analyzing…" : "Analyze my patterns"}
            </button>
          </div>
          <p className="mb-3 text-xs text-[#696A61]">
            Looks across your past Explain answers for habits you repeat — hedging, roundabout phrasing,
            passive voice — and suggests a more direct way to say the same thing.
          </p>

          {patternsError && <p className="text-xs text-amber-400">{patternsError}</p>}

          {patterns && patterns.length === 0 && (
            <p className="text-xs text-[#696A61]">No recurring pattern found yet — your phrasing looks consistent.</p>
          )}

          {patterns && patterns.length > 0 && (
            <ul className="space-y-3">
              {patterns.map((p, i) => (
                <li key={i} className="rounded-md border border-[#423e42] bg-[#201f21] p-3">
                  <p className="mb-1.5 text-xs font-semibold text-[#D4C6A6]">{p.name}</p>
                  <p className="text-xs text-[#696A61]">
                    <span className="text-amber-400">You wrote:</span> &ldquo;{p.example}&rdquo;
                  </p>
                  <p className="mt-1 text-xs text-[#8F8978]">
                    <span className="text-emerald-400">Try instead:</span> &ldquo;{p.betterVersion}&rdquo;
                  </p>
                  <p className="mt-1 text-[11px] italic text-[#696A61]">{p.why}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const color = colorForDomain(selected.domain);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-8">
      <button onClick={() => setSelected(null)} className="mb-4 shrink-0 text-xs text-[#696A61] hover:text-[#8F8978]">
        ← Choose a different notion
      </button>

      <div className="mb-4 flex shrink-0 items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: color }}>
          {selected.domain}
        </span>
        <h2 className="text-lg font-semibold text-[#D4C6A6]">{selected.label}</h2>
      </div>

      {selected.workQuestions && selected.workQuestions.length > 0 && (
        <div className="mb-5 shrink-0">
          <button
            onClick={() => setShowWorkQuestions((v) => !v)}
            className="text-xs text-[#696A61] hover:text-[#8F8978]"
          >
            {showWorkQuestions ? "▾" : "▸"} Asked on the job
          </button>
          {showWorkQuestions && (
            <ul className="mt-2 space-y-1.5 rounded-md border border-[#423e42] bg-[#201f21] p-3">
              {selected.workQuestions.map((wq, i) => (
                <li key={i} className="text-sm text-[#8F8978]">
                  &ldquo;{wq.question}&rdquo;
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-5 flex shrink-0 gap-2">
        {EXPLAIN_LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => changeLevel(lvl)}
            className={
              level === lvl
                ? "rounded-md border border-accent-400/40 bg-accent-300 px-3 py-1.5 text-xs font-medium text-[#1c140d]"
                : "rounded-md border border-[#423e42] bg-[#201f21] px-3 py-1.5 text-xs text-[#8F8978] hover:bg-[#322f33]"
            }
          >
            {passedLevels.has(lvl) && "✓ "}
            {EXPLAIN_LEVEL_LABELS[lvl]}
          </button>
        ))}
      </div>

      {setup && (
        <>
          <p className="mb-3 shrink-0 text-sm leading-relaxed text-[#8F8978]">{setup.prompt}</p>

          {setup.requiredKeywords.length > 0 && (
            <div className="mb-4 flex shrink-0 flex-wrap gap-1.5">
              {setup.requiredKeywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded border border-[#423e42] bg-[#28262a] px-2 py-0.5 text-xs text-[#8F8978]"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="mb-4 max-h-[40vh] space-y-3 overflow-y-auto rounded-md border border-[#423e42] bg-black/20 p-3">
              {history.map((attempt, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-lg bg-accent-500/20 px-3 py-1.5 text-sm text-accent-100">
                      {attempt.answerText}
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <div
                      className={
                        attempt.verdict === "pass"
                          ? "max-w-[85%] rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
                          : "max-w-[85%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
                      }
                    >
                      <p
                        className={
                          attempt.verdict === "pass"
                            ? "mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400"
                            : "mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400"
                        }
                      >
                        {attempt.verdict === "pass" ? "Pass" : "Keep refining"}
                      </p>
                      <p className="text-sm leading-relaxed text-[#8F8978]">{attempt.feedback}</p>
                      {attempt.coveredKeywords.length > 0 && (
                        <p className="mt-1.5 text-xs text-[#696A61]">
                          <span className="text-emerald-400">Covered:</span>{" "}
                          {attempt.coveredKeywords.join(", ")}
                        </p>
                      )}
                      {attempt.missingKeywords.length > 0 && (
                        <p className="text-xs text-[#696A61]">
                          <span className="text-amber-400">Missing:</span>{" "}
                          {attempt.missingKeywords.join(", ")}
                        </p>
                      )}
                      {attempt.exampleAnswer && (
                        <div className="mt-2 border-t border-[#423e42] pt-2">
                          <p className="text-[10px] uppercase tracking-wide text-[#696A61]">Example explanation</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-[#8F8978]">{attempt.exampleAnswer}</p>
                        </div>
                      )}
                      {attempt.correctedText && attempt.correctedText !== attempt.answerText && (
                        <div className="mt-2 border-t border-[#423e42] pt-2">
                          <p className="text-[10px] uppercase tracking-wide text-[#696A61]">Native phrasing</p>
                          <p className="mt-0.5 text-sm italic leading-relaxed text-[#8F8978]">
                            {attempt.correctedText}
                          </p>
                          <button
                            onClick={() => practicePronunciation(attempt)}
                            disabled={generatingPronunciation[attempt.id ?? attempt.answerText]}
                            className="mt-1.5 text-xs text-accent-400 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {generatingPronunciation[attempt.id ?? attempt.answerText]
                              ? "Preparing…"
                              : "Practice saying this →"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto shrink-0">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              placeholder={history.length > 0 ? "Refine your explanation…" : "Write your explanation here…"}
              className="w-full resize-none rounded-md border border-[#423e42] bg-[#28262a] p-3 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
            />
            <label className="mt-2 block text-xs text-[#8F8978]"><input type="checkbox" checked={unaided} onChange={e => setUnaided(e.target.checked)} className="mr-2"/>I reconstructed the explanation without notes or hints</label>

            <button
              onClick={submit}
              disabled={!llmConfigured || submitting || answer.trim().length < 10}
              title={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
              className="mt-3 rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2 text-sm text-[#D4C6A6] hover:bg-[#1d2829] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Grading…" : history.length > 0 ? "Submit again" : "Submit for feedback"}
            </button>

            {submitError && <p className="mt-2 text-xs text-red-400">{submitError}</p>}
          </div>
        </>
      )}
    </div>
  );
}
