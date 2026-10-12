import Link from "next/link";
import { getAllInterviewSessions } from "@/lib/db";
import { isLlmConfigured } from "@/lib/llm";
import InterviewClient from "@/components/InterviewClient";
import {scopedCourseId} from '@/lib/courseScope';
import {withRequestCourse} from '@/lib/requestCourse';

export const dynamic = "force-dynamic";

function renderInterviewPage() {
  const sessions = getAllInterviewSessions();

  return (
    <div className="min-h-full bg-[#1a1a1b]">
      <header className="flex items-center gap-4 border-b border-[#423e42] bg-[#201f21] px-5 py-3">
        <Link href="/" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          ← Back to graph
        </Link>
        <Link href="/study" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          Study →
        </Link>
        <h1 className="ml-auto text-base font-semibold tracking-tight text-[#D4C6A6]">Interview</h1>
      </header>
      <InterviewClient key={scopedCourseId()} courseId={scopedCourseId()} initialSessions={sessions} llmConfigured={isLlmConfigured()} />
    </div>
  );
}
export default function InterviewPage() {return withRequestCourse(renderInterviewPage);}
