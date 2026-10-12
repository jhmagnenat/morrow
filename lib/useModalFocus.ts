'use client';
import {useEffect,useRef} from 'react';
export function useModalFocus(open:boolean,onClose:()=>void){
  const root=useRef<HTMLDivElement>(null),close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    if(!open||!root.current)return;
    const previous=document.activeElement as HTMLElement|null,element=root.current;
    const items=()=>[...element.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(item=>item.getClientRects().length>0);
    (items()[0]??element).focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){const all=items(),first=all[0],last=all.at(-1);if(!first){event.preventDefault();element.focus();}else if(event.shiftKey&&(document.activeElement===first||!element.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    element.addEventListener('keydown',key);
    return()=>{element.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[open]);
  return root;
}
