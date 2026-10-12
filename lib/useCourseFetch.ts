"use client";
import { useCallback } from "react";

export function useCourseFetch(courseId:string){
  return useCallback((input:RequestInfo|URL,init:RequestInit={})=>{
    const headers=new Headers(init.headers);
    headers.set("X-Course-Id",courseId);
    return globalThis.fetch(input,{...init,headers});
  },[courseId]);
}
