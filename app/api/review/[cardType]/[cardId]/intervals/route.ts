import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { cardExists, getReviewState, type CardType } from "@/lib/db";
import { nextReviewState, type Grade } from "@/lib/srs";
async function handleGET(_request:Request,{params}:{params:Promise<{cardType:string;cardId:string}>}) {
  const {cardType,cardId}=await params;
  if (!["notion","link","pronunciation","vocabulary"].includes(cardType) || !cardExists(cardType as CardType,cardId)) return NextResponse.json({error:"Card not found"},{status:404});
  const state=getReviewState(cardType as CardType,cardId);
  return NextResponse.json({labels:(["again","hard","good","easy"] as Grade[]).map(g=>{const days=nextReviewState(state,g).intervalDays;return days<1/24?`${Math.round(days*1440)} min`:days<1?`${Math.round(days*24)} h`:`${days} d`;})});
}

export const GET = courseRoute(handleGET);
