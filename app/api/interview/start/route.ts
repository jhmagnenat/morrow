import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph, getMasteryMap, getPassagesForDocument, insertInterviewSession,openDb } from "@/lib/db";
import {getLearningGraph} from '@/lib/learningCurriculum';
import {readPdfFile} from '@/lib/pdfStorage';
import {createHash} from 'node:crypto';
import { courseTasks } from '@/lib/learningTasks';
import { clairQualityIssues, verifiesQuote,verifiedVisualEvidence } from '@/lib/contentQuality';
import { CLAIR_INSTRUCTIONS } from '@/lib/clair';
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";
import { extractPdfPages } from "@/lib/pdf";

const QUESTION_COUNT = 10;
const DEFAULT_DURATION_MINUTES = 20;

interface QuestionsResult {
  questions: Array<{ question: string; relatedNotionIds: string[] }>;
}

async function handlePOST(request: Request) {
  const formData = await request.formData();
  if (formData.get('mode') === 'course') {
    const graph = getLearningGraph(), passages = graph.documents.flatMap(d => getPassagesForDocument(d.id));
    const fingerprints:Record<string,string>={};
    for(const d of graph.documents){const pdf=readPdfFile(d.id);if(pdf)fingerprints[d.id]=createHash('sha256').update(pdf).digest('hex');}
    const supported=(s:NonNullable<(typeof graph.notions)[number]['clair']>['sources'][number])=>s.quote.trim()?verifiesQuote(s.quote,passages.filter(p=>p.documentId===s.documentId&&p.page===s.page).map(p=>p.text).join('\n')):verifiedVisualEvidence(s,fingerprints[s.documentId]);
    const grounded = graph.notions.filter(n => n.clair && !clairQualityIssues(n.label,n.clair).length && n.clair.sources.length>0 && n.clair.sources.every(supported));
    const previous=openDb().prepare("SELECT exchanges FROM interview_sessions ORDER BY started_at DESC LIMIT 20").all().flatMap(row=>JSON.parse(String(row.exchanges)) as Array<{question:string;answeredAt?:string}>);
    const questions = courseTasks(grounded, getMasteryMap(), QUESTION_COUNT,previous,fingerprints);
    if (!questions.length) return NextResponse.json({error: 'Generate source-grounded C.L.A.I.R. lessons from your course PDFs first.'}, {status: 422});
    const session = insertInterviewSession({jobTitle: 'Course understanding', jobDescription: '', cvText: '', coverLetter: '', durationMinutes: DEFAULT_DURATION_MINUTES, exchanges: questions});
    return NextResponse.json({session});
  }
  const jobTitle = (formData.get("jobTitle") as string | null)?.trim() ?? "";
  const jobDescription = (formData.get("jobDescription") as string | null)?.trim() ?? "";
  const coverLetter = (formData.get("coverLetter") as string | null)?.trim() ?? "";
  const cvFile = formData.get("cv");
  const durationRaw = formData.get("durationMinutes") as string | null;
  const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : DEFAULT_DURATION_MINUTES;

  if (jobTitle.length < 2) {
    return NextResponse.json({ error: "Give the job title you're interviewing for." }, { status: 400 });
  }

  let cvText = "";
  if (cvFile instanceof File && cvFile.size > 0) {
    if (cvFile.type !== "application/pdf" && !cvFile.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "CV must be a PDF file." }, { status: 400 });
    }
    const buffer = await cvFile.arrayBuffer();
    const pages = await extractPdfPages(buffer);
    cvText = pages.map((p) => p.text).join("\n\n");
  }

  const { notions } = getGraph();
  const mastery = getMasteryMap();
  const notionList = notions.map((n) => `${n.id} :: ${n.label} (${n.domain})`).join("\n");

  const system = CLAIR_INSTRUCTIONS + '\nPrioritize source-relevant technical questions for weak dimensions in the supplied learning progress. Keep professional and behavioral questions, but do not tag them as evidence of course understanding.\n' + JSON.stringify(mastery) + '\n' +
    "You are an experienced hiring manager preparing a realistic mock job interview, entirely in English. " +
    `Generate exactly ${QUESTION_COUNT} interview questions for the role of "${jobTitle}", tailored to the ` +
    "candidate's actual background when a CV and/or cover letter is provided (reference specific things from " +
    "them where relevant, don't just ask generic questions — a cover letter especially often states the " +
    "candidate's own motivation and framing, which a real interviewer would probe on). Cover a realistic mix " +
    "across the set: an opening background/introduction question, role-specific/technical questions, " +
    "behavioral questions (\"tell me about a time...\"), a situational/problem-solving question, and a " +
    "closing question (e.g. questions for us, or why this role). Order them the way a real interview would " +
    "flow: opening first, closing last. Keep each question concise and natural, the way an interviewer would " +
    "actually say it out loud.\n\n" +
    (notionList.length > 0
      ? "A separate knowledge map of course material the candidate has been studying is listed below. For " +
        "each question, set relatedNotionIds to the id(s) of any notion it genuinely, directly tests — most " +
        "questions (behavioral, \"tell me about a time\", generic culture-fit) test NOTHING on this list and " +
        "should get an empty array; only tag a notion when the question is actually asking about that " +
        "specific concept, not just loosely in the same field. Don't force it — an empty array is the right " +
        "answer far more often than not.\n\n" +
        `Course notions (id :: label (category)):\n${notionList}\n\n`
      : "");

  const userPrompt =
    `Job title: ${jobTitle}\n` +
    (jobDescription ? `Job description:\n${jobDescription}\n\n` : "") +
    (coverLetter ? `Candidate's cover letter:\n${coverLetter}\n\n` : "") +
    (cvText ? `Candidate's CV:\n${cvText}` : "No CV was provided — ask more general questions for this role.");

  let result: QuestionsResult;
  try {
    result = await structuredCompletion<QuestionsResult>(
      system,
      userPrompt,
      "generate_interview_questions",
      "Generate a realistic set of mock interview questions for this role and candidate.",
      {
        type: "object",
        properties: {
          questions: {
            type: "array",
            minItems: QUESTION_COUNT,
            maxItems: QUESTION_COUNT,
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                relatedNotionIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Empty in the common case — see instructions above",
                },
              },
              required: ["question", "relatedNotionIds"],
            },
          },
        },
        required: ["questions"],
      }
    );
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const validNotionIds = new Set(notions.map((n) => n.id));

  const session = insertInterviewSession({
    jobTitle,
    jobDescription,
    cvText,
    coverLetter,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : DEFAULT_DURATION_MINUTES,
    exchanges: result.questions.map((q) => ({
      question: q.question,
      relatedNotionIds: (q.relatedNotionIds ?? []).filter((id) => validNotionIds.has(id)),
    })),
  });

  return NextResponse.json({ session });
}

export const POST = courseRoute(handlePOST);
