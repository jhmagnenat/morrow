"use client";

import { createContext, useCallback, useEffect, useContext, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import { createStudyStore, restoreStudyQueue, type StudyQueue, studyCardKey, type StudyStore } from "@/lib/studySession";
import {initializeOfflineStudy} from '@/lib/offlineStudy';

const stores = new Map<string, StudyStore<unknown>>();

export const StudySessionContext = createContext<{ courseId: string; validCardKeys: Set<string> }>({ courseId: "default", validCardKeys: new Set() });

export function useStudyState<T>(name: string, initial: T, restore?: (value: unknown) => T | null) {
  const { courseId } = useContext(StudySessionContext);
  useEffect(()=>initializeOfflineStudy(courseId),[courseId]);
  const [fallback] = useState(() => initial);
  const date = new Date();
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const key = `encyclopedia:study:v1:${courseId}:${day}:${name}`;
  const store = useMemo(() => {
    let storage: Storage | null = null;
    try { if (typeof window !== "undefined") storage = window.localStorage; } catch { /* Browser storage can be disabled. */ }
    const existing=stores.get(key);
    if(existing) return existing as StudyStore<T>;
    const created=createStudyStore(key, fallback, storage, restore ?? ((value) => typeof value === typeof fallback ? value as T : null));
    stores.set(key,created as StudyStore<unknown>);
    return created;
  }, [key, fallback, restore]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => fallback);
  useEffect(()=>{
    const onStorage=(event:StorageEvent)=>{
      if(event.key!==key || !event.newValue)return;
      try {const value=JSON.parse(event.newValue);const restored=restore ? restore(value) : typeof value===typeof fallback ? value as T : null;
        if(restored!==null && JSON.stringify(restored)!==JSON.stringify(store.getSnapshot()))store.set(restored);
      }catch{/* Ignore malformed storage from other windows. */}
    };
    window.addEventListener("storage",onStorage);return()=>window.removeEventListener("storage",onStorage);
  },[key,store,restore,fallback]);
  return [state, store.set] as const;
}

export function useStudyQueue<T>(name: string, initialCards: T[]) {
  const { courseId,validCardKeys } = useContext(StudySessionContext);
  const restore = useCallback((value: unknown) => {
    const restored=restoreStudyQueue<T>(value, validCardKeys);
    if(!restored)return null;
    const latest=new Map(initialCards.map(card=>[studyCardKey(card),card]));
    return {...restored,cards:restored.cards.map(card=>latest.get(studyCardKey(card)) ?? card)};
  }, [validCardKeys,initialCards]);
  const [queue, setQueue] = useStudyState<StudyQueue<T>>(name, {
    cards: initialCards, index: 0, revealed: false,
    sessionDone: initialCards.length === 0, reviewedCount: 0,
  }, restore);
  const [ledger] = useStudyState<Record<string,{until:number;queue:string}>>("review-ledger",{});
  useEffect(()=>{
    const inventory=(event:Event)=>{
      const detail=(event as CustomEvent<{courseId:string;reviews:Record<string,{dueAt:string|null}>;excluded:string[]}>).detail;
      if(detail.courseId!==courseId)return;
      const excluded=new Set(detail.excluded);
      setQueue(previous=>{
        const keep=(card:T,index:number)=>{
          if(index<previous.index)return true;
          const key=studyCardKey(card);if(!key||excluded.has(key))return true;
          const review=detail.reviews[key];return Boolean(review&&(!review.dueAt||Date.parse(review.dueAt)<=Date.now()));
        };
        const cards=previous.cards.filter(keep);
        if(cards.length===previous.cards.length)return previous;
        return {...previous,cards,revealed:previous.cards[previous.index]===cards[previous.index]&&previous.revealed,sessionDone:previous.index>=cards.length};
      });
    };
    window.addEventListener('morrow:review-inventory',inventory);return()=>window.removeEventListener('morrow:review-inventory',inventory);
  },[courseId,setQueue]);
  useEffect(()=>{
    setQueue(previous=>{
      const next=restore(previous) ?? {cards:initialCards,index:0,revealed:false,sessionDone:!initialCards.length,reviewedCount:previous.reviewedCount};
      return JSON.stringify(next)===JSON.stringify(previous) ? previous : next;
    });
  },[restore,setQueue,initialCards]);
  useEffect(() => {
    setQueue(previous=> {
      const keep=(card:T)=>{const key=studyCardKey(card);const entry=key ? ledger[key] : undefined;return !entry || entry.queue===name || entry.until<=Date.now();};
      const cards=previous.cards.filter(keep);
      if(cards.length===previous.cards.length) return previous;
      const index=previous.cards.slice(0,previous.index).filter(keep).length;
      return {...previous,cards,index,revealed:previous.cards[previous.index]===cards[index] && previous.revealed,sessionDone:index>=cards.length};
    });
  },[ledger,name,setQueue]);
  const setField = <K extends keyof StudyQueue<T>>(field: K) => (value: SetStateAction<StudyQueue<T>[K]>) => {
    setQueue((previous) => {
      const next=typeof value === "function" ? (value as (previous: StudyQueue<T>[K]) => StudyQueue<T>[K])(previous[field]) : value;
      // Cards fetched/generated during this visit are absent from the initial SSR inventory.
      if(field==="cards" && Array.isArray(next))for(const card of next){const key=studyCardKey(card);if(key)validCardKeys.add(key);}
      return {...previous,[field]:next};
    });
  };
  return { ...queue, setCards: setField("cards"), setIndex: setField("index"),
    setRevealed: setField("revealed"), setSessionDone: setField("sessionDone"), setReviewedCount: setField("reviewedCount") };
}
