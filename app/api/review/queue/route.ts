import { getReviewSettings } from "@/lib/qualityDb";
import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getDueDrillCards } from "@/lib/drill";

async function handleGET(request:Request) {
  const mode=new URL(request.url).searchParams.get('mode')==='notions'?'notions':'qa';
  const cards = await getDueDrillCards(getReviewSettings().sessionLimit,mode);
  return NextResponse.json({ cards });
}

export const GET = courseRoute(handleGET);
