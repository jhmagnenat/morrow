import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from '@/lib/dataDirectory';
import {currentUser} from '@/lib/identityScope';

// Each "course" is a fully independent workspace — its own documents,
// notions, links, and every SRS deck — backed by its own SQLite file (see
// lib/db.ts's dbPathForCourse). Switching courses just repoints which file
// openDb() talks to; nothing else in the app needs to know courses exist.
export interface Course {
  id: string;
  name: string;
  createdAt: string;
}

export const DEFAULT_COURSE_ID = "default";

const registryPath = () => path.join(dataDirectory(), 'courses.json');

function readRegistry(): Course[] {
  if (!fs.existsSync(registryPath())) {
    const initial: Course[] = [
      { id: currentUser()?.storageId&&currentUser()?.storageId!=='local'?randomUUID():DEFAULT_COURSE_ID, name: "My course", createdAt: new Date().toISOString() },
    ];
    writeRegistry(initial);
    return initial;
  }
  try {
    return parseRegistry(fs.readFileSync(registryPath(), "utf-8"));
  } catch {
    // A damaged registry must never silently hide existing workspaces.
    return parseRegistry(fs.readFileSync(`${registryPath()}.bak`, 'utf8'));
  }
}

function parseRegistry(text:string):Course[]{
  const courses=JSON.parse(text);
  if(!Array.isArray(courses)||!courses.length||courses.some(c=>!c||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(c.id)||typeof c.name!=='string'||typeof c.createdAt!=='string')||new Set(courses.map(c=>c.id)).size!==courses.length)throw Error('Invalid course registry');
  return courses;
}

function writeRegistry(courses: Course[]) {
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  const text=JSON.stringify(courses,null,2),temporary=`${registryPath()}.${randomUUID()}.tmp`;
  try{
    fs.writeFileSync(temporary,text,{flag:'wx'});
    const backupTemporary=`${temporary}.bak`;
    try{fs.writeFileSync(backupTemporary,text,{flag:'wx'});fs.renameSync(backupTemporary,`${registryPath()}.bak`);}
    finally{if(fs.existsSync(backupTemporary))fs.unlinkSync(backupTemporary);}
    fs.renameSync(temporary,registryPath());
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

// In-memory for the life of the dev server process. Stored on `global`
// (not a plain module-level `let`) for the same reason lib/db.ts caches its
// connections there: Next.js dev/Turbopack can give different route
// handlers their own copy of a module's top-level state, so a plain `let`
// here silently failed to propagate a course switch to other routes — e.g.
// POST /api/courses/[id]/activate would update its own copy while GET
// /api/graph kept reading a separate, still-null copy and fell back to the
// first course every time, making every "other" course look identical to
// the first. `global` is the one thing guaranteed to be shared process-wide.
declare global {
  var __activeCourseId: string | null | undefined;
  var __activeWorkspaceCourses:Map<string,string>|undefined;
}

export function getActiveCourseId(): string {
  if(currentUser())return globalThis.__activeWorkspaceCourses?.get(dataDirectory())??readRegistry()[0].id;
  if (global.__activeCourseId) return global.__activeCourseId;
  const courses = readRegistry();
  global.__activeCourseId = courses[0]?.id ?? DEFAULT_COURSE_ID;
  return global.__activeCourseId;
}

export function listCourses(): Course[] {
  return readRegistry();
}

export function createCourse(name: string): Course {
  const courses = readRegistry();
  const course: Course = { id: randomUUID(), name, createdAt: new Date().toISOString() };
  courses.push(course);
  writeRegistry(courses);
  return course;
}

export function setActiveCourse(id: string): boolean {
  const courses = readRegistry();
  if (!courses.some((c) => c.id === id)) return false;
  global.__activeCourseId = id;
  if(currentUser())(globalThis.__activeWorkspaceCourses??=new Map()).set(dataDirectory(),id);
  return true;
}

export function renameCourse(id: string, name: string): Course | null {
  const courses = readRegistry();
  const course = courses.find((c) => c.id === id);
  if (!course) return null;
  course.name = name;
  writeRegistry(courses);
  return course;
}

// Refuses to delete the last remaining course — the app always needs at
// least one workspace to point at. Returns the (possibly unchanged) list.
export function deleteCourse(id: string): Course[] {
  const all = readRegistry();
  if (all.length <= 1) return all;
  const remaining = all.filter((c) => c.id !== id);
  if (remaining.length === all.length) return all; // id didn't exist
  writeRegistry(remaining);
  if (global.__activeCourseId === id) global.__activeCourseId = null;
  if(globalThis.__activeWorkspaceCourses?.get(dataDirectory())===id)globalThis.__activeWorkspaceCourses.delete(dataDirectory());
  return remaining;
}
