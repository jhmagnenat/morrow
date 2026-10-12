import {pageAnalyses} from '@/lib/qualityDb';
import {pendingGenerationPages} from '@/lib/generationRepository';
import {DIRECT_CARD_VERSION} from '@/lib/directCardContracts';
import type {GenerationOptions} from '@/lib/generationTypes';

// One production engine for HTTP and worker execution. Historical modes do
// not select alternate architectures. Teaching reconstruction is the default.
export async function generateConfiguredSection(documentId:string,options:GenerationOptions){
  const {generateDirectCards}=await import('@/lib/directCardGeneration');
  const attempted=new Set(pageAnalyses(documentId).filter(p=>p.status==='retry'&&p.version===DIRECT_CARD_VERSION).map(p=>p.page));
  const pages=options.pages??pendingGenerationPages(documentId).filter(p=>!options.skipRetried||!attempted.has(p)).slice(0,3);
  return generateDirectCards(documentId,{...options,pages});
}
