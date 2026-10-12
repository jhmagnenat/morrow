import type {DocumentGenerationJob} from '@/lib/documentGeneration';
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
export async function requestDocumentGeneration(fetcher:Fetcher,documentId:string,options:{mode:string;enrichment:boolean;cardDetail?:'key-ideas'|'comprehensive';pages?:number[];reprocess?:boolean}):Promise<DocumentGenerationJob> {
  const res=await fetcher(`/api/documents/${documentId}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...options,background:true})});
  const data=await res.json();
  if(!res.ok || !data.job)throw new Error(data.error??'Could not start generation');
  return data.job;
}
export async function watchDocumentGeneration(fetcher:Fetcher,initial:DocumentGenerationJob,onUpdate:(job:DocumentGenerationJob)=>void|Promise<void>,canceled:()=>boolean,delay=1200) {
  let job=initial;
  while(!canceled()){
    await onUpdate(job);
    if(job.status!=='running')return job;
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(canceled())return;
    let error:unknown;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const res=await fetcher(`/api/documents/${job.documentId}/generate`,{cache:'no-store'}),data=await res.json();
        if(!res.ok || !data.job)throw new Error(data.error??'Generation status is unavailable');
        if(data.job.id!==initial.id)return; // A clear/new job replaced this observer.
        job=data.job;error=undefined;break;
      }catch(failure){error=failure;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,delay));}
    }
    if(error)throw new Error('Unable to read generation progress. The server keeps working; reopening this page reconnects to it.');
  }
}
