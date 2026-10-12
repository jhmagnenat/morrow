import {readZip} from '@/lib/zipArchive';
import {modernAnkiFiles} from '@/lib/ankiModern';
import {openDb} from '@/lib/db';
import {dataDirectory} from '@/lib/dataDirectory';
import {scopedCourseId} from '@/lib/courseScope';
const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm'};
declare global {var __ankiMediaCache:Map<string,Map<string,Buffer>>|undefined;}
export function ankiMedia(packageHash:string,name:string){
  if(!/^[a-f0-9]{64}$/.test(packageHash)||!name||/[\/\\\0]/.test(name)||name.length>240)return;
  const type=types[name.split('.').at(-1)?.toLowerCase()??''];if(!type)return;
  const row=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`anki-package:${packageHash}`);if(!row)return;
  const cache=globalThis.__ankiMediaCache??=new Map<string,Map<string,Buffer>>(),key=`${dataDirectory()}:${scopedCourseId()}:${packageHash}`;
  let media=cache.get(key);
  if(!media){
    const files=readZip(Buffer.from(JSON.parse(String(row.value)).base64,'base64'));
    const modern=files.has('collection.anki21b')?modernAnkiFiles(files):undefined;
    media=modern?new Map(modern.media.map(item=>[item.name,item.bytes])):new Map(Object.entries(JSON.parse(files.get('media')?.toString()??'{}')).flatMap(([index,name])=>typeof name==='string'&&files.has(index)?[[name,files.get(index)!] as [string,Buffer]]:[]));
    const size=[...media.values()].reduce((sum,b)=>sum+b.byteLength,0);
    // Large decks remain usable without retaining their whole media in RAM.
    if(size<=32*1024*1024){cache.set(key,media);while(cache.size>3)cache.delete(cache.keys().next().value!);}
  }
  const bytes=media.get(name);return bytes?{bytes,type}:undefined;
}
