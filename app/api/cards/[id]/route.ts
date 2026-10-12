import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getStudyCards, saveStudyCard } from "@/lib/qualityDb";
import { cardQuality } from "@/lib/contentQuality";
import {cardContentHash,recallContentHash} from '@/lib/contentReview';
import {readPdfFile} from '@/lib/pdfStorage';
import {originalPdfHash,loadSourceDocument} from '@/lib/sourceDocument';
import {openDb} from '@/lib/db';
import {hasSourceTeachingText} from '@/lib/sourceSections';
import {currentUser} from '@/lib/identityScope';
async function handlePATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params, body=await request.json().catch(()=>null);
  const card=getStudyCards().find(c=>c.id===id);
  if (!card) return NextResponse.json({error:"Card not found"},{status:404});
  if (!body || (body.status!==undefined && !["draft","ready","suspended"].includes(body.status))) return NextResponse.json({error:"Invalid card status"},{status:400});
  if(body.visualApproval!==undefined&&typeof body.visualApproval!=='boolean')return NextResponse.json({error:'Invalid visual approval'},{status:400});
  for (const field of ["question","answer","example","explanation"] as const) if (body[field]!==undefined && (typeof body[field]!=="string" || body[field].length>10000)) return NextResponse.json({error:`Invalid ${field}`},{status:400});
  const updated={...card,question:body.question ?? card.question,answer:body.answer ?? card.answer,example:body.example ?? card.example,explanation:body.explanation ?? card.explanation,status:body.status ?? card.status,userEdited:true};
  if(updated.question!==card.question||updated.answer!==card.answer||updated.example!==card.example||updated.explanation!==card.explanation)updated.teaching=undefined;
  if(updated.status==='ready'){
    const visual=updated.evidence.filter(e=>!e.quote.trim()||e.visualDescription||!card.teaching&&!hasSourceTeachingText(loadSourceDocument(openDb(),e.documentId)?.pages.find(p=>p.page===e.page)?.text??e.quote));
    if(visual.length&&body.visualApproval!==true)return NextResponse.json({error:'Check the original image and confirm its facts before approving this card.'},{status:422});
    if(visual.length){
      const hashes=new Map<string,string>();
      for(const e of visual){const hash=originalPdfHash(readPdfFile(e.documentId));if(!hash)return NextResponse.json({error:'Restore the original PDF before approving visual evidence.'},{status:422});hashes.set(e.documentId,hash);}
      updated.evidence=updated.evidence.map(e=>{
        if(!visual.includes(e))return e;
        const description=`Original image checked for question: ${updated.question}\nAnswer: ${updated.answer}`;
        return {...e,quote:'',visualDescription:description,visualReview:{reviewer:currentUser()?.id??'Local workspace user',reviewedAt:new Date().toISOString(),pdfSha256:hashes.get(e.documentId)!,page:e.page,description,scope:'visible-facts-only' as const,recallHash:recallContentHash(updated)}};
      });
    }
  }
  // A user's explicit approval of an edit is human verification, never reuse
  // the model's old approval for changed text. Source checks still run on save.
  if(cardContentHash(updated)!==cardContentHash(card))updated.accuracyReview=undefined;
  const warnings=cardQuality(updated.question,updated.answer,updated.kind);
  if (updated.status==="ready" && warnings.length) return NextResponse.json({error:warnings.join("; ")},{status:400});
  return NextResponse.json({card:saveStudyCard(updated)});
}

export const PATCH = courseRoute(handlePATCH);
