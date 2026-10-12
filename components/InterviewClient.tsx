"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InterviewSession } from "@/lib/db";
import { useCourseFetch } from '@/lib/useCourseFetch';

interface InterviewClientProps {
  courseId: string;
  initialSessions: InterviewSession[];
  llmConfigured: boolean;
}

type Mode = "setup" | "live" | "review";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function remainingSeconds(session: InterviewSession): number {
  const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
  return session.durationMinutes * 60 - elapsed;
}

export default function InterviewClient({ initialSessions, llmConfigured, courseId }: InterviewClientProps) {
  const fetch = useCourseFetch(courseId);
  const [mode, setMode] = useState<Mode>("setup");
  const [sessions, setSessions] = useState(initialSessions);
  const [active, setActive] = useState<InterviewSession | null>(null);

  const [jobTitle, setJobTitle] = useState("");
  const [interviewKind, setInterviewKind] = useState<'job' | 'course'>('job');
  const [unaided, setUnaided] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const completingRef = useRef(false);

  const refreshHistory = async () => {
    const res = await fetch("/api/interview");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
  };

  const finishInterview = async (sessionId: string) => {
    if (completingRef.current) return;
    completingRef.current = true;
    const res = await fetch(`/api/interview/${sessionId}/complete`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setActive(data.session);
      setMode("review");
      refreshHistory();
    }
    completingRef.current = false;
  };

  const remaining = active ? remainingSeconds(active) : 0;
  void tick; // forces a re-render every second so `remaining` is recomputed live

  // Re-render every second while a session is live so the countdown stays
  // current, derived fresh from the real clock each tick (not stored state)
  // so it's correct even after a reload mid-session. The time-up check lives
  // inside the same timer callback rather than a separate effect body.
  useEffect(() => {
    if (mode !== "live" || !active) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      if (remainingSeconds(active) <= 0) finishInterview(active.id);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, active?.id]);

  const startInterview = async () => {
    if (interviewKind === 'job' && jobTitle.trim().length < 2 || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const form = new FormData();
      form.set('mode', interviewKind);
      form.set("jobTitle", jobTitle.trim());
      if (jobDescription.trim()) form.set("jobDescription", jobDescription.trim());
      if (coverLetter.trim()) form.set("coverLetter", coverLetter.trim());
      if (cvFile) form.set("cv", cvFile);
      form.set("durationMinutes", "20");

      const res = await fetch("/api/interview/start", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error ?? "Could not start the interview.");
        return;
      }
      const session: InterviewSession = data.session;
      const firstUnanswered = session.exchanges.findIndex((e) => !e.answer);
      setActive(session);
      setQuestionIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
      setAnswer("");
      setUnaided(false);
      setAnswerError(null);
      setMode("live");
    } catch {
      setStartError("Network error while starting the interview.");
    } finally {
      setStarting(false);
    }
  };

  const submitAnswer = async () => {
    if (!active || answer.trim().length < 3 || submitting) return;
    setSubmitting(true);
    setAnswerError(null);
    try {
      const res = await fetch(`/api/interview/${active.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex, answerText: answer.trim(), unaided }),
      });
      const data = await res.json();
      if (res.ok) {
        setActive({ ...active, exchanges: data.exchanges });
        setAnswer("");
      } else setAnswerError(data.error ?? 'Your answer could not be saved. Please try again.');
    } catch {setAnswerError('Your answer could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuestion = () => {
    setUnaided(false);
    setAnswerError(null);
    if (!active) return;
    if (questionIndex + 1 >= active.exchanges.length) {
      finishInterview(active.id);
    } else {
      setQuestionIndex((i) => i + 1);
      setAnswer("");
    }
  };

  const resumeOrReview = (session: InterviewSession) => {
    if (session.status === "completed") {
      setActive(session);
      setMode("review");
      return;
    }
    const r = remainingSeconds(session);
    if (r <= 0) {
      finishInterview(session.id);
      return;
    }
    const firstUnanswered = session.exchanges.findIndex((e) => !e.answer);
    setActive(session);
    setQuestionIndex(firstUnanswered === -1 ? session.exchanges.length - 1 : firstUnanswered);
    setAnswer("");
    setMode("live");
  };

  const backToSetup = () => {
    setActive(null);
    setJobTitle("");
    setJobDescription("");
    setCvFile(null);
    setMode("setup");
  };

  const currentExchange = active?.exchanges[questionIndex];
  const answeredSoFar = useMemo(() => active?.exchanges.filter((e) => e.answer).length ?? 0, [active]);

  if (mode === "live" && active && currentExchange) {
    const urgent = remaining < 120;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#8F8978]">
            Question {questionIndex + 1} / {active.exchanges.length} — {active.jobTitle}
          </span>
          <span className={urgent ? "font-semibold text-red-400" : "font-semibold text-accent-300"}>
            {formatClock(remaining)}
          </span>
        </div>

        <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-6">
          <p className="text-base leading-relaxed text-[#D4C6A6]">{currentExchange.question}</p>
        </div>

        {currentExchange.feedback ? (
          <>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Feedback</p>
              <p className="text-sm leading-relaxed text-[#8F8978]">{currentExchange.feedback}</p>
            </div>
            {currentExchange.correctedAnswer && (
              <div className="space-y-2 rounded-md border border-[#423e42] bg-[#201f21] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#696A61]">
                  Say it better next time
                </p>
                <div>
                  <p className="text-xs font-medium text-[#696A61]">You said</p>
                  <p className="text-sm leading-relaxed text-[#8F8978]">{currentExchange.answer}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-accent-400">Next time, say</p>
                  <p className="text-sm leading-relaxed text-[#D4C6A6]">{currentExchange.correctedAnswer}</p>
                </div>
              </div>
            )}
            <button
              onClick={nextQuestion}
              className="rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2.5 text-sm text-[#D4C6A6] hover:bg-[#1d2829]"
            >
              {questionIndex + 1 >= active.exchanges.length ? "Finish interview" : "Next question →"}
            </button>
          </>
        ) : (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Type your answer as you would say it out loud…"
              className="w-full resize-none rounded-md border border-[#423e42] bg-[#201f21] p-3 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
            />
            {currentExchange?.learningDimension === 'reconstruction' && <label className="text-xs text-[#8F8978]"><input type="checkbox" checked={unaided} onChange={e => setUnaided(e.target.checked)} className="mr-2"/>I answered without consulting notes or hints</label>}
            {answerError && <p role="alert" className="text-xs text-red-400">{answerError}</p>}
            <div className="flex gap-2">
              <button
                onClick={submitAnswer}
                disabled={submitting || answer.trim().length < 3}
                className="rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2.5 text-sm text-[#D4C6A6] hover:bg-[#1d2829] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Grading…" : "Submit answer"}
              </button>
              <button
                onClick={() => finishInterview(active.id)}
                className="rounded-md border border-[#423e42] bg-[#201f21] px-4 py-2.5 text-sm text-[#696A61] hover:bg-[#322f33]"
              >
                End interview now
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (mode === "review" && active) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <button onClick={backToSetup} className="mb-4 text-xs text-[#696A61] hover:text-[#8F8978]">
          ← Start a new interview
        </button>
        <h2 className="mb-1 text-lg font-semibold text-[#D4C6A6]">{active.jobTitle}</h2>
        <p className="mb-5 text-xs text-[#696A61]">
          {new Date(active.startedAt).toLocaleString()} · {answeredSoFar} of {active.exchanges.length} questions
          answered
        </p>

        {active.summary && (
          <div className="mb-6 rounded-md border border-accent-500/30 bg-accent-500/10 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
              Overall assessment
            </p>
            <p className="text-sm leading-relaxed text-[#D4C6A6]">{active.summary}</p>
          </div>
        )}

        <div className="space-y-4">
          {active.exchanges.map((e, i) => (
            <div key={i} className="rounded-md border border-[#423e42] bg-[#201f21] p-3">
              <p className="mb-1.5 text-sm font-medium text-[#D4C6A6]">
                Q{i + 1}. {e.question}
              </p>
              {e.answer ? (
                <>
                  <p className="mb-1.5 text-sm text-[#8F8978]">{e.answer}</p>
                  <p className="text-xs text-emerald-300">{e.feedback}</p>
                  {e.correctedAnswer && (
                    <p className="mt-1.5 text-xs text-accent-400">
                      <span className="font-medium">Next time: </span>
                      {e.correctedAnswer}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[#696A61]">Not answered</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8 rounded-lg border border-[#423e42] bg-[#201f21] p-5">
        <h2 className="mb-1 text-base font-semibold text-[#D4C6A6]">Start a mock interview</h2>
        <p className="mb-4 text-xs text-[#696A61]">
          {interviewKind === 'course' ? 'Explain mechanisms, connect ideas and solve source-based situations. Your weakest skills guide the questions.' : '20 minutes, in English, tailored to the role and your CV — with feedback after each answer.'}
        </p>

        <label className="mb-1 block text-xs text-[#696A61]" htmlFor="interview-kind">Practice</label>
        <select id="interview-kind" value={interviewKind} onChange={e => setInterviewKind(e.target.value as 'job' | 'course')} className="mb-3 w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6]"><option value="job">Job interview</option><option value="course">Course understanding · C.L.A.I.R.</option></select>
        <div hidden={interviewKind === 'course'}>

        <label className="mb-1 block text-xs text-[#696A61]">Job title</label>
        <input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
          className="mb-3 w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
        />

        <label className="mb-1 block text-xs text-[#696A61]">Job description (optional)</label>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={3}
          placeholder="Paste the job posting, or leave blank"
          className="mb-3 w-full resize-none rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
        />

        <label className="mb-1 block text-xs text-[#696A61]">Your CV (PDF, optional)</label>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full text-xs text-[#8F8978] file:mr-3 file:rounded file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-xs file:text-[#D4C6A6] hover:file:bg-white/[0.14]"
        />

        <label className="mb-1 block text-xs text-[#696A61]">Cover letter (optional)</label>
        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={4}
          placeholder="Paste the same cover letter you sent to the recruiter, so questions reflect what they already know about you"
          className="mb-4 w-full resize-none rounded-md border border-[#423e42] bg-[#28262a] px-3 py-2 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
        />

        </div>
        <button
          onClick={startInterview}
          disabled={!llmConfigured || starting || interviewKind === 'job' && jobTitle.trim().length < 2}
          title={llmConfigured ? undefined : "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL to enable"}
          className="rounded-md border border-[#423e42] bg-[#322f33] px-4 py-2.5 text-sm text-[#D4C6A6] hover:bg-[#1d2829] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? "Preparing questions…" : "Start interview"}
        </button>
        {startError && <p className="mt-2 text-xs text-red-400">{startError}</p>}
      </div>

      <h3 className="mb-3 text-sm font-semibold text-[#8F8978]">Past sessions</h3>
      {sessions.length === 0 ? (
        <p className="text-sm text-[#696A61]">No interviews yet.</p>
      ) : (
        <div className="divide-y divide-white/[0.06] rounded-lg border border-[#423e42] bg-[#201f21]">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => resumeOrReview(s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <span>
                <span className="block text-sm text-[#D4C6A6]">{s.jobTitle}</span>
                <span className="block text-xs text-[#696A61]">{new Date(s.startedAt).toLocaleString()}</span>
              </span>
              <span
                className={
                  s.status === "completed"
                    ? "rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-300"
                    : "rounded px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300"
                }
              >
                {s.status === "completed" ? "completed" : "in progress"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
