import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getMasteryMap } from "@/lib/db";

async function handleGET() {
  return NextResponse.json({ mastery: getMasteryMap() });
}

export const GET = courseRoute(handleGET);
