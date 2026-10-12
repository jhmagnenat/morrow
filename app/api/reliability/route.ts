import { courseRoute } from '@/lib/courseScope';
import { getGraph, getPassagesForDocument } from '@/lib/db';
import { getStudyCards, pageAnalyses } from '@/lib/qualityDb';
import { reliabilityReport } from '@/lib/reliabilityReport';
import {readPdfFile} from '@/lib/pdfStorage';
import {createHash} from 'node:crypto';
import {reliabilityContext} from '@/lib/reliabilityContext';

async function handleGET() {
  const graph = getGraph();
  const documents=graph.documents.map(d=>{const bytes=readPdfFile(d.id);return {...d,pdfSha256:bytes?createHash('sha256').update(bytes).digest('hex'):undefined};});
  const report = reliabilityReport({...graph,...reliabilityContext(),documents, cards: getStudyCards(), passages: graph.documents.flatMap(d => getPassagesForDocument(d.id))});
  return Response.json({...report, pages: graph.documents.map(d => ({documentId: d.id, title: d.title, declaredPages: d.pageCount, analyses: pageAnalyses(d.id)}))}, {headers: {'Cache-Control': 'no-store'}});
}
export const GET = courseRoute(handleGET);
