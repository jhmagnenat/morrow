'use client';
import {useContext,useEffect,useRef,useState} from 'react';
import type {Notion} from '@/lib/types';
import {StudySessionContext} from '@/lib/useStudySession';
import {useCourseFetch} from '@/lib/useCourseFetch';
import {refreshOfflineSnapshot} from '@/lib/offlineStudy';
export default function QaGenerator({notions,llmConfigured,onGenerated}:{notions:Notion[];llmConfigured:boolean;onGenerated:()=>Promise<void>}){
  const {courseId}=useContext(StudySessionContext),fetch=useCourseFetch(courseId);
  const completed=useRef(onGenerated);
  useEffect(()=>{completed.current=onGenerated;},[onGenerated]);
  const available=notions.filter(n=>(!n.layer||n.layer==='course')&&n.sources.length>0);
  const [selected,setSelected]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const options=available.filter(n=>n.label.toLowerCase().includes(search.toLowerCase()));
  return <details data-no-review-shortcuts className="w-full border border-[#423e42] bg-[#201f21] p-3 text-left text-sm"><summary className="cursor-pointer text-accent-200">Create questions from a course notion</summary><div className="mt-3 space-y-3">
    <p className="text-xs text-[#aaa596]">Create up to three complementary questions to explain, distinguish or apply what your course teaches. Each answer includes the essential reasoning. Questions are checked and corrected when needed; uncertain answers remain drafts in Browse.</p>
    <label className="block text-xs">Find a notion<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search course notions" className="mt-1 w-full border border-[#423e42] bg-[#28262a] p-2"/></label>
    <label className="block text-xs">Course notion<select value={selected} onChange={e=>setSelected(e.target.value)} className="mt-1 w-full border border-[#423e42] bg-[#28262a] p-2"><option value="">Choose a notion</option>{options.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
    {!llmConfigured&&<p className="text-xs text-[#aaa596]">Configure a model to generate questions. Existing questions remain available.</p>}
    <button disabled={busy||!selected||!llmConfigured} className="border border-[#423e42] px-3 py-2 disabled:opacity-50" onClick={async()=>{
      setBusy(true);setMessage('');
      try{
        const response=await fetch('/api/qa/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notionId:selected,count:3})}),result=await response.json();
        if(!response.ok)throw Error(result.error??'Generation failed');
        await refreshOfflineSnapshot(courseId).catch(()=>{});await completed.current();
        setMessage(`${result.ready} questions ready${result.improved?`, including ${result.improved} improved drafts`:''}, ${result.draft} drafts to verify in Browse, ${result.duplicates} duplicates skipped.${result.created===0&&!result.improved?' No new supported question was added.':''}`);
      }catch(error){setMessage(error instanceof Error?error.message:'Connection failed');}finally{setBusy(false);}
    }}>{busy?'Generating and checking…':'Generate questions'}</button>
    {message&&<p role="status" className="text-xs text-[#aaa596]">{message}</p>}
  </div></details>;
}
