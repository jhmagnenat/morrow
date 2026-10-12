import { courseRoute,scopedCourseId,withCourse } from "@/lib/courseScope";
import { NextResponse,after } from "next/server";
import {reviewMaintenance} from '@/lib/reviewMaintenance';
import {reviewRevision} from '@/lib/reviewSync';
import { cardExists, gradeCard, openDb, type CardType } from "@/lib/db";
import { getStudyCard } from "@/lib/qualityDb";
import type { Grade } from "@/lib/srs";

const VALID_GRADES: Grade[] = ["again", "hard", "good", "easy"];
const VALID_CARD_TYPES: CardType[] = ["notion", "link", "pronunciation", "vocabulary"];

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ cardType: string; cardId: string }> }
) {
  const { cardType, cardId } = await params;
  const body = (await request.json().catch(() => ({}))) as { grade?: string; requestId?: string; baseRevision?:string; reviewedAt?:string; previousRequestId?:string };

  if (!VALID_CARD_TYPES.includes(cardType as CardType)) {
    return NextResponse.json(
      { error: "cardType must be 'notion', 'link', 'pronunciation', or 'vocabulary'" },
      { status: 400 }
    );
  }
  if (!VALID_GRADES.includes(body.grade as Grade)) {
    return NextResponse.json({ error: "grade must be one of again/hard/good/easy" }, { status: 400 });
  }
  if (!cardExists(cardType as CardType, cardId)) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  if ((cardType==="notion" || cardType==="link") && getStudyCard(cardId)?.status!=="ready") return NextResponse.json({error:"Approve this card in Browse before reviewing"},{status:409});
  const db=openDb(), requestId=typeof body.requestId==="string" && body.requestId.length<=100 ? `${cardType}:${cardId}:${body.requestId}` : null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous=requestId ? db.prepare("SELECT payload FROM review_requests WHERE id=?").get(requestId) : undefined;
    if(previous){db.exec("COMMIT");return NextResponse.json(JSON.parse(String(previous.payload)));}
    let reviewedAt:Date|undefined;
    if(body.baseRevision!==undefined||body.reviewedAt!==undefined){
      const time=typeof body.reviewedAt==='string'?Date.parse(body.reviewedAt):NaN;
      if(!requestId||typeof body.baseRevision!=='string'||!Number.isFinite(time)||time>Date.now()+60000||time<Date.now()-30*86400000){
        db.exec('ROLLBACK');return NextResponse.json({error:'Invalid or expired offline review; the local answer is preserved'},{status:400});
      }
      let expectedRevision=body.baseRevision;
      if(body.previousRequestId!==undefined){
        if(typeof body.previousRequestId!=='string'||!body.previousRequestId.length||body.previousRequestId.length>100){
          db.exec('ROLLBACK');return NextResponse.json({error:'Invalid preceding offline review'},{status:400});
        }
        const parent=db.prepare('SELECT payload FROM review_requests WHERE id=?').get(`${cardType}:${cardId}:${body.previousRequestId}`);
        const receipt=parent?JSON.parse(String(parent.payload)):undefined;
        if(!receipt?.revision||!receipt.reviewedAt||Date.parse(receipt.reviewedAt)>=time){
          db.exec('ROLLBACK');return NextResponse.json({error:'The preceding offline review is missing or out of order; the local answer is preserved',conflict:true},{status:409});
        }
        expectedRevision=receipt.revision;
      }
      if(reviewRevision(cardType as CardType,cardId)!==expectedRevision){
        db.exec('ROLLBACK');return NextResponse.json({error:'This card was reviewed, edited or reset on another device; the offline answer is preserved',conflict:true},{status:409});
      }
      reviewedAt=new Date(time);
    }
    const state=db.prepare("SELECT interval_days,due_at FROM review_state WHERE card_type=? AND card_id=?").get(cardType,cardId);
    // A second tab or a delayed response cannot grade the same scheduled review twice.
    if(state && String(state.due_at)>(reviewedAt??new Date()).toISOString()) {
      if(reviewedAt){db.exec('ROLLBACK');return NextResponse.json({error:'This card was not due at the offline review time',conflict:true},{status:409});}
      db.exec("COMMIT");return NextResponse.json({intervalDays:Number(state.interval_days),dueAt:String(state.due_at),alreadyReviewed:true});
    }
    const scheduled=gradeCard(cardType as CardType,cardId,body.grade as Grade,reviewedAt);
    const result={...scheduled,revision:reviewRevision(cardType as CardType,cardId),reviewedAt:(reviewedAt??new Date()).toISOString()};
    if(requestId)db.prepare("INSERT INTO review_requests VALUES(?,?)").run(requestId,JSON.stringify(result));
    db.exec("COMMIT");
    const course=scopedCourseId(),maintenance=()=>withCourse(course,reviewMaintenance);
    try{after(maintenance);}catch{queueMicrotask(()=>void maintenance());}
    return NextResponse.json(result);
  }catch(error){db.exec("ROLLBACK");throw error;}
}

export const POST = courseRoute(handlePOST);
