import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { insertDocument, insertPassages, listDocumentsWithStats,openDb } from "@/lib/db";
import { chunkPagesIntoPassages, extractPdfPages } from "@/lib/pdf";
import { savePdfFile,deletePdfFile } from "@/lib/pdfStorage";
import {getDocumentGeneration} from '@/lib/documentGeneration';
import type { DocumentKind } from "@/lib/types";
import {MAX_PDF_UPLOAD_BYTES,MAX_PDF_UPLOAD_BODY_BYTES,PDF_UPLOAD_LIMIT_MESSAGE} from '@/lib/documentUpload';
import {storeSourceDocument,originalPdfHash} from '@/lib/sourceDocument';

async function handleGET() {
  return NextResponse.json({ documents: listDocumentsWithStats().map(d=>({...d,generationJob:getDocumentGeneration(d.id)})) });
}

const VALID_KINDS: DocumentKind[] = ["book", "course", "article", "regulation"];

async function handlePOST(request: Request) {
  const contentLength=Number(request.headers.get('Content-Length'));
  if(contentLength>MAX_PDF_UPLOAD_BODY_BYTES)return NextResponse.json({error:PDF_UPLOAD_LIMIT_MESSAGE},{status:413});
  let formData:FormData;
  try{formData=await request.formData();}
  catch{return NextResponse.json({error:'The upload could not be read. Please select the PDF again and retry.'},{status:400});}
  const file = formData.get("file");
  const title = formData.get("title");
  const kindRaw = formData.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }
  if(file.size>MAX_PDF_UPLOAD_BYTES)return NextResponse.json({error:PDF_UPLOAD_LIMIT_MESSAGE},{status:413});
  const kind: DocumentKind = VALID_KINDS.includes(kindRaw as DocumentKind)
    ? (kindRaw as DocumentKind)
    : "book";
  const docTitle = typeof title === "string" && title.trim().length > 0 ? title.trim() : file.name;

  const buffer = await file.arrayBuffer();
  if(Buffer.from(buffer).subarray(0,5).toString()!=='%PDF-')return NextResponse.json({error:'This file is not a valid PDF.'},{status:400});
  // pdf.js detaches the ArrayBuffer it's given during parsing, so a copy is
  // saved to disk before extraction touches the original — saving the
  // now-detached buffer afterward throws ("Cannot perform Construct on a
  // detached ArrayBuffer").
  const bufferForStorage = buffer.slice(0);
  let pages;
  try{pages=await extractPdfPages(buffer);}
  catch(error){
    const reason=error instanceof Error?error.message:'';
    const message=/password/i.test(reason)?'This PDF is password-protected. Remove its password before uploading.':/2,000 pages/.test(reason)?'This PDF exceeds the 2,000-page limit. Split it into smaller documents.':'This PDF could not be opened. Check that it is readable or export it again as a PDF.';
    return NextResponse.json({error:message},{status:422});
  }
  const passages = chunkPagesIntoPassages(pages);

  const db=openDb();db.exec('BEGIN IMMEDIATE');
  let insertedId:string|undefined;
  try{
  const document = insertDocument({
    title: docTitle,
    kind,
    filename: file.name,
    pageCount: pages.length,
  });
  insertedId=document.id;

  // Kept on disk (not just the extracted text) so generation can later
  // render a page as an image for a vision-capable model — plain text
  // extraction throws away every diagram/schema on the slide.
    savePdfFile(document.id, bufferForStorage);
    insertPassages(
    passages.map((p) => ({ documentId: document.id, page: p.page, ordinal: p.ordinal, text: p.text }))
    );
    db.prepare('INSERT INTO quality_settings(key,value) VALUES(?,?)').run(`pdf-layout:${document.id}`,JSON.stringify(pages.map(p=>({page:p.page,layout:p.layout}))));
    storeSourceDocument(db,document.id,pages,originalPdfHash(Buffer.from(bufferForStorage)));
    db.exec('COMMIT');

  return NextResponse.json(
    { document: { ...document, passageCount: passages.length, generatedPassageCount: 0 } },
    { status: 201 }
  );
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');if(insertedId)deletePdfFile(insertedId);throw error;}
}

export const GET = courseRoute(handleGET);
export const POST = courseRoute(handlePOST);
