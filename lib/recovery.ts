import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {exportSnapshot,withDatabaseSnapshot,type Snapshot} from '@/lib/db';
import {readPdfFile} from '@/lib/pdfStorage';
import {dataDirectory} from '@/lib/dataDirectory';
import {scopedCourseId} from '@/lib/courseScope';

export interface RecoveryPoint {version:1;id:string;courseId:string;createdAt:string;reason:string;digest:string;bytes:number;pdfs?:string[];}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
function directory(){
  const id=scopedCourseId();if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid recovery course');
  return path.join(dataDirectory(),'recovery',id);
}
function atomicWrite(file:string,bytes:string|Buffer){
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
export function listRecoveryPoints():RecoveryPoint[]{
  const dir=directory();if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(n=>/^[a-f0-9-]+\.json$/.test(n)).flatMap(name=>{
    try{const point=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')) as RecoveryPoint;
      return point.version===1&&point.courseId===scopedCourseId()&&point.id===name.slice(0,-5)&&typeof point.createdAt==='string'&&Number.isFinite(Date.parse(point.createdAt))&&typeof point.reason==='string'&&typeof point.digest==='string'&&/^[a-f0-9]{64}$/.test(point.digest)&&Number.isFinite(point.bytes)&&fs.existsSync(path.join(dir,`${point.id}.json.gz`))?[point]:[];
    }catch{return [];}
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export function createRecoveryPoint(reason:string,periodic=false):RecoveryPoint|undefined{
  const latest=listRecoveryPoints()[0];
  if(periodic&&latest&&Date.now()-Date.parse(latest.createdAt)<60*60*1000)return latest;
  const {snapshot,pdfBytes}=withDatabaseSnapshot(()=>{
    const snapshot=exportSnapshot();
    return {snapshot,pdfBytes:new Map(snapshot.documents.map(document=>[document.id,readPdfFile(document.id)]))};
  },true);
  // An unreviewed language deck, an interview or independent cards are work
  // too. Only skip a genuinely empty workspace, never an empty mapping.
  const collections=[snapshot.notions,snapshot.documents,snapshot.links,snapshot.reviewLog,
    snapshot.reviewState,snapshot.vocabularyCards,snapshot.pronunciationCards,
    snapshot.interviewSessions,snapshot.explainAttempts,snapshot.masterySignals??[],
    snapshot.quality?.study_cards??[]];
  if(collections.every(rows=>rows.length===0)&&!snapshot.progress?.current_streak&&!snapshot.progress?.longest_streak)return;
  const dir=directory();fs.mkdirSync(dir,{recursive:true});
  const blobs=path.join(dir,'blobs');fs.mkdirSync(blobs,{recursive:true});
  const pdfs:Record<string,string>={};
  for(const document of snapshot.documents){
    const pdf=pdfBytes.get(document.id);if(!pdf)continue;
    const hash=createHash('sha256').update(pdf).digest('hex'),file=path.join(blobs,`${hash}.pdf`);
    if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)atomicWrite(file,pdf);
    pdfs[document.id]=hash;
  }
  const content=JSON.stringify({version:1,snapshot,pdfs}),compressed=gzipSync(content),id=randomUUID();
  const point:RecoveryPoint={version:1,id,courseId:scopedCourseId(),createdAt:new Date().toISOString(),reason:reason.slice(0,160),digest:digest(content),bytes:compressed.byteLength,pdfs:[...new Set(Object.values(pdfs))]};
  atomicWrite(path.join(dir,`${id}.json.gz`),compressed);atomicWrite(path.join(dir,`${id}.json`),JSON.stringify(point));
  // Keep hourly review points and a separate reserve for destructive actions.
  // Only fully published pairs in this explicit course directory can rotate.
  const all=listRecoveryPoints();
  for(const periodicGroup of [true,false])for(const old of all.filter(p=>(p.reason==='periodic-review')===periodicGroup).slice(periodicGroup?24:20)){
    fs.unlinkSync(path.join(dir,`${old.id}.json`));fs.unlinkSync(path.join(dir,`${old.id}.json.gz`));
  }
  const referenced=new Set(listRecoveryPoints().flatMap(p=>p.pdfs??[]));
  for(const name of fs.readdirSync(blobs))if(/^[a-f0-9]{64}\.pdf$/.test(name)&&!referenced.has(name.slice(0,-4)))fs.unlinkSync(path.join(blobs,name));
  return point;
}
export function recoverySnapshot(id:string):Snapshot{
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid recovery identifier');
  const point=listRecoveryPoints().find(p=>p.id===id);if(!point)throw Error('Recovery point not found in this course');
  const content=gunzipSync(fs.readFileSync(path.join(directory(),`${id}.json.gz`)),{maxOutputLength:512*1024*1024}).toString('utf8');
  if(digest(content)!==point.digest)throw Error('Recovery checksum mismatch; current data is unchanged');
  const archive=JSON.parse(content);
  if(!archive.snapshot)return archive as Snapshot; // Earlier recovery archives embedded PDFs.
  const snapshot=archive.snapshot as Snapshot;
  return {...snapshot,documents:snapshot.documents.map(document=>{
    const hash=archive.pdfs?.[document.id];if(!hash)return document;
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid recovery PDF reference');
    const pdf=fs.readFileSync(path.join(directory(),'blobs',`${hash}.pdf`));
    if(createHash('sha256').update(pdf).digest('hex')!==hash)throw Error('Recovery PDF checksum mismatch; current data is unchanged');
    return {...document,pdfBase64:pdf.toString('base64')};
  })};
}
