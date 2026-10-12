import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { cardExists, deleteCard, type CardType } from "@/lib/db";

const VALID_CARD_TYPES: CardType[] = ["notion", "link", "pronunciation", "vocabulary"];

async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ cardType: string; cardId: string }> }
) {
  const { cardType, cardId } = await params;

  if (!VALID_CARD_TYPES.includes(cardType as CardType)) {
    return NextResponse.json(
      { error: "cardType must be 'notion', 'link', 'pronunciation', or 'vocabulary'" },
      { status: 400 }
    );
  }
  if (!cardExists(cardType as CardType, cardId)) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  deleteCard(cardType as CardType, cardId);
  return NextResponse.json({ ok: true });
}

export const DELETE = courseRoute(handleDELETE);
