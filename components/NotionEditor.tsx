"use client";
import { useState } from "react";
import { useCourseFetch } from "@/lib/useCourseFetch";
import type { Notion } from "@/lib/types";
export default function NotionEditor({notion,onSave,courseId}:{notion:Notion;onSave:(notion:Notion)=>void;courseId:string}) {
  const fetch=useCourseFetch(courseId);
  const [open,setOpen]=useState(false),[label,setLabel]=useState(notion.label),[definition,setDefinition]=useState(notion.definition),[explanation,setExplanation]=useState(notion.explanation ?? ""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const save=async()=>{setBusy(true);setError("");try{const res=await fetch(`/api/notions/${notion.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({label,definition,explanation})});const data=await res.json();if(!res.ok)throw new Error(data.error);onSave(data);setOpen(false);}catch(e){setError(e instanceof Error?e.message:"Save failed");}finally{setBusy(false);}};
  return <div className="mb-3"><button className="rounded border border-[#423e42] px-2 py-1 text-xs" onClick={()=>setOpen(v=>!v)}>{open?"Cancel edit":"Edit concept"}</button>{notion.userEdited && <span className="ml-2 text-xs text-accent-300">Your corrections are preserved</span>}
    {open && <div className="mt-2 space-y-2"><label className="block text-xs">Label<input className="mt-1 w-full rounded bg-[#28262a] p-2" value={label} onChange={e=>setLabel(e.target.value)}/></label><label className="block text-xs">Definition<textarea className="mt-1 w-full rounded bg-[#28262a] p-2" value={definition} onChange={e=>setDefinition(e.target.value)}/></label><label className="block text-xs">Explanation<textarea rows={6} className="mt-1 w-full rounded bg-[#28262a] p-2" value={explanation} onChange={e=>setExplanation(e.target.value)}/></label><button disabled={busy} onClick={save} className="rounded border border-[#423e42] px-3 py-1 text-xs">Save correction</button>{error && <p role="alert" className="text-xs text-red-400">{error}</p>}</div>}
  </div>;
}
