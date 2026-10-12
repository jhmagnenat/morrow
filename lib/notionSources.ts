import {createHash} from 'node:crypto';
import {getNotionById,getPassagesForDocument} from '@/lib/db';
import type {AccuracySource} from '@/lib/contentAccuracy';

export class SourceContextError extends Error {constructor(message:string,public status=422){super(message);}}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Shared by supplemental explanation routes. Stored prose is context only;
// genuine document text is supplied separately and checked again before save.
export function notionSourceContext(id:string) {
  const notion=getNotionById(id);
  if(!notion)throw new SourceContextError('Concept not found',404);
  const read=():AccuracySource[]=>[...new Map(notion.sources.map(s=>[`${s.documentId}:${s.page}`,s])).values()].map(s=>({id:`${s.documentId}:${s.page}`,documentId:s.documentId,page:s.page,text:getPassagesForDocument(s.documentId).filter(p=>p.page===s.page).map(p=>p.text).join('\n')})).filter(s=>s.text.trim().length>=12);
  const sources=read();
  if(!sources.length)throw new SourceContextError('Original course text is required. Restore the source document before requesting a verified explanation.');
  const baseline=digest({notion,sources});
  return {notion,sources,checkCurrent(){const current=getNotionById(id);if(!current||digest({notion:current,sources:read()})!==baseline)throw new SourceContextError('The concept or its sources changed; the explanation was not saved.',409);}};
}
