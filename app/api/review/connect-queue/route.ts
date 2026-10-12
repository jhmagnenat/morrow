import { getReviewSettings } from "@/lib/qualityDb";
import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getDueLinks } from "@/lib/db";

async function handleGET() {
  const due = getDueLinks(getReviewSettings().sessionLimit);
  return NextResponse.json({ cards: due });
}

export const GET = courseRoute(handleGET);
