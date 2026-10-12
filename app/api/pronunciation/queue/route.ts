import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getDuePronunciationCards } from "@/lib/db";

async function handleGET() {
  const due = getDuePronunciationCards(20);
  return NextResponse.json({ cards: due });
}

export const GET = courseRoute(handleGET);
