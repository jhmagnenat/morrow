import { NextResponse } from "next/server";
import { deleteCourse, getActiveCourseId, listCourses, renameCourse } from "@/lib/courses";
import { deletePdfFilesForCourse } from "@/lib/pdfStorage";
import {withCourse} from '@/lib/courseScope';
import {createRecoveryPoint} from '@/lib/recovery';
import {openDb} from '@/lib/db';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (name.length < 1) {
    return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
  }
  const course = renameCourse(id, name);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json({ course });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = listCourses();
  if(!before.some(c=>c.id===id))return NextResponse.json({error:'Course not found'},{status:404});
  if (before.length <= 1) {
    return NextResponse.json({ error: "Can't delete the only remaining course." }, { status: 422 });
  }
  withCourse(id,()=>{createRecoveryPoint('before-delete-course');openDb().exec('DELETE FROM generation_claims');});
  const courses = deleteCourse(id);
  deletePdfFilesForCourse(id);
  return NextResponse.json({ courses, activeCourseId: getActiveCourseId() });
}
