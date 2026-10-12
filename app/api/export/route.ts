import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { snapshotWithPdfs } from "@/lib/backup";
import { getGraph, getPassagesForDocument } from '@/lib/db';
import { getStudyCards } from '@/lib/qualityDb';
import { ankiExport } from '@/lib/ankiExport';
import {exportAnkiPackage} from '@/lib/ankiPackageExport';
import {reliabilityContext} from '@/lib/reliabilityContext';

async function handleGET(request: Request) {
  const format = new URL(request.url).searchParams.get('format');
  if (format && !['json', 'anki','apkg'].includes(format)) return Response.json({error: 'Supported formats: json, anki, apkg'}, {status: 400});
  if(format==='apkg'){
    try{const graph=getGraph(),result=exportAnkiPackage({...graph,...reliabilityContext(),cards:getStudyCards(),passages:graph.documents.flatMap(d=>getPassagesForDocument(d.id))},new URL(request.url).searchParams.get('progress')==='true');
      return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="morrow.apkg"','Cache-Control':'no-store','X-Exported-Cards':String(result.exported),'X-Excluded-Cards':String(result.excluded)}});
    }catch(error){return Response.json({error:error instanceof Error?error.message:'Anki export failed'},{status:400});}
  }
  if (format === 'anki') {
    const graph = getGraph();
    const result = ankiExport({...graph,...reliabilityContext(), cards: getStudyCards(), passages: graph.documents.flatMap(d => getPassagesForDocument(d.id))});
    return new NextResponse(result.text, {headers: {'Content-Type': 'text/tab-separated-values; charset=utf-8', 'Content-Disposition': 'attachment; filename="encyclopedia-anki.tsv"', 'Cache-Control': 'no-store', 'X-Exported-Cards': String(result.exported), 'X-Excluded-Cards': String(result.excluded)}});
  }
  const snapshot = snapshotWithPdfs();
  const filename = `encyclopedia-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = courseRoute(handleGET);
