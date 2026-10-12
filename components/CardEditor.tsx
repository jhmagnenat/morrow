"use client";
import {teachingOriginLabel} from '@/lib/teachingCourse';
import { useState } from "react";
import type { StudyCard } from "@/lib/contentQuality";
import { useCourseFetch } from "@/lib/useCourseFetch";
import AnkiContent from '@/components/AnkiContent';
import {useModalFocus} from '@/lib/useModalFocus';
export default function CardEditor({card,courseId,onSave,onClose}:{card:StudyCard;courseId:string;onSave:(card:StudyCard)=>void;onClose:()=>void}) {
  const fetch=useCourseFetch(courseId);
  const modal=useModalFocus(true,onClose);
  const [question,setQuestion]=useState(card.question), [answer,setAnswer]=useState(card.answer), [example,setExample]=useState(card.example);
  const [explanation,setExplanation]=useState(card.explanation??'');
  const [visualApproval,setVisualApproval]=useState(false);
  const visual=card.evidence.some(e=>!e.quote.trim()||e.visualDescription)||card.warnings.some(w=>/visual|image|heading\/reference/i.test(w));
  const [error,setError]=useState(""), [busy,setBusy]=useState(false);
  const save=async(status:StudyCard["status"])=>{
    setBusy(true);setError("");
    try {const res=await fetch(`/api/cards/${card.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,answer,example,explanation,status,visualApproval})});const data=await res.json();if(!res.ok)throw new Error(data.error);onSave(data.card);}
    catch(e){setError(e instanceof Error?e.message:"Save failed");}finally{setBusy(false);}
  };
  return <div ref={modal} tabIndex={-1} className="fixed inset-0 z-50 overflow-auto bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit card">
    <div className="mx-auto grid max-w-5xl gap-5 rounded-lg border border-[#423e42] bg-[#201f21] p-5 md:grid-cols-2">
      <div className="space-y-3"><button onClick={onClose}>Close</button><h2 className="text-lg">Verify and edit card</h2>
        <label className="block">Question<textarea className="mt-1 w-full rounded bg-[#28262a] p-2" value={question} onChange={e=>setQuestion(e.target.value)}/></label>
        <label className="block">Answer<textarea rows={6} className="mt-1 w-full rounded bg-[#28262a] p-2" value={answer} onChange={e=>setAnswer(e.target.value)}/></label>
        <label className="block">Explanation (optional)<textarea rows={4} className="mt-1 w-full rounded bg-[#28262a] p-2" value={explanation} onChange={e=>setExplanation(e.target.value)}/></label>
        <label className="block">Example<textarea className="mt-1 w-full rounded bg-[#28262a] p-2" value={example} onChange={e=>setExample(e.target.value)}/></label>
        <p className="text-xs text-[#8F8978]">{card.kind} · {card.objective}</p>
        {card.teaching&&<div className="rounded border border-[#423e42] p-3 text-sm text-[#aaa596]"><p className="text-accent-300">{teachingOriginLabel(card.teaching.origin)}</p><p className="mt-1 text-xs">Slides anchor this topic. Added explanations come from the reconstructed lesson, not necessarily from the lecturer.</p><details className="mt-2"><summary className="cursor-pointer">Teaching basis for this card</summary>{card.teaching.claims.map(c=><p key={c.id} className="mt-2">{c.statement}</p>)}</details></div>}
        {card.warnings.map((w,i)=><p className="text-xs text-amber-300" key={i}>{w}</p>)}
        {visual&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={visualApproval} onChange={e=>setVisualApproval(e.target.checked)}/>I checked the original image: its labels, values, units and period support this question and answer.</label>}
        <div className="flex flex-wrap gap-3">{(["draft","ready","suspended"] as const).map(status=><button className="rounded border border-[#423e42] px-3 py-2" disabled={busy} key={status} onClick={()=>save(status)}>{status==="ready"?"Approve & save":status==="draft"?"Save draft":"Suspend"}</button>)}</div>
        {error && <p role="alert" className="text-red-400">{error}</p>}
      </div>
      <div className="space-y-3"><h3>Source evidence</h3>{!card.evidence.length && <p>No source evidence. Review this legacy card carefully.</p>}
        {card.presentation&&<details open><summary>Imported card preview</summary><div className="mt-3 space-y-4"><AnkiContent presentation={card.presentation} face="front" courseId={courseId} fallback={card.question}/><hr className="border-[#423e42]"/><AnkiContent presentation={card.presentation} face="back" courseId={courseId} fallback={card.answer}/><p className="text-xs text-[#aaa596]">Images and audio are preserved. Scripts and external resources do not run. Editing the text replaces this imported presentation.</p></div></details>}
        {card.evidence.map((e,i)=><div key={i}><a className="text-accent-300 underline" target="_blank" rel="noreferrer" href={`/api/documents/${e.documentId}/file#page=${e.page}`}>Slide {e.page}</a><blockquote className="my-2 border-l-2 border-accent-400 pl-3 text-sm">{e.quote || e.visualDescription || "Legacy page citation without a verified quotation"}</blockquote></div>)}
        {!card.presentation&&card.evidence[0] && <iframe title="Original slide" className="h-[500px] w-full rounded" src={`/api/documents/${card.evidence[0].documentId}/file#page=${card.evidence[0].page}`}/>}
      </div>
    </div>
  </div>;
}
