import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getGraph, getPassagesForDocument,openDb } from "@/lib/db";
import { readPdfFile, savePdfFile,deletePdfFile } from "@/lib/pdfStorage";
import { extractPdfPages } from "@/lib/pdf";
import {loadSourceDocument,storeSourceDocument,originalPdfHash} from '@/lib/sourceDocument';
async function handleGET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if (!getGraph().documents.some(d=>d.id===id)) return NextResponse.json({error:"Document not found"},{status:404});
  const bytes=readPdfFile(id);
  if (!bytes) return NextResponse.json({error:"Original PDF not in this backup"},{status:404});
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Length":String(bytes.byteLength),"Cache-Control":"private, no-store"}});
}

export const GET = courseRoute(handleGET);
async function handlePUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params,doc=getGraph().documents.find(d=>d.id===id);
  if(!doc)return NextResponse.json({error:"Document not found"},{status:404});
  const form=await request.formData(),file=form.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"PDF file required"},{status:400});
  const bytes=await file.arrayBuffer();
  if(Buffer.from(bytes).subarray(0,5).toString()!=="%PDF-")return NextResponse.json({error:"Invalid PDF"},{status:400});
  let pages;
  try{pages=await extractPdfPages(bytes.slice(0));}catch{return NextResponse.json({error:"Could not parse this PDF"},{status:400});}
  if(doc.pageCount && pages.length!==doc.pageCount)return NextResponse.json({error:"This PDF has a different number of slides"},{status:400});
  const normalize=(s:string)=>s.normalize("NFC").replace(/\s+/g," ").trim();
  const source=loadSourceDocument(openDb(),id);
  const originals=getPassagesForDocument(id);
  for(const page of pages){
    const previous=normalize(source?.pages.find(p=>p.page===page.page)?.text??originals.filter(p=>p.page===page.page).map(p=>p.text).join(" "));
    if(previous.length>=12 && !normalize(page.text).includes(previous))return NextResponse.json({error:`Slide ${page.page} does not match the backed-up text. Upload it as a new document instead.`},{status:400});
  }
  if(!getGraph().documents.some(d=>d.id===id))return NextResponse.json({error:"Document was deleted"},{status:409});
  const db=openDb(),previousPdf=readPdfFile(id);db.exec('BEGIN IMMEDIATE');
  try{
    savePdfFile(id,bytes);
    db.prepare('INSERT INTO quality_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`pdf-layout:${id}`,JSON.stringify(pages.map(p=>({page:p.page,layout:p.layout}))));
    storeSourceDocument(db,id,pages,originalPdfHash(Buffer.from(bytes)));
    db.exec('COMMIT');
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');if(previousPdf)savePdfFile(id,Uint8Array.from(previousPdf).buffer);else deletePdfFile(id);throw error;}
  return NextResponse.json({ok:true});
}
export const PUT=courseRoute(handlePUT);
