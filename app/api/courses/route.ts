import { NextResponse } from "next/server";
import { createCourse, listCourses, setActiveCourse } from "@/lib/courses";
import {courseRoute,scopedCourseId} from '@/lib/courseScope';

export const GET=courseRoute(async()=>NextResponse.json({courses:listCourses(),activeCourseId:scopedCourseId()}));

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (name.length < 1) {
    return NextResponse.json({ error: "Give the new course a name." }, { status: 400 });
  }

  const course = createCourse(name);
  setActiveCourse(course.id); // starting a new course switches straight into its empty workspace
  return NextResponse.json({ course },{headers:{'Set-Cookie':`morrow-course=${course.id}; Path=/; SameSite=Lax; Max-Age=31536000; HttpOnly`}});
}
