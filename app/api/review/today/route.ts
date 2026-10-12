import { getReviewSettings } from "@/lib/qualityDb";
import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getTodayQueue } from "@/lib/today";

async function handleGET() {
  const cards = await getTodayQueue(getReviewSettings().sessionLimit);
  return NextResponse.json({ cards });
}

export const GET = courseRoute(handleGET);
