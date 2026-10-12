'use client';
/* eslint-disable @next/next/no-img-element -- Private imported media must keep the session cookie; the image optimizer cannot fetch it. */
import {createElement,useEffect,useState,type ReactNode} from 'react';
import type {StudyCard} from '@/lib/contentQuality';
export default function AnkiContent({presentation,face,fallback,courseId}:{presentation:StudyCard['presentation'];face:'front'|'back';fallback:string;courseId:string}){
  const signature=JSON.stringify([presentation,face,courseId]);
  const [rendered,setRendered]=useState<{signature:string;content:ReactNode}|null>(null);
  useEffect(()=>{
    if(!presentation)return;
    const document=new DOMParser().parseFromString(face==='front'?presentation.frontHtml:presentation.backHtml,'text/html');
    const url=(name:string)=>`/api/anki/packages/${presentation.packageHash}/media/${encodeURIComponent(name)}?courseId=${encodeURIComponent(courseId)}`;
    const text=(value:string):ReactNode=>value.split(/(\[sound:[^\]]+\])/g).map((part,index)=>part.startsWith('[sound:')?<audio key={index} aria-label="Imported audio" controls preload="none" src={url(part.slice(7,-1))}/>:part);
    const allowed=new Set(['p','br','b','strong','i','em','u','s','small','span','div','ul','ol','li','table','thead','tbody','tr','th','td','sup','sub','h2','h3','h4','code','pre','hr']);
    const render=(node:Node,index:number):ReactNode=>{
      if(node.nodeType===Node.TEXT_NODE)return <span key={index}>{text(node.textContent??'')}</span>;
      if(!(node instanceof Element))return null;
      const tag=node.tagName.toLowerCase();
      if(['script','style','iframe','object','embed','svg','link','meta'].includes(tag))return null;
      if(tag==='img'){const name=node.getAttribute('src');return name?<img key={index} loading="lazy" src={url(name)} alt={node.getAttribute('alt')??'Imported card image'} className="my-3 max-h-80 max-w-full object-contain"/>:null;}
      if(tag==='audio'||tag==='video'){const name=node.getAttribute('src')??node.querySelector('source')?.getAttribute('src');return name?createElement(tag,{key:index,controls:true,preload:'none',src:url(name),className:'max-w-full'}):null;}
      const children=[...node.childNodes].map(render);
      return createElement(allowed.has(tag)?tag:'span',{key:index},...children);
    };
    let cancelled=false;
    const content=<>{[...document.body.childNodes].map(render)}</>;
    queueMicrotask(()=>{if(!cancelled)setRendered({signature,content});});
    return()=>{cancelled=true;};
  },[presentation,face,courseId,signature]);
  return <div className="anki-content text-sm leading-relaxed text-[#d4c6a6]">{presentation&&rendered?.signature===signature?rendered.content:fallback}</div>;
}
