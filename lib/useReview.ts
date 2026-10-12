"use client";
import { useContext } from "react";
import { StudySessionContext, useStudyState } from "@/lib/useStudySession";
import {submitDurableReview} from '@/lib/offlineStudy';
import type {Grade} from '@/lib/srs';
export interface ReviewedEntry {until: number; queue: string;}
export function useReview(queue:string) {
  const {courseId}=useContext(StudySessionContext);
  const [,setLedger]=useStudyState<Record<string,ReviewedEntry>>("review-ledger",{});
  return async(type:string,id:string,grade:string)=>{
    const response=await submitDurableReview(courseId,type,id,grade as Grade);
    if(response.ok){const data=await response.clone().json();setLedger(previous=>({...previous,[`${type}:${id}`]:{until:new Date(data.dueAt).getTime() || Date.now()+60000,queue}}));}
    return response;
  };
}
