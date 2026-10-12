"use client";
import { useEffect, useState, useRef } from "react";
import type { PageAnalysis } from "@/lib/qualityDb";
import { useCourseFetch } from "@/lib/useCourseFetch";
import {requestDocumentGeneration,watchDocumentGeneration} from '@/lib/documentGenerationClient';
interface QualityData {courseId:string;runs:Array<{id:string;payload:string}>;summary:Record<string,number>;settings:{newPerDay:number;sessionLimit:number};documents:Array<{id:string;title:string;pageCount?:number;pages:PageAnalysis[]}>;}
export default function QualityPanel({courseId,onGeneration}:{courseId:string;onGeneration?:()=>Promise<void>}) {
  const fetch=useCourseFetch(courseId);
  const [data,setData]=useState<QualityData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const generationScope=useRef(0);
  useEffect(()=>{const c=new AbortController(),scope=generationScope.current;fetch("/api/quality",{signal:c.signal}).then(r=>r.json()).then(raw=>{if(c.signal.aborted)return;setData({...raw,courseId});setBusy(false);setError('');}).catch(()=>{});return()=>{c.abort();generationScope.current=scope+1;};},[fetch,courseId]);
  const retry=async(id:string,pages:number[])=>{
    setBusy(true);setError("");
    const scope=generationScope.current;
    try {
      const job=await requestDocumentGeneration(fetch,id,{mode:'strict',enrichment:false,cardDetail:'key-ideas',pages,reprocess:true});
      await watchDocumentGeneration(fetch,job,async current=>{
        if(scope!==generationScope.current)return;
        if(current.status==='running'){setError(`Regenerating ${pages.length} page(s). Saved cards remain available.`);return;}
        const response=await fetch('/api/quality',{cache:'no-store'});
        if(!response.ok)throw Error('Could not refresh the saved generation result');
        const updated=await response.json();if(scope!==generationScope.current)return;
        await onGeneration?.();if(scope!==generationScope.current)return;
        setData({...updated,courseId});setError(current.error??(current.status==='complete'?'Regeneration completed; saved cards refreshed.':`${current.reviewPages.length} page(s) still need review. Saved cards are preserved.`));
      },()=>scope!==generationScope.current);
    }
    catch(e){if(scope===generationScope.current)setError(e instanceof Error?e.message:"Retry failed");}finally{if(scope===generationScope.current)setBusy(false);}
  };
  const saveSettings=async()=>{if(!data)return;setBusy(true);try{const res=await fetch("/api/quality",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data.settings)});const body=await res.json();setError(res.ok?"Review settings saved":body.error);}catch{setError("Could not save settings");}finally{setBusy(false);}};
  const restorePdf=async(id:string,file:File)=>{setBusy(true);setError("");try{const form=new FormData();form.set("file",file);const response=await fetch(`/api/documents/${id}/file`,{method:"PUT",body:form});const body=await response.json();setError(response.ok?"Original PDF restored. Reprocess the affected pages.":body.error);}catch{setError("Could not restore PDF");}finally{setBusy(false);}};
  if(!data||data.courseId!==courseId)return null;
  return <details className="mb-6 rounded-lg border border-[#423e42] bg-[#201f21] p-4"><summary className="cursor-pointer">Content quality · {data.summary.draft} drafts · {data.summary.legacy} legacy cards to verify</summary>
    <div className="mt-4 space-y-4 text-sm"><p>{data.summary.unsourcedConcepts} concepts without sources. Legacy cards are preserved; their content has not passed the new audit.</p>
      <div className="flex flex-wrap items-center gap-3"><label>New cards/day <input aria-label="New cards per day" className="w-16 rounded bg-[#28262a] p-1" type="number" min={0} max={200} value={data.settings.newPerDay} onChange={e=>setData({...data,settings:{...data.settings,newPerDay:Number(e.target.value)}})}/></label><label>Session limit <input aria-label="Session limit" className="w-16 rounded bg-[#28262a] p-1" type="number" min={1} max={500} value={data.settings.sessionLimit} onChange={e=>setData({...data,settings:{...data.settings,sessionLimit:Number(e.target.value)}})}/></label><button disabled={busy} onClick={saveSettings} className="rounded border border-[#423e42] p-2">Save settings</button></div>
      {data.documents.map(doc=><details key={doc.id} className="rounded border border-[#423e42] p-3"><summary>{doc.title} · {doc.pages.filter(p=>p.status==="complete").length} covered · {doc.pages.filter(p=>p.status==="skipped").length} excluded · {doc.pages.filter(p=>p.status==="retry").length} to review</summary>
        <p className="my-2 text-xs text-[#8F8978]">Pages without an audit include older generations. Reprocess launches generation for the selected page and refreshes the saved cards. Existing cards and edits are kept.</p>
        <label className="mb-3 block text-xs text-[#8F8978]">Restore the original PDF from an older backup <input className="mt-1 block" type="file" accept="application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void restorePdf(doc.id,file);}}/></label>
        <div className="max-h-64 space-y-2 overflow-y-auto">{Array.from({length:doc.pageCount ?? 0},(_,i)=>i+1).map(page=>{const p=doc.pages.find(p=>p.page===page);return <div key={page} className="flex items-start justify-between gap-3 border-t border-[#423e42] pt-2"><div><a target="_blank" rel="noreferrer" className="text-accent-300" href={`/api/documents/${doc.id}/file#page=${page}`}>Slide {page}</a> · {p?.status ?? "not audited"} · {p?.kind ?? "unknown"}<p className="text-xs text-[#8F8978]">{p?.reason}{p && ` · ${p.concepts} concepts · ${p.cards} cards`}</p>{p?.previousAnalysis&&<details className="mt-1 text-xs text-[#8F8978]"><summary>Previous analysis preserved: {p.previousAnalysis.status} / {p.previousAnalysis.version}</summary><p>{p.previousAnalysis.reason}</p><p>{p.previousAnalysis.readyCards??0} ready cards at that time. This is the previous result, not approval of this regeneration.</p>{p.previousAnalysis.knowledgeCoverage?.map(k=><p key={k.key}>{k.status}: {k.claim}</p>)}</details>}{p?.knowledgeCoverage&&<details className="mt-1 text-xs"><summary>Knowledge: {p.knowledgeCoverage.filter(k=>k.status==='covered').length}/{p.knowledgeCoverage.filter(k=>k.status!=='excluded'&&k.status!=='deferred').length} covered</summary>{p.knowledgeCoverage.map(k=><p key={k.key} className={k.status==='unresolved'?'text-amber-300':'text-[#8F8978]'}>{k.status}: {k.claim}{k.reason&&` - ${k.reason}`}</p>)}</details>}{p?.warnings.map((w,i)=><p key={i} className="text-xs text-amber-300">{w}</p>)}</div><button disabled={busy} className="shrink-0 rounded border border-[#423e42] px-2 py-1 text-xs" onClick={()=>retry(doc.id,[page])}>Reprocess</button></div>;})}</div>
      </details>)}
      {data.runs.length>0 && <details><summary>Recent generation runs</summary>{data.runs.slice(-5).reverse().map(run=>{const metrics=JSON.parse(run.payload),usage=metrics.usage??metrics;const calls=usage.requests??metrics.calls??0;const pages=Array.isArray(metrics.pages)?metrics.pages.length:metrics.pages;return <p className="mt-2 text-xs text-[#8F8978]" key={run.id}>{metrics.writerModel??metrics.model??'Generation'} / {metrics.version} / {metrics.status} / {calls} calls{Number.isFinite(pages)&&` / ${pages} pages`} / {metrics.readyCards??metrics.cards??0} ready cards / {usage.inputTokens??0} input tokens / {usage.outputTokens??0} output tokens</p>;})}</details>}
      {error && <p role="status">{error}</p>}
    </div>
  </details>;
}
