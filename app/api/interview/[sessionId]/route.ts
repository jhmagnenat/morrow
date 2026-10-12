import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getInterviewSessionById } from "@/lib/db";

async function handleGET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = getInterviewSessionById(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export const GET = courseRoute(handleGET);
