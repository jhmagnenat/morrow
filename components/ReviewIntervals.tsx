"use client";
import { useContext, useEffect, useState } from "react";
import { StudySessionContext } from "@/lib/useStudySession";
export default function ReviewIntervals({type,id}:{type:string;id:string}) {
  const {courseId}=useContext(StudySessionContext), [labels,setLabels]=useState<string[]>([]);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/review/${type}/${id}/intervals`,{signal:controller.signal,headers:{"X-Course-Id":courseId}}).then(r=>r.ok?r.json():null).then(data=>{if(data)setLabels(data.labels);}).catch(()=>{});return()=>controller.abort();},[type,id,courseId]);
  return <div className="grid grid-cols-4 gap-2 text-center text-xs text-[#8F8978]" aria-label="Next review intervals">{labels.map((label,i)=><span key={i}>{label}</span>)}</div>;
}
