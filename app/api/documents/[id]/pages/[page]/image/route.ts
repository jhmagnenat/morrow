import { courseRoute } from "@/lib/courseScope";
import { getGraph } from "@/lib/db";
import { readPdfFile } from "@/lib/pdfStorage";
import { renderPdfPageAsDataUrl } from "@/lib/pdf";

async function handleGET(_request:Request,{params}:{params:Promise<{id:string;page:string}>}){
  const {id,page:raw}=await params, page=Number(raw), document=getGraph().documents.find(d=>d.id===id);
  if(!document)return Response.json({error:"Document not found"},{status:404});
  if(!Number.isInteger(page) || page<1 || page>(document.pageCount ?? 0))return Response.json({error:"Invalid slide"},{status:400});
  const pdf=readPdfFile(id);
  if(!pdf)return Response.json({error:"Original PDF unavailable. Restore it from Documents or Content quality."},{status:404});
  try{
    const image=await renderPdfPageAsDataUrl(pdf,page);
    const encoded=/^data:image\/png;base64,(.+)$/.exec(image);
    if(!encoded)throw new Error("Unsupported slide image");
    return new Response(Buffer.from(encoded[1],"base64"),{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300","Vary":"X-Course-Id"}});
  }catch{return Response.json({error:"Unable to display this slide. The extracted text is available below."},{status:422});}
}
export const GET=courseRoute(handleGET);
