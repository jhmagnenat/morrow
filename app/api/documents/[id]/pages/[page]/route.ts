import { courseRoute } from "@/lib/courseScope";
import { getGraph, getPassagesForDocument,openDb } from "@/lib/db";
import { getDocumentStudyCards, pageAnalyses } from "@/lib/qualityDb";
import {loadSourceDocument} from '@/lib/sourceDocument';
import { readPdfFile } from "@/lib/pdfStorage";

async function handleGET(_request:Request,{params}:{params:Promise<{id:string;page:string}>}){
  const {id,page:raw}=await params, page=Number(raw), graph=getGraph();
  const document=graph.documents.find(d=>d.id===id);
  if(!document)return Response.json({error:"Document not found"},{status:404});
  if(!Number.isInteger(page) || page<1 || page>(document.pageCount ?? 0))return Response.json({error:"Invalid slide"},{status:400});
  const matches=(e:{documentId:string;page:number})=>e.documentId===id && e.page===page;
  const stored=openDb().prepare('SELECT value FROM quality_settings WHERE key=?').get(`pdf-layout:${id}`);
  const layout=stored?JSON.parse(String(stored.value)).find((p:{page:number})=>p.page===page)?.layout:null;
  const source=loadSourceDocument(openDb(),id);
  return Response.json({document,page,hasPdf:Boolean(readPdfFile(id)),sourceRevision:source?.revision,sourceOrigin:source?.origin,text:source?.pages.find(p=>p.page===page)?.text??getPassagesForDocument(id).filter(p=>p.page===page).map(p=>p.text).join("\n"),
    notions:graph.notions.filter(n=>n.sources.some(matches) || n.evidence?.some(matches)),
    cards:getDocumentStudyCards(id,[page]),analysis:pageAnalyses(id).find(p=>p.page===page) ?? null,layout});
}
export const GET=courseRoute(handleGET);
