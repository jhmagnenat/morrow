import {nextReviewState,dueDateFrom,type ReviewState,type Grade} from '@/lib/srs';
import {notifyXpUpdated} from '@/lib/xpEvent';

interface CachedReview {revision:string;state:ReviewState;dueAt:string|null;previousRequestId?:string;content?:{question:string;answer:string};}
interface Snapshot {version:1;courseId:string;savedAt:number;etag?:string;contentVersion?:string;reviews:Record<string,CachedReview>;}
interface PendingReview {id:string;cardKey:string;courseId:string;type:string;cardId:string;grade:Grade;reviewedAt:string;baseRevision:string;previousRequestId?:string;content?:{question:string;answer:string};result:{dueAt:string;intervalDays:number};error?:string;}
let database:Promise<IDBDatabase>|undefined;
const activeSubmissions=new Set<string>();
const refreshing=new Map<string,Promise<void>>();
async function scheduleBackgroundSync(){
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration();
  const sync=(registration as (ServiceWorkerRegistration&{sync?:{register:(tag:string)=>Promise<void>}})|undefined)?.sync;
  await sync?.register('morrow-reviews');
}
function announceSnapshot(snapshot:Snapshot,pending:PendingReview[],contentChanged=false){
  const excluded=new Set([...activeSubmissions,...pending.filter(r=>r.courseId===snapshot.courseId).map(r=>`${r.type}:${r.cardId}`)]);
  window.dispatchEvent(new CustomEvent('morrow:review-inventory',{detail:{courseId:snapshot.courseId,reviews:snapshot.reviews,excluded:[...excluded],contentChanged}}));
}
function open(){
  return database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('morrow-offline-v1',2);
    let blocked=false;
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'courseId'});
      const reviews=request.result.objectStoreNames.contains('reviews')?request.transaction!.objectStore('reviews'):request.result.createObjectStore('reviews',{keyPath:'id'});
      if(reviews.indexNames.contains('cardKey'))reviews.deleteIndex('cardKey');
      reviews.createIndex('cardKey','cardKey');
    };
    request.onblocked=()=>{blocked=true;database=undefined;reject(Error('Close an older Morrow tab to upgrade offline storage'));};
    request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
    request.onerror=()=>{database=undefined;reject(request.error);};
  });
}
async function transaction<T>(store:string,mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),request=work(tx.objectStore(store));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error??request.error);tx.onerror=()=>reject(tx.error??request.error);
  });
}
async function request(input:string,init?:RequestInit){
  return fetch(input,{...init,signal:AbortSignal.timeout(10000)});
}
export async function refreshOfflineSnapshot(courseId:string,notify=true){
  const existing=refreshing.get(courseId);if(existing)return existing;
  const work=refreshSnapshot(courseId,notify);refreshing.set(courseId,work);
  try{await work;}finally{refreshing.delete(courseId);}
}
async function refreshSnapshot(courseId:string,notify:boolean){
  const previous=await transaction<Snapshot|undefined>('snapshots','readonly',store=>store.get(courseId));
  const response=await request('/api/offline',{headers:{'X-Course-Id':courseId,...(previous?.etag?{'If-None-Match':previous.etag}:{})},cache:'no-store'});
  if(response.status===304&&previous){
    // Do not overwrite pending optimistic schedules while renewing freshness.
    const db=await open();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),read=store.get(courseId);read.onsuccess=()=>{if(read.result)store.put({...read.result,savedAt:Date.now()});};tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});
    if(notify)announceSnapshot(previous,await offlineReviews());return;
  }
  if(!response.ok)throw Error('Offline inventory is unavailable');
  const data=await response.json() as Snapshot;
  if(data.version!==1||data.courseId!==courseId||!data.reviews)throw Error('Invalid offline inventory');
  data.etag=response.headers.get('ETag')??undefined;
  const reviewContentChanged=previous&&JSON.stringify(Object.entries(previous.reviews).map(([key,value])=>[key,value.content]))!==JSON.stringify(Object.entries(data.reviews).map(([key,value])=>[key,value.content]));
  const contentChanged=Boolean(previous&&((data.contentVersion!==undefined&&data.contentVersion!==previous.contentVersion)||reviewContentChanged));
  const db=await open();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['snapshots','reviews'],'readwrite'),store=tx.objectStore('snapshots');
    const old=store.get(courseId),pending=tx.objectStore('reviews').getAll();
    pending.onsuccess=()=>{
      // A refresh must never replace an optimistic schedule whose reviews
      // have not yet reached the server. The transaction also serializes
      // refreshes with submissions in other tabs.
      for(const review of pending.result as PendingReview[])if(review.courseId===courseId){
        const key=`${review.type}:${review.cardId}`;
        if(old.result?.reviews[key])data.reviews[key]=old.result.reviews[key];
      }
      store.put(data);
    };
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
  });
  if(notify)announceSnapshot(data,await offlineReviews(),contentChanged);
}
async function send(review:PendingReview){
  return request(`/api/review/${review.type}/${encodeURIComponent(review.cardId)}/grade`,{
    method:'POST',headers:{'Content-Type':'application/json','X-Course-Id':review.courseId},
    body:JSON.stringify({grade:review.grade,requestId:review.id,baseRevision:review.baseRevision,reviewedAt:review.reviewedAt,previousRequestId:review.previousRequestId}),
  });
}
export async function offlineReviews(){
  return transaction<PendingReview[]>('reviews','readonly',store=>store.getAll());
}
export async function flushOfflineReviews(){
  if(typeof navigator!=='undefined'&&!navigator.onLine)return;
  const work=async()=>{
    const pending=await offlineReviews();
    const changed=new Set<string>();
    const blocked=new Set<string>();
    for(const review of pending.sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt))){
      // Rejected operations remain available for explicit resolution/export.
      if(review.error||blocked.has(review.cardKey)){blocked.add(review.cardKey);continue;}
      try{
        const response=await send(review);
        if(response.ok){await transaction('reviews','readwrite',store=>store.delete(review.id));changed.add(review.courseId);}
        else if(response.status===401||response.status===403)break;
        else if(response.status>=400&&response.status<500){
          review.error=(await response.json()).error??'Synchronization conflict';
          await transaction('reviews','readwrite',store=>store.put(review));blocked.add(review.cardKey);
        }else break;
      }catch{break;}
    }
    for(const course of changed)await refreshOfflineSnapshot(course,false).catch(()=>{});
    if(changed.size&&typeof window!=='undefined')notifyXpUpdated();
  };
  if(typeof navigator!=='undefined'&&navigator.locks)await navigator.locks.request('morrow-review-sync',work);
  else await work(); // Server receipts still make duplicate delivery harmless.
}
export async function submitDurableReview(courseId:string,type:string,cardId:string,grade:Grade):Promise<Response>{
  const key=`${type}:${cardId}`;activeSubmissions.add(key);
  try{return await submitReview(courseId,type,cardId,grade);}finally{activeSubmissions.delete(key);}
}
async function submitReview(courseId:string,type:string,cardId:string,grade:Grade):Promise<Response>{
  // Browsers without persistent storage keep the existing online behavior.
  if(typeof indexedDB==='undefined')return fetch(`/api/review/${type}/${encodeURIComponent(cardId)}/grade`,{method:'POST',headers:{'Content-Type':'application/json','X-Course-Id':courseId},body:JSON.stringify({grade,requestId:crypto.randomUUID()})});
  let snapshot=await transaction<Snapshot|undefined>('snapshots','readonly',store=>store.get(courseId)).catch(()=>undefined);
  if(!snapshot&&navigator.onLine){await refreshOfflineSnapshot(courseId).catch(()=>{});snapshot=await transaction<Snapshot|undefined>('snapshots','readonly',store=>store.get(courseId)).catch(()=>undefined);}
  if(!snapshot?.reviews[`${type}:${cardId}`]||Date.now()-snapshot.savedAt>30*86400000){
    // No cached baseline: don't manufacture an offline success.
    return fetch(`/api/review/${type}/${encodeURIComponent(cardId)}/grade`,{method:'POST',headers:{'Content-Type':'application/json','X-Course-Id':courseId},body:JSON.stringify({grade,requestId:crypto.randomUUID()})});
  }
  const db=await open(),cardKey=`${courseId}:${type}:${cardId}`;
  const committed=await new Promise<PendingReview|Response>((resolve,reject)=>{
    const tx=db.transaction(['snapshots','reviews'],'readwrite'),snapshots=tx.objectStore('snapshots'),reviews=tx.objectStore('reviews');
    const read=snapshots.get(courseId),pending=reviews.index('cardKey').getAll(cardKey);
    let result:PendingReview|Response;
    pending.onsuccess=()=>{
      const current=read.result as Snapshot|undefined,cached=current?.reviews[`${type}:${cardId}`],reviewedAt=new Date();
      const conflict=(pending.result as PendingReview[]).find(r=>r.error);
      if(conflict){result=Response.json({error:conflict.error,conflict:true},{status:409});return;}
      if(!cached||!current){result=Response.json({error:'Offline inventory is unavailable'},{status:409});return;}
      if(cached.dueAt&&cached.dueAt>reviewedAt.toISOString()){result=Response.json({error:'This cached card is not due yet'},{status:409});return;}
      const next=nextReviewState(cached.state,grade,reviewedAt);
      const review:PendingReview={id:crypto.randomUUID(),cardKey,courseId,type,cardId,grade,reviewedAt:reviewedAt.toISOString(),baseRevision:cached.revision,previousRequestId:cached.previousRequestId,content:cached.content,result:{intervalDays:next.intervalDays,dueAt:dueDateFrom(next.intervalDays,reviewedAt)}};
      reviews.add(review);
      current.reviews[`${type}:${cardId}`]={...cached,state:next,dueAt:review.result.dueAt,previousRequestId:review.id};
      snapshots.put(current);result=review;
    };
    tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);
  });
  if(committed instanceof Response)return committed;
  const review=committed;
  void scheduleBackgroundSync().catch(()=>{});
  if(!navigator.onLine)return Response.json({...review.result,pending:true});
  // Send predecessors first. A lost acknowledgement is replayed with its
  // durable request id; the server then verifies the next receipt's revision.
  if(review.previousRequestId)await flushOfflineReviews().catch(()=>{});
  const queued=await offlineReviews();
  if(!queued.some(r=>r.id===review.id))return Response.json(review.result);
  const conflict=queued.find(r=>r.cardKey===cardKey&&r.error);
  if(conflict)return Response.json({error:conflict.error,conflict:true},{status:409});
  if(queued.some(r=>r.cardKey===cardKey&&r.id!==review.id))return Response.json({...review.result,pending:true});
  try{
    const response=await send(review);
    if(response.ok){await transaction('reviews','readwrite',store=>store.delete(review.id));void refreshOfflineSnapshot(courseId,false).catch(()=>{});}
    else if(response.status===401||response.status===403)return response;
    else if(response.status<500){review.error=(await response.clone().json()).error??'Review rejected';await transaction('reviews','readwrite',store=>store.put(review));}
    else return Response.json({...review.result,pending:true});
    return response;
  }catch{return Response.json({...review.result,pending:true});}
}
let initialized=false;
export async function keepServerReview(courseId:string,type:string,cardId:string){
  const work=async()=>{
    const response=await request('/api/offline',{headers:{'X-Course-Id':courseId},cache:'no-store'});
    if(!response.ok)throw Error('Connect to the server before resolving this conflict');
    const server=await response.json() as Snapshot;
    if(server.courseId!==courseId||server.version!==1)throw Error('Invalid server inventory');
    const db=await open();
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['reviews','snapshots'],'readwrite'),reviews=tx.objectStore('reviews'),snapshots=tx.objectStore('snapshots');
      const current=snapshots.get(courseId),pending=reviews.index('cardKey').getAll(`${courseId}:${type}:${cardId}`);
      pending.onsuccess=()=>{
        for(const row of pending.result)reviews.delete(row.id);
        const value=current.result as Snapshot|undefined;
        if(value){const key=`${type}:${cardId}`;if(server.reviews[key])value.reviews[key]=server.reviews[key];else delete value.reviews[key];snapshots.put(value);}
      };
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });
    // A stale queue must not display the discarded local schedule as current.
    for(const key of Object.keys(localStorage))if(key.startsWith(`encyclopedia:study:v1:${courseId}:`))localStorage.removeItem(key);
  };
  if(navigator.locks)await navigator.locks.request('morrow-review-sync',work);else await work();
}
export async function clearOfflineWorkspace(){
  if((await offlineReviews()).length)throw Error('Synchronize or export pending answers before changing accounts');
  const db=await database?.catch(()=>undefined);db?.close();database=undefined;
  await new Promise<void>((resolve,reject)=>{const deleting=indexedDB.deleteDatabase('morrow-offline-v1');deleting.onsuccess=()=>resolve();deleting.onerror=()=>reject(deleting.error);deleting.onblocked=()=>reject(Error('Close other Morrow tabs before signing out'));});
  for(const key of Object.keys(localStorage))if(key.startsWith('encyclopedia:study:'))localStorage.removeItem(key);
  localStorage.removeItem('morrow:account');
  if('caches' in window)await Promise.all((await caches.keys()).filter(key=>key.startsWith('morrow-')).map(key=>caches.delete(key)));
}
const primed=new Map<string,number>();
let activeCourse:string|undefined;
export async function prepareOfflineCourse(courseId:string){
  if(!navigator.onLine||!window.isSecureContext||!('serviceWorker' in navigator))throw Error('Offline preparation requires HTTPS (or localhost) and a connection.');
  initializeOfflineStudy(courseId);
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)throw Error('Reload once to activate offline storage, then prepare this course.');
  const urls=new Set<string>();
  for(const page of ['/study','/','/browse','/progress']){
    const response=await fetch(page,{headers:{'X-Morrow-Cache':'study','X-Course-Id':courseId,'Accept':'text/html'}});
    if(!response.ok||response.redirected)throw Error('Connect and sign in before preparing this course.');
    const html=new DOMParser().parseFromString(await response.text(),'text/html');
    for(const element of html.querySelectorAll('script[src],link[rel="stylesheet"][href]')){
      const value=element.getAttribute('src')??element.getAttribute('href');if(!value)continue;
      const url=new URL(value,location.origin);if(url.origin===location.origin)urls.add(url.href);
    }
  }
  for(const entry of performance.getEntriesByType('resource')){const url=new URL(entry.name);if(url.origin===location.origin&&(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/fonts/')))urls.add(url.href);}
  const outcomes=await Promise.allSettled([...urls].map(url=>fetch(url).then(response=>{if(!response.ok)throw Error('Asset download failed');})));
  if(outcomes.some(result=>result.status==='rejected'))throw Error('Some offline assets failed to download. Keep the connection and try again.');
  const assets=await caches.open('morrow-assets-v1');
  if((await Promise.all([...urls].map(url=>assets.match(url)))).some(response=>!response))throw Error('Offline storage is full or unavailable. Free space and try again.');
  for(const url of ['/api/courses','/api/xp','/api/learning','/api/review/today','/api/review/queue','/api/review/connect-queue','/api/pronunciation/queue','/api/vocabulary/queue']){
    const response=await fetch(url,{headers:{'X-Course-Id':courseId}});if(!response.ok)throw Error('Offline course inventory is incomplete; try again.');
  }
  await refreshOfflineSnapshot(courseId,false);
  const cached=await caches.open('morrow-study-v1');
  if(!(await cached.match(`${location.origin}/__offline/${courseId}/study`)))throw Error('The study page could not be saved for offline use.');
  return urls.size;
}
export function initializeOfflineStudy(courseId:string){
  if(typeof window==='undefined'||!('indexedDB' in window))return;
  activeCourse=courseId;
  if(!initialized){
    initialized=true;
    // No visual component is required; existing Study screens are reused.
    const sync=()=>{if(navigator.onLine&&!document.hidden)void flushOfflineReviews().then(()=>activeCourse?refreshOfflineSnapshot(activeCourse):undefined).catch(()=>{});};
    window.addEventListener('online',sync);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
    window.addEventListener('pageshow',sync);
    navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='reviews-synced')sync();});
    setInterval(sync,30000);sync();
  }
  if(Date.now()-(primed.get(courseId)??0)<30000)return;
  primed.set(courseId,Date.now());
  if('serviceWorker' in navigator)void navigator.serviceWorker.register('/study-worker.js',{scope:'/'}).then(async()=>{
    const registration=await navigator.serviceWorker.ready;
    void navigator.storage?.persist().catch(()=>{});
    void scheduleBackgroundSync().catch(()=>{});
    if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>{
      navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true});setTimeout(resolve,3000);
    });
    (navigator.serviceWorker.controller??registration.active)?.postMessage({type:'course',id:courseId});
    // Assets loaded before worker activation also need to be available on an
    // offline reload. Reuse the browser's HTTP cache; don't fetch other pages.
    const assets=[...new Set(performance.getEntriesByType('resource').map(entry=>entry.name))].filter(name=>{
      const url=new URL(name);return url.origin===location.origin&&(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/fonts/'));
    });
    await Promise.allSettled(assets.map(name=>fetch(name)));
    await fetch('/study',{headers:{'X-Morrow-Cache':'study','X-Course-Id':courseId,'Accept':'text/html'}});
    await Promise.allSettled(['/api/courses','/api/xp'].map(url=>fetch(url,{headers:{'X-Course-Id':courseId}})));
  }).catch(()=>{});
  void refreshOfflineSnapshot(courseId).catch(()=>{});
}
