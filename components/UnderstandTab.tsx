"use client";
import {useContext,useState} from 'react';
import {useRouter} from 'next/navigation';
import { StudySessionContext,useStudyState } from '@/lib/useStudySession';
import {useCourseFetch} from '@/lib/useCourseFetch';
import type { Notion } from '@/lib/types';
import ClairReader from '@/components/ClairReader';
import type {ClairLesson} from '@/lib/clair';
import {clairMatchesConcept,teachingQualityIssues} from '@/lib/contentQuality';
import CourseLessonReader from '@/components/CourseLessonReader';
import type {TeachingLesson} from '@/lib/teachingCourse';

export default function UnderstandTab({allNotions,lessons:courseLessons=[]}: {allNotions: Notion[];lessons?:TeachingLesson[]}) {
  const {courseId}=useContext(StudySessionContext),fetch=useCourseFetch(courseId),router=useRouter();
  const topics = allNotions.filter(n => n.layer !== 'organizer');
  const [selected, setSelected] = useStudyState('understand-topic', '', value => typeof value === 'string' ? value : null);
  const [lessons,setLessons]=useState<Record<string,{lesson:ClairLesson;baseline:string}>>({});
  const [pending,setPending]=useState<string[]>([]),[errors,setErrors]=useState<Record<string,string>>({});
  if(courseLessons.length)return <CourseLessonReader lessons={courseLessons}/>;
  const index = Math.max(0, topics.findIndex(n => n.id === selected)), notion = topics[index];
  if (!notion) return <p className="p-6 text-sm text-[#8F8978]">Import a course PDF and generate its learning map to begin.</p>;
  const baseline=JSON.stringify([courseId,notion.label,notion.definition,notion.explanation,notion.sources,notion.clair]);
  const lesson=(lessons[notion.id]?.baseline===baseline?lessons[notion.id].lesson:undefined)??notion.clair;
  const deepen=async()=>{
    const id=notion.id;if(pending.includes(id))return;
    setPending(p=>[...p,id]);setErrors(e=>({...e,[id]:''}));
    try{
      const response=await fetch(`/api/notions/${encodeURIComponent(id)}/lesson`,{method:'POST'}),body=await response.json();
      if(!response.ok)throw new Error(body.error??'Could not deepen this concept');
      setLessons(l=>({...l,[id]:{lesson:body.lesson,baseline}}));router.refresh();
    }catch(error){setErrors(e=>({...e,[id]:error instanceof Error?error.message:'Could not deepen this concept'}));}
    finally{setPending(p=>p.filter(v=>v!==id));}
  };
  return <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
    <div className="flex items-center gap-3">
      <label htmlFor="understand-topic" className="text-xs text-[#696A61]">Course path</label>
      <select id="understand-topic" value={notion.id} onChange={e => setSelected(e.target.value)} className="min-w-0 flex-1 rounded border border-[#423e42] bg-[#28262a] p-2 text-sm text-[#D4C6A6]">{topics.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
    </div>
    <h2 className="text-base font-semibold text-[#D4C6A6]">{notion.label}</h2>
    {(notion.contentWarnings?.length||teachingQualityIssues(notion.label,`${notion.definition}\n${notion.explanation??''}`).length)?<div role="alert"><p className="text-sm text-amber-300">This explanation needs a new source check before it can be studied. Reprocess the original document or correct the notes against the source.</p>{notion.sources.map(s=><a key={`${s.documentId}:${s.page}`} className="mr-3 text-xs text-accent-400" href={`/api/documents/${encodeURIComponent(s.documentId)}/file#page=${s.page}`} target="_blank" rel="noreferrer">Slide {s.page} ↗</a>)}</div>:lesson ? <ClairReader key={notion.id} lesson={lesson} conceptLabel={notion.label} onSelect={setSelected}/> : <>
      <p className="text-xs text-[#696A61]">Existing notes are preserved. Open a source slide to check the explanation.</p>
      <p className="whitespace-pre-line text-sm leading-relaxed text-[#8F8978]">{notion.explanation || notion.definition}</p>
      {notion.sources.map(s => <a key={`${s.documentId}:${s.page}`} className="mr-3 text-xs text-accent-400" href={`/api/documents/${encodeURIComponent(s.documentId)}/file#page=${s.page}`} target="_blank" rel="noreferrer">Slide {s.page} ↗</a>)}
    </>}
    {(lesson?.depth!=='deep'||!clairMatchesConcept(notion.label,lesson))&&!notion.userEdited&&notion.status!=='validated'&&notion.evidence?.some(s=>s.quote)&&<div className="space-y-2">
      <button onClick={deepen} disabled={pending.includes(notion.id)} className="rounded border border-[#423e42] px-3 py-2 text-xs text-accent-400 disabled:opacity-50">{pending.includes(notion.id)?'Deepening this concept…':'Deepen understanding'}</button>
      <p className="text-xs text-[#696A61]">Generate a source-checked explanation with worked examples and varied practice.</p>
    </div>}
    {errors[notion.id]&&<p role="alert" className="text-xs text-red-400">{errors[notion.id]}</p>}
    <div className="flex justify-between text-xs text-[#8F8978]">
      <button disabled={index === 0} onClick={() => setSelected(topics[index - 1].id)} className="disabled:opacity-30">← Previous concept</button>
      <button disabled={index + 1 === topics.length} onClick={() => setSelected(topics[index + 1].id)} className="disabled:opacity-30">Next concept →</button>
    </div>
  </div>;
}
