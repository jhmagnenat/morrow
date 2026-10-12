import { NextResponse } from "next/server";
import { setActiveCourse } from "@/lib/courses";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!setActiveCourse(id)) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true },{headers:{'Set-Cookie':`morrow-course=${id}; Path=/; SameSite=Lax; Max-Age=31536000; HttpOnly`}});
}
