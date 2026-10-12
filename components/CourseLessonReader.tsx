"use client";
import {useState} from 'react';
import type {TeachingLesson} from '@/lib/teachingCourse';
import {teachingOriginLabel} from '@/lib/teachingCourse';

export default function CourseLessonReader({lessons}:{lessons:TeachingLesson[]}) {
  const [selected,setSelected]=useState('');
  // Multiple immutable lesson versions remain in backups for card provenance.
  // Present the most recent reconstruction for each page group.
  const current=[...new Map([...lessons].sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).map(l=>[`${l.documentId}:${l.pages.join(',')}`,l])).values()].sort((a,b)=>a.documentId.localeCompare(b.documentId)||Math.min(...a.pages)-Math.min(...b.pages));
  const index=Math.max(0,current.findIndex(l=>l.id===selected)),lesson=current[index];
  if(!lesson)return null;
  return <section className="mx-auto max-w-3xl space-y-6 px-6 py-8">
    <div><h2 className="text-lg font-semibold text-[#D4C6A6]">Your explained course</h2><p className="mt-2 text-sm text-[#aaa596]">Read the explanation, then practise recall, understanding and application in Review.</p></div>
    <label className="block text-sm text-[#aaa596]">Course section<select className="mt-2 block w-full rounded border border-[#423e42] bg-[#28262a] p-2" value={lesson.id} onChange={e=>setSelected(e.target.value)}>{current.map(l=><option key={l.id} value={l.id}>{l.title} · slides {l.pages.join(', ')}</option>)}</select></label>
    <p className="text-xs text-[#aaa596]">Added context is an AI teaching explanation, not a transcript of your lecturer. Model review reduces errors; it does not certify correctness.</p>
    {lesson.units.map(unit=><article key={unit.id} className="space-y-3 rounded border border-[#423e42] p-5"><h3 className="font-semibold text-[#D4C6A6]">{unit.title}</h3>{unit.claims.map(claim=><div key={claim.id}><span className="text-xs text-accent-300">{teachingOriginLabel(claim.origin)}</span><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#c4beb0]">{claim.statement}</p></div>)}</article>)}
    {!lesson.units.length&&<p className="text-sm text-[#aaa596]">No reliable teaching explanation could be reconstructed for this section yet.</p>}
    {lesson.unresolved.length>0&&<details className="rounded border border-amber-600/50 p-4"><summary className="cursor-pointer text-sm text-amber-300">{lesson.unresolved.length} point(s) need clarification</summary><ul className="mt-3 space-y-3 text-sm text-[#aaa596]">{lesson.unresolved.map((u,i)=><li key={i}><p>{u.statement}</p><p className="text-xs text-amber-300">{u.reason}</p></li>)}</ul></details>}
    <div className="flex flex-wrap gap-3">{lesson.pages.map(page=><a key={page} className="text-xs text-accent-300 underline" href={`/api/documents/${encodeURIComponent(lesson.documentId)}/file#page=${page}`} target="_blank" rel="noreferrer">Original slide {page}</a>)}</div>
    <div className="flex justify-between text-sm text-[#aaa596]"><button disabled={index===0} className="disabled:opacity-30" onClick={()=>setSelected(current[index-1].id)}>← Previous section</button><button disabled={index+1===current.length} className="disabled:opacity-30" onClick={()=>setSelected(current[index+1].id)}>Next section →</button></div>
  </section>;
}
