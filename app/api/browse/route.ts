import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getAllCardsForBrowse } from "@/lib/db";

async function handleGET() {
  return NextResponse.json({ cards: getAllCardsForBrowse() });
}

export const GET = courseRoute(handleGET);
