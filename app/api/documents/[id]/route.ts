import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { deleteDocument, getGraph } from "@/lib/db";
import { deletePdfFile } from "@/lib/pdfStorage";

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = getGraph().documents.some((d) => d.id === id);
  if (!exists) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  deleteDocument(id);
  deletePdfFile(id);
  return NextResponse.json({ ok: true });
}

export const DELETE = courseRoute(handleDELETE);
