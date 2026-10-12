import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph } from "@/lib/db";

async function handleGET() {
  const graph = getGraph(true);
  return NextResponse.json(graph);
}

export const GET = courseRoute(handleGET);
