import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getProgressStats } from "@/lib/db";

async function handleGET() {
  return NextResponse.json(getProgressStats());
}

export const GET = courseRoute(handleGET);
