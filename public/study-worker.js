/* Cache visited Study pages/assets, never successful mutations or secrets.
   Offline grades are committed to IndexedDB by the shared review library. */
const CACHE = 'morrow-study-v1';
const ASSETS = 'morrow-assets-v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('sync',event=>{if(event.tag==='morrow-reviews')event.waitUntil(syncReviews());});
self.addEventListener('message', event => {
  if (event.data?.type === 'course' && /^[a-zA-Z0-9_-]+$/.test(event.data.id)) event.waitUntil(
    caches.open(CACHE).then(cache=>cache.put('/__offline/active',Response.json({id:event.data.id}))));
  if(event.data?.type==='sync-reviews')event.waitUntil(syncReviews());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if(url.origin===self.location.origin&&request.method==='POST'&&(/^\/api\/courses\/[^/]+\/activate$/.test(url.pathname)||url.pathname==='/api/courses')){
    event.respondWith((async()=>{
      const response=await fetch(request);
      if(response.ok){
        const data=await response.clone().json(),id=data.course?.id??url.pathname.split('/')[3];
        if(/^[a-zA-Z0-9_-]+$/.test(id))await (await caches.open(CACHE)).put('/__offline/active',Response.json({id}));
      }
      return response;
    })());return;
  }
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  const asset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/') || url.pathname==='/manifest.webmanifest';
  const navigation = (request.mode === 'navigate'||request.headers.get('X-Morrow-Cache')==='study') && ['/study','/browse','/progress','/'].includes(url.pathname);
  const api = ['/api/courses','/api/xp','/api/learning','/api/review/today','/api/review/queue','/api/review/connect-queue','/api/pronunciation/queue','/api/vocabulary/queue'].includes(url.pathname) || /^\/api\/review\/[^/]+\/[^/]+\/intervals$/.test(url.pathname);
  const media = /^\/api\/anki\/packages\/[a-f0-9]{64}\/media\//.test(url.pathname) && !request.headers.has('Range');
  const pdf = /^\/api\/documents\/[a-zA-Z0-9_-]+\/file$/.test(url.pathname);
  if (!asset && !navigation && !api && !media && !pdf) return;
  event.respondWith((async () => {
    const cache = await caches.open(asset ? ASSETS : CACHE);
    const active=await cache.match('/__offline/active');
    const selected = request.headers.get('X-Course-Id') || ((media||pdf)&&url.searchParams.get('courseId')) || (active? (await active.json()).id:'default');
    const key = asset ? request : new Request(`${url.origin}/__offline/${selected}${url.pathname}${url.search}`);
    if (asset) { const saved = await cache.match(key); if (saved) return saved; }
    try {
      const response = await fetch(request);
      if (response.ok && !response.redirected) {
        // Cache quota failures must never turn a successful online response
        // into an offline error. Review writes remain independently durable.
        if(!pdf||!request.headers.has('Range')&&Number(response.headers.get('Content-Length'))>0&&Number(response.headers.get('Content-Length'))<=32*1024*1024)await cache.put(key, response.clone()).catch(()=>{});
        // Bound cache entries without evicting current-build dependencies.
        if (!asset) { const keys=await cache.keys(); for(const old of keys.slice(0,Math.max(0,keys.length-120)))await cache.delete(old); }
      }
      return response;
    } catch {
      const saved=await cache.match(key);
      if(saved&&pdf&&request.headers.has('Range'))return cachedRange(saved,request.headers.get('Range'));
      return saved || new Response('Open this course online once before studying offline.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }
  })());
});
async function cachedRange(response,range){
  const bytes=await response.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
  let start=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,bytes.byteLength-Number(match[2])):NaN;
  let end=match?.[1]&&match?.[2]?Number(match[2]):bytes.byteLength-1;
  end=Math.min(end,bytes.byteLength-1);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
  const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${end}/${bytes.byteLength}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
  return new Response(bytes.slice(start,end+1),{status:206,headers});
}

// Same durable outbox and server receipts as the foreground. Supported
// browsers may replay after the app closes; others keep foreground replay.
let syncing;
async function syncReviews(){
  if(syncing)return syncing;
  syncing=(async()=>{
    const work=async()=>{
      const db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('morrow-offline-v1',2);
        // Do not create an incomplete database when no app has initialized it.
        request.onupgradeneeded=()=>request.transaction.abort();
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      try{
        const rows=await outboxTransaction(db,'readonly',store=>store.getAll());
        const blocked=new Set();let changed=false;
        for(const review of rows.sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt))){
          if(review.error||blocked.has(review.cardKey)){blocked.add(review.cardKey);continue;}
          const response=await fetch(`/api/review/${review.type}/${encodeURIComponent(review.cardId)}/grade`,{
            method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Course-Id':review.courseId},
            body:JSON.stringify({grade:review.grade,requestId:review.id,baseRevision:review.baseRevision,reviewedAt:review.reviewedAt,previousRequestId:review.previousRequestId}),
            signal:AbortSignal.timeout(10000),
          });
          if(response.ok){await outboxTransaction(db,'readwrite',store=>store.delete(review.id));changed=true;}
          else if(response.status===401||response.status===403||response.status>=500)throw Error('Review synchronization needs a connection and an authenticated session');
          else{
            const body=await response.json().catch(()=>({}));
            await outboxTransaction(db,'readwrite',store=>store.put({...review,error:body.error??'Synchronization conflict'}));blocked.add(review.cardKey);
          }
        }
        if(changed)for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'reviews-synced'});
      }finally{db.close();}
    };
    if(self.navigator?.locks)await self.navigator.locks.request('morrow-review-sync',work);else await work();
  })();
  try{await syncing;}finally{syncing=undefined;}
}
function outboxTransaction(db,mode,work){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('reviews',mode),request=work(tx.objectStore('reviews'));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error??request.error);
  });
}
