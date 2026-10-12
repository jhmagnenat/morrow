import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readZip,writeZip} from '@/lib/zipArchive';
import {modernAnkiFiles,modernAnkiModels} from '@/lib/ankiModern';

export interface AnkiReview {grade:'again'|'hard'|'good'|'easy';reviewedAt:string;}
export interface AnkiImportedCard {key:string;noteKey:string;question:string;answer:string;deck:string;tags:string;frontHtml:string;backHtml:string;warnings:string[];suspended:boolean;isNew:boolean;reviewEpoch?:string;reviews:AnkiReview[];dueAt?:string;intervalDays?:number;repetitions:number;}
export interface AnkiPackage {cards:AnkiImportedCard[];media:Array<{name:string;bytes:Buffer}>;warnings:string[];}
interface Model {name:string;type:number;flds:Array<{name:string;ord:number}>;tmpls:Array<{qfmt:string;afmt:string;ord:number}>;}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const entities:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
export const ankiKey=(guid:string,ordinal:number)=>`anki-${hash(`${guid}:${ordinal}`).slice(0,40)}`;
export function plainAnkiHtml(value:string){
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi,' [image: $1] ').replace(/\[sound:([^\]]+)\]/gi,' [audio: $1] ').replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&(nbsp|amp|lt|gt|quot|apos);/g,(_,name:string)=>entities[name]??'').trim();
}
function render(template:string,fields:Record<string,string>,front:string,ordinal:number,answer:boolean,warnings:string[]):string{
  if(/<script\b|\{\{(?:type:|tts |hint:)/i.test(template))warnings.push('Interactive or custom template requires verification');
  let result=template;
  for(let pass=0;pass<8;pass++){
    const next=result.replace(/\{\{([#^])([^{}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,(_,condition,name,content)=>Boolean(fields[name]?.trim())===(condition==='#')?content:'');
    if(next===result)break;result=next;
  }
  result=result.replace(/\{\{([^{}]+)\}\}/g,(_,token:string)=>{
    if(token==='FrontSide')return front;
    const field=token.replace(/^(?:text|cloze):/,'');
    if(!(field in fields)){warnings.push(`Unsupported template field: ${token}`);return '';}
    if(token.startsWith('text:'))return plainAnkiHtml(fields[field]);
    if(token.startsWith('cloze:'))return fields[field].replace(/\{\{c(\d+)::([^{}]*?)(?:::([^{}]*?))?\}\}/g,(_,index,value,hint)=>Number(index)===ordinal+1?(answer?value:`[${hint||'…'}]`):value);
    return fields[field];
  });
  if(/\{\{/.test(result))warnings.push('Nested or unresolved template/cloze requires verification');
  if(/<script\b|\bon\w+\s*=|javascript:/i.test(result))warnings.push('Active HTML content requires verification');
  if(/<img\b|\[sound:|<audio\b|<video\b/i.test(result))warnings.push('Imported media requires verification against the original deck');
  return result;
}
export function parseAnkiPackage(bytes:Buffer):AnkiPackage{
  const files=readZip(bytes);
  const modern=files.has('collection.anki21b')?modernAnkiFiles(files):undefined;
  const collection=modern?.collection??files.get('collection.anki21')??files.get('collection.anki2');
  if(!collection||collection.subarray(0,16).toString()!=='SQLite format 3\0')throw Error('Missing or invalid Anki collection');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'morrow-anki-'));let database:DatabaseSync|undefined;
  try{
    const file=path.join(temporary,'collection.db');fs.writeFileSync(file,collection);
    database=new DatabaseSync(file,{readOnly:true});database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
    const col=database.prepare('SELECT crt,models,decks FROM col LIMIT 1').get();if(!col)throw Error('Empty Anki collection');
    const normalized=modern?modernAnkiModels(database):undefined;
    const models=(normalized?.models??JSON.parse(String(col.models))) as Record<string,Model>,decks=normalized?.decks??JSON.parse(String(col.decks)) as Record<string,{name:string}>;
    const notes=new Map(database.prepare('SELECT id,guid,mid,tags,flds,data FROM notes LIMIT 50001').all().map(n=>[String(n.id),n]));
    const rows=database.prepare('SELECT * FROM cards ORDER BY id LIMIT 50001').all();if(rows.length>50000||notes.size>50000)throw Error('Anki import accepts at most 50,000 notes/cards');
    const reviewRows=database.prepare('SELECT cid,id,ease FROM revlog ORDER BY id LIMIT 500001').all();if(reviewRows.length>500000)throw Error('Anki import accepts at most 500,000 reviews');
    const histories=new Map<string,AnkiReview[]>(),warnings:string[]=[];
    for(const row of reviewRows){
      const grade=['again','hard','good','easy'][Number(row.ease)-1] as AnkiReview['grade']|undefined,time=Number(row.id);
      if(!grade){warnings.push('Manual scheduling events are retained only in the original Anki package, not as recall grades');continue;}
      if(!Number.isFinite(time)||time<Date.UTC(2000,0)||time>Date.now()+86400000)throw Error('Invalid Anki review date');
      const key=String(row.cid),events=histories.get(key)??[];events.push({grade,reviewedAt:new Date(time).toISOString()});histories.set(key,events);
    }
    const cards:AnkiImportedCard[]=[];const identities=new Set<string>();
    for(const row of rows){
      const note=notes.get(String(row.nid)),model=note?models[String(note.mid)]:undefined;
      if(!note||!model||!Array.isArray(model.flds)||!Array.isArray(model.tmpls))throw Error('Anki card references missing note/model');
      const ordinal=Number(row.ord),template=model.tmpls.find(t=>t.ord===(model.type===1?0:ordinal));if(!template)throw Error('Anki card references missing template');
      const fields=Object.fromEntries(model.flds.map(f=>[f.name,String(note.flds).split('\x1f')[f.ord]??'']));
      fields.Deck=decks[String(row.did)]?.name??'Imported Anki';fields.Subdeck=fields.Deck.split('::').at(-1)??'';fields.Tags=String(note.tags);fields.Type=model.name;
      const issues:string[]=[],front=render(template.qfmt,fields,'',ordinal,false,issues),back=render(template.afmt,fields,front,ordinal,true,issues);
      const answerHtml=back.replace(front,''),question=plainAnkiHtml(front),answer=plainAnkiHtml(answerHtml);
      if(!question||!answer)issues.push('Empty question or answer after template conversion');
      let identity:unknown,reviewEpoch:unknown;try{const data=JSON.parse(String(note.data));identity=data.morrowCardId;reviewEpoch=data.morrowReviewEpoch;}catch{}
      const key=typeof identity==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(identity)&&ordinal===0?identity:ankiKey(String(note.guid),ordinal);
      if(identities.has(key))throw Error('Duplicate Anki GUID/template identity');identities.add(key);
      const queue=Number(row.queue),due=Number(row.due),anchor=Number(col.crt)*1000;
      const dueMillis=Number(row.odid)>0?NaN:queue===2||(queue<0&&Number(row.type)===2)?anchor+due*86400000:queue===1?due*1000:queue===3?anchor+due*86400000:NaN;
      cards.push({key,noteKey:`anki-note-${hash(String(note.guid)).slice(0,40)}`,question,answer,deck:fields.Deck,tags:String(note.tags),frontHtml:front,backHtml:answerHtml,warnings:[...new Set(issues)],suspended:queue<0,isNew:Number(row.type)===0,reviewEpoch:typeof reviewEpoch==='string'&&Number.isFinite(Date.parse(reviewEpoch))?reviewEpoch:undefined,reviews:histories.get(String(row.id))??[],dueAt:Number.isFinite(dueMillis)&&Number.isFinite(new Date(dueMillis).getTime())?new Date(dueMillis).toISOString():undefined,intervalDays:Math.max(0,Number(row.ivl)),repetitions:Math.max(0,Number(row.reps))});
    }
    const mediaMap=modern?{}:JSON.parse(files.get('media')?.toString()??'{}') as Record<string,string>;
    const media=Object.entries(mediaMap).map(([index,name])=>{
      if(!/^\d+$/.test(index)||typeof name!=='string'||!name||/[\/\\\0]/.test(name)||name==='.'||name==='..'||name.length>240)throw Error('Invalid Anki media filename');
      const data=files.get(index);if(!data)throw Error(`Missing Anki media: ${name}`);return {name,bytes:data};
    });
    return {cards,media:modern?.media??media,warnings:[...new Set(warnings)]};
  }finally{database?.close();if(!path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Invalid temporary directory');fs.rmSync(temporary,{recursive:true,force:true});}
}

export function packageAnkiDatabase(database:Buffer,media:Array<{name:string;bytes:Buffer}>=[]){
  const files=new Map<string,Buffer>([['collection.anki2',database]]),map:Record<string,string>={};
  media.forEach((item,index)=>{files.set(String(index),item.bytes);map[String(index)]=item.name;});files.set('media',Buffer.from(JSON.stringify(map)));return writeZip(files);
}
