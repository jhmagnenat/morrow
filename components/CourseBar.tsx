"use client";

import { useEffect, useState } from "react";
import XpBar from "@/components/XpBar";
import WorkspaceTools from '@/components/WorkspaceTools';
import {initializeOfflineStudy} from '@/lib/offlineStudy';

interface Course {
  id: string;
  name: string;
  createdAt: string;
}

// A slim bar across the very top of the app, like Claude.ai's conversation
// list — lets you switch between fully independent courses (each with its
// own documents/notions/decks) or start a brand new, empty one. Mounted
// once in the root layout so it's present on every page.
export default function CourseBar() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  useEffect(()=>{if(activeCourseId)initializeOfflineStudy(activeCourseId);},[activeCourseId]);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.ok?r.json():null)
      .then((data) => {
        if(!data||!Array.isArray(data.courses))return;
        setCourses(data.courses);
        setActiveCourseId(data.activeCourseId);
      }).catch(()=>{});
  }, []);

  const switchTo = async (id: string) => {
    if (id === activeCourseId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${id}/activate`, { method: "POST" });
      // A full reload, deliberately: switching courses repoints the server's
      // active DB connection, so every server-fetched page needs a fresh
      // request, not a soft client-side navigation that could reuse cached data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (res.ok) window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  const createCourse = async () => {
    const name = newName.trim();
    if (name.length < 1 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- same reason as switchTo above: forces a fresh server fetch against the new course's empty DB
      if (res.ok) window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  const startRenaming = (c: Course) => {
    setEditingId(c.id);
    setEditingValue(c.name);
  };

  const commitRename = async () => {
    const id = editingId;
    const name = editingValue.trim();
    setEditingId(null);
    if (!id || name.length < 1) return;
    const res = await fetch(`/api/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = await res.json();
      setCourses((prev) => prev.map((c) => (c.id === id ? data.course : c)));
    }
  };

  if (courses.length === 0) return null;

  return (
    <div className="course-bar flex items-center justify-between gap-1.5 border-b border-[#423e42] bg-[#201f21] px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {courses.map((c) =>
          editingId === c.id ? (
            <input
              key={c.id}
              autoFocus
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-32 rounded border border-accent-400/60 bg-[#28262a] px-2 py-0.5 text-xs text-[#D4C6A6] focus:outline-none"
            />
          ) : (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              onDoubleClick={() => startRenaming(c)}
              title="Double-click to rename"
              className={
                c.id === activeCourseId
                  ? "rounded px-2.5 py-1 text-xs font-medium text-[#1c140d] bg-accent-300"
                  : "rounded px-2.5 py-1 text-xs text-[#696A61] hover:bg-[#322f33] hover:text-[#8F8978]"
              }
            >
              {c.name}
            </button>
          )
        )}

        {creating ? (
          <span className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCourse();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Course name…"
              className="w-36 rounded border border-[#423e42] bg-[#28262a] px-2 py-0.5 text-xs text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none"
            />
            <button
              onClick={createCourse}
              disabled={busy || newName.trim().length < 1}
              className="rounded px-2.5 py-1 text-xs font-medium text-[#1c140d] bg-accent-400 hover:bg-accent-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create
            </button>
          </span>
        ) : (
          <button onClick={() => setCreating(true)} className="rounded px-2 py-1 text-xs text-[#696A61] hover:text-[#8F8978]">
            + New course
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3"><XpBar />{activeCourseId&&<WorkspaceTools courseId={activeCourseId}/>}</div>
    </div>
  );
}
