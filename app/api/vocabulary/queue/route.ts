import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getDueVocabularyCards } from "@/lib/db";

async function handleGET() {
  return NextResponse.json({ cards: getDueVocabularyCards(20) });
}

export const GET = courseRoute(handleGET);
