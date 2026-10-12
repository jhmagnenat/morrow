import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { completeInterviewSession, getInterviewSessionById } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";

interface SummaryResult {
  summary: string;
}

async function handlePOST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getInterviewSessionById(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
  }
  if (session.status === "completed") {
    return NextResponse.json({ session });
  }

  const answered = session.exchanges.filter((e) => e.answer);
  if (answered.length === 0) {
    completeInterviewSession(sessionId, "No questions were answered in this session.");
    return NextResponse.json({ session: getInterviewSessionById(sessionId) });
  }
  if (session.mode === 'course') {
    const skills = [...new Set(answered.map(e => e.learningDimension).filter(Boolean))];
    const summary = skills.map(skill => {
      const scores = answered.filter(e => e.learningDimension === skill).map(e => e.score ?? 0);
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return `${skill}: ${average < 0.55 ? 'review the reasoning and try a new situation' : average < 0.8 ? 'develop with another task' : 'successful on the tested tasks'}.`;
    }).join('\n');
    completeInterviewSession(sessionId, summary);
    return NextResponse.json({session: getInterviewSessionById(sessionId)});
  }

  const transcript = answered
    .map((e, i) => `Q${i + 1}: ${e.question}\nAnswer: ${e.answer}\nFeedback given: ${e.feedback}`)
    .join("\n\n");

  const system =
    "You are an experienced hiring manager wrapping up a mock interview debrief, entirely in English, for the " +
    `role of "${session.jobTitle}". Based on everything the candidate answered, give a holistic closing ` +
    "assessment: overall strengths across the interview, the most important areas to improve, and one or two " +
    "concrete, actionable suggestions for how they'd prepare better next time. Write it the way a hiring " +
    "manager would actually summarize a candidate after the fact — direct and specific, not generic praise.";

  const userPrompt = `Full interview transcript (${answered.length} of ${session.exchanges.length} questions answered):\n\n${transcript}`;

  let result: SummaryResult;
  try {
    result = await structuredCompletion<SummaryResult>(
      system,
      userPrompt,
      "summarize_interview",
      "Give a holistic closing assessment of the candidate's interview performance.",
      {
        type: "object",
        properties: {
          summary: { type: "string", description: "A concrete, holistic closing assessment paragraph" },
        },
        required: ["summary"],
      }
    );
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  completeInterviewSession(sessionId, result.summary);
  return NextResponse.json({ session: getInterviewSessionById(sessionId) });
}

export const POST = courseRoute(handlePOST);
