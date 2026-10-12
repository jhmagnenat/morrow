import { getDocumentProxy, renderPageAsImage } from "unpdf";
import {createHash} from "node:crypto";
import {pdfPageLayout,type PdfPageLayout} from '@/lib/pdfLayout';
import {recognizePdfImage} from '@/lib/pdfOcr';

declare global {
  var __pdfPageImages:Map<string,Promise<string>>|undefined;
  var __pdfExtractions:Map<string,Promise<ExtractedPage[]>>|undefined;
}

export interface ExtractedPage {
  page: number;
  text: string;
  layout?:PdfPageLayout;
}

export async function extractPdfPages(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
  const cache=globalThis.__pdfExtractions??=new Map<string,Promise<ExtractedPage[]>>();
  const key=`${createHash('sha256').update(new Uint8Array(buffer)).digest('hex')}:${process.env.MORROW_OCR_BINARY??''}:${process.env.MORROW_OCR_LANGUAGES??'eng'}:layout-v1`;
  let extraction=cache.get(key);
  if(!extraction){
    extraction=extractUncachedPdfPages(buffer);cache.set(key,extraction);
    while(cache.size>4)cache.delete(cache.keys().next().value!);
  }
  try{return structuredClone(await extraction);}catch(error){if(cache.get(key)===extraction)cache.delete(key);throw error;}
}

async function extractUncachedPdfPages(buffer:ArrayBuffer):Promise<ExtractedPage[]>{
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  if(pdf.numPages>2000){await pdf.loadingTask.destroy();throw Error('PDF exceeds 2,000 pages');}
  const pages:ExtractedPage[]=Array(pdf.numPages);let cursor=0;
  try{
    // One text extraction per page, bounded parallelism instead of retaining
    // every page's parsing work at once. Preserve PDF.js's exact text order.
    await Promise.all(Array.from({length:Math.min(4,pdf.numPages)},async()=>{
      while(cursor<pdf.numPages){
        const index=cursor++,page=await pdf.getPage(index+1),content=await page.getTextContent(),viewport=page.getViewport({scale:1});
        const items=content.items.filter(item=>'str' in item);
        const text=items.map(item=>item.str+(item.hasEOL?'\n':'')).join('');
        const layout=pdfPageLayout(items.map(item=>({str:item.str,x:Number(item.transform[4]),y:Number(item.transform[5]),width:item.width,height:item.height,fontSize:Math.hypot(item.transform[2],item.transform[3])})),viewport.width,viewport.height);
        if(viewport.rotation){layout.requiresVisualReview=true;layout.warnings.push('Rotated PDF: raw text coordinates need image verification.');}
        pages[index]={page:index+1,text,layout};
        if(text.trim().length<80){
          layout.requiresVisualReview=true;
          if(process.env.MORROW_OCR_BINARY)try{
            const image=await renderPageAsImage(pdf,index+1,{scale:2,toDataURL:true,canvasImport:()=>import('@napi-rs/canvas')});
            const recognized=await recognizePdfImage(image);
            if(recognized?.text.trim())pages[index]={page:index+1,...recognized};
            else layout.warnings.push('OCR found no text; use the original image.');
          }catch{layout.warnings.push('OCR failed; the original PDF is retained for visual review.');}
          else layout.warnings.push('Sparse/scanned page: OCR is not configured; use the original image.');
        }
      }
    }));
    return pages;
  }finally{await pdf.loadingTask.destroy();}
}

// Renders one PDF page as a PNG data URL, so a vision-capable LLM can
// actually see diagrams/schemas that plain text extraction throws away.
// Scale 1.5 is a balance between legibility (small diagram labels) and
// image-token cost.
export async function renderPdfPageAsDataUrl(buffer: ArrayBuffer | Buffer, pageNumber: number): Promise<string> {
  const data = buffer instanceof Buffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const cache=globalThis.__pdfPageImages??=new Map<string,Promise<string>>();
  const key=`${createHash('sha256').update(data).digest('hex')}:${pageNumber}:1.5`;
  const cached=cache.get(key);if(cached)return cached;
  const rendering=(async()=>{
  const pdf = await getDocumentProxy(data);
  // unpdf requires an explicit canvasImport in Node (it has no default —
  // this was silently missing before, so every render call failed and
  // every batch fell back to text-only without ever surfacing an error:
  // the generate route's render try/catch treats a failure as "skip this
  // page's image", not as something worth logging.
  try{return await renderPageAsImage(pdf, pageNumber, {
    scale: 1.5,
    toDataURL: true,
    canvasImport: () => import("@napi-rs/canvas"),
  });}finally{await pdf.loadingTask.destroy();}
  })();
  cache.set(key,rendering);
  // Bounded process cache: reconstruction and audits reuse nearby pages, but
  // loading many courses cannot retain every large PNG in memory.
  while(cache.size>12)cache.delete(cache.keys().next().value!);
  try{return await rendering;}catch(error){if(cache.get(key)===rendering)cache.delete(key);throw error;}
}

const MIN_PASSAGE_LENGTH = 200;
// A generation batch opens/parses its PDF once for all missing primary images.
// Preserve image order; cache hits never reopen the PDF.
export async function renderPdfPagesAsDataUrls(buffer:Buffer,pageNumbers:number[]):Promise<string[]>{
  const cache=globalThis.__pdfPageImages??=new Map<string,Promise<string>>();
  const sha256=createHash('sha256').update(buffer).digest('hex');
  const keys=pageNumbers.map(page=>`${sha256}:${page}:1.5`);
  const missing=[...new Set(pageNumbers.filter((_,index)=>!cache.has(keys[index])))];
  if(missing.length){
    const batch=(async()=>{
      const pdf=await getDocumentProxy(new Uint8Array(buffer));
      try{
        const results=await Promise.allSettled(missing.map(page=>renderPageAsImage(pdf,page,{scale:1.5,toDataURL:true,canvasImport:()=>import('@napi-rs/canvas')})));
        return results;
      }finally{await pdf.loadingTask.destroy();}
    })();
    for(const [index,page] of missing.entries()){
      const key=`${sha256}:${page}:1.5`;
      const rendering=batch.then(results=>{const result=results[index];if(result.status==='rejected')throw result.reason;return result.value;});
      cache.set(key,rendering);rendering.catch(()=>{if(cache.get(key)===rendering)cache.delete(key);});
    }
  }
  const results=await Promise.allSettled(keys.map(key=>cache.get(key)!));
  while(cache.size>12)cache.delete(cache.keys().next().value!);
  const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
  return results.map(r=>(r as PromiseFulfilledResult<string>).value);
}
const MAX_PASSAGE_LENGTH = 1000;

export interface ChunkedPassage {
  page: number;
  ordinal: number;
  text: string;
}

// Splits each page into paragraph-sized passages, merging short consecutive
// paragraphs together so each passage is substantial enough to ground an
// LLM-generated notion without being so long it blows the context budget.
export function chunkPagesIntoPassages(pages: ExtractedPage[]): ChunkedPassage[] {
  const passages: ChunkedPassage[] = [];

  for (const { page, text } of pages) {
    const paragraphs = text
      .split(/\n\s*\n/)
      // Preserve line boundaries: they can separate table rows, formula steps
      // or a condition from its example. Normalize horizontal spacing only.
      .map((p) => p.replace(/[^\S\r\n]+/g, " ").trim())
      .filter((p) => p.length > 0);

    if (!paragraphs.length) passages.push({page, ordinal: 0, text: ""});
    let buffer = "";
    let ordinal = 0;

    const flush = () => {
      if (buffer.trim().length === 0) return;
      passages.push({ page, ordinal: ordinal++, text: buffer.trim() });
      buffer = "";
    };

    for (const paragraph of paragraphs) {
      if (buffer.length > 0 && buffer.length + paragraph.length > MAX_PASSAGE_LENGTH) {
        flush();
      }
      buffer = buffer.length > 0 ? `${buffer}\n\n${paragraph}` : paragraph;
      if (buffer.length >= MIN_PASSAGE_LENGTH && buffer.length >= MAX_PASSAGE_LENGTH * 0.6) {
        flush();
      }
    }
    flush();
  }

  return passages;
}
