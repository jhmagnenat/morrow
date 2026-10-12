import {randomUUID} from 'node:crypto';
import {openDb,markPassagesGenerated} from '@/lib/db';
import {getDocumentStudyCards,saveGenerationRun,savePageAnalysis,archiveDirectMetadataNotions} from '@/lib/qualityDb';
import {structuredCompletion,currentProviderLabel} from '@/lib/llm';
import {withLlmTelemetry,type LlmTelemetry} from '@/lib/llmTelemetry';
import {sourceCatalog} from '@/lib/sourceCatalog';
import {sourceContext,requiresSourceImage,administrativePageReason} from '@/lib/sourceSections';
import {renderPdfPagesAsDataUrls} from '@/lib/pdf';
import {DIRECT_CARD_VERSION} from '@/lib/directCardContracts';
import {generateProfessorCourse,professorPrompts} from '@/lib/professorGeneration';
import {readGenerationDocument,pendingGenerationPages,assertGenerationSource,publishGeneration,generationDigest} from '@/lib/generationRepository';
import type {GenerationOptions,GenerationSource,GenerationModel} from '@/lib/generationTypes';
import type {Notion,Link} from '@/lib/types';
import {findSchemaViolations} from '@/lib/structuredSchema';
import {saveTeachingLesson} from '@/lib/teachingStorage';

// Application adapter: source repository -> pure engine -> atomic publication.
// Reconstructed teaching -> reviewed multidimensional cards -> atomic publication.
export function generateDirectCards(documentId:string,options:GenerationOptions){
  const usage:LlmTelemetry={requests:0,inputTokens:0,outputTokens:0,elapsedMs:0,failures:0};
  return withLlmTelemetry(usage,()=>generate(documentId,options,usage));
}
async function generate(documentId:string,options:GenerationOptions,usage:LlmTelemetry){
  const result={notions:[] as Notion[],links:[] as Link[],cardsCreated:0,readyCards:0,processed:0,warnings:[] as string[],usage};
  const db=openDb();let pages=pendingGenerationPages(documentId).filter(p=>!options.pages||options.pages.includes(p));
  if(pages.length>3)throw Error('Direct generation accepts at most three pages per batch');
  if(!pages.length)return result;
  const requestedPages=[...pages];
  const runId=randomUUID(),startedAt=new Date().toISOString();
  const notify=(stage:string)=>pages.forEach(page=>options.onProgress?.(page,stage));
  const {title,pdf,source}=readGenerationDocument(documentId);
  const reusedInspections:number[]=[];
  const contract={version:DIRECT_CARD_VERSION,teachingPromptHash:generationDigest(professorPrompts.teach),teachingReviewPromptHash:generationDigest(professorPrompts.reviewLesson),writerPromptHash:generationDigest(professorPrompts.cards),reviewPromptHash:generationDigest(professorPrompts.reviewCards),writerModel:currentProviderLabel(),reviewModel:currentProviderLabel(true),cardDetail:options.cardDetail??'key-ideas'};
  const finish=(status:string)=>saveGenerationRun(runId,documentId,{id:runId,documentId,status,...contract,pages:requestedPages,reusedInspections,sourceRevision:source.revision,startedAt,finishedAt:new Date().toISOString(),usage,readyCards:result.readyCards,cardsCreated:result.cardsCreated,artifactKey:pages.length?`direct-card-run:${documentId}:${runId}`:undefined,warnings:result.warnings});
  try{
    assertGenerationSource(source,options.claimId);notify('Reading original sources');
    const administrative=source.pages.filter(p=>pages.includes(p.page)&&administrativePageReason(p,source.pages));
    if(administrative.length){
      db.exec('BEGIN IMMEDIATE');
      try{
        assertGenerationSource(source,options.claimId);
        archiveDirectMetadataNotions(documentId,source.pages.filter(p=>administrativePageReason(p,source.pages)).map(p=>p.page));
        for(const page of administrative){
          savePageAnalysis(documentId,{page:page.page,kind:'administrative',status:'skipped',generationComplete:true,reason:administrativePageReason(page,source.pages)!,warnings:[],concepts:0,cards:0,readyCards:0,draftCards:0,missingObjectives:[],version:DIRECT_CARD_VERSION,sourceRevision:source.revision,updatedAt:new Date().toISOString()});
          const ids=db.prepare('SELECT id FROM passages WHERE document_id=? AND page=? AND generated=0').all(documentId,page.page).map(p=>String(p.id));markPassagesGenerated(ids);result.processed+=ids.length;
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      pages=pages.filter(p=>!administrative.some(a=>a.page===p));
      if(!pages.length){finish('complete');return result;}
    }
    const primary=source.pages.filter(p=>pages.includes(p.page));
    const context=sourceContext(pages,source.pages.filter(p=>!administrativePageReason(p,source.pages)));
    const needsVisualContext=primary.some(p=>/top\s*\d|according to.{0,40}(?:chart|figure)|graphique|diagramme/i.test(p.text));
    const imagePages=[...new Set([...primary.filter(requiresSourceImage),...(needsVisualContext?context.filter(p=>!pages.includes(p.page)&&requiresSourceImage(p)):[])].map(p=>p.page))];
    if(imagePages.length&&!pdf)throw Error('Original PDF required for visual pages; text-only fallback refused');
    const images=imagePages.length?await renderPdfPagesAsDataUrls(pdf!,imagePages):[];
    const input:GenerationSource={documentId,title,pdfSha256:source.pdfSha256??undefined,reviewerLabel:currentProviderLabel(true),courseOutline:source.pages.slice(0,3).map(p=>p.text).join('\n').slice(0,2000),layouts:primary.filter(p=>p.layout).map(p=>({page:p.page,width:p.layout!.width,height:p.layout!.height,blocks:p.layout!.blocks.map(b=>({text:b.text,x:b.x,y:b.y,width:b.width,height:b.height}))})),revision:source.revision,primaryPages:pages,snippets:sourceCatalog(context),imagePages,images,uncertainOcrPages:source.pages.filter(p=>p.layout?.origin==='ocr'&&p.layout.blocks.some(b=>(b.confidence??0)<80||/\d/.test(b.text)&&(b.confidence??0)<90)).map(p=>p.page)};
    const existing=getDocumentStudyCards(documentId);
    const model:GenerationModel={async complete<T>(system:string,input:unknown,tool:string,description:string,schema:Record<string,unknown>,images:string[]):Promise<T>{
      assertGenerationSource(source,options.claimId);notify(tool==='reconstruct_teaching'?'Reconstructing the lesson from your slides':tool==='audit_teaching'?'Checking the lesson and added context':tool==='teaching_cards'?'Creating recall, understanding and application cards':'Checking cards against the reconstructed lesson');
      const cacheKey=`generation-output:${documentId}:${generationDigest({version:DIRECT_CARD_VERSION,revision:source.revision,model:currentProviderLabel(tool.startsWith('audit_')),system,input,tool,schema,images:images.map(image=>generationDigest(image))})}`;
      const cached=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(cacheKey);
      if(cached){const output=JSON.parse(String(cached.value));if(!findSchemaViolations(output,schema).length)return output as T;}
      const output=await structuredCompletion<T>(system,JSON.stringify(input),tool,description,schema,images);
      assertGenerationSource(source,options.claimId);
      if(!findSchemaViolations(output,schema).length)db.prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(cacheKey,JSON.stringify(output));
      return output;
    }};
    const output=await generateProfessorCourse(input,model,options.cardDetail,lesson=>{
      assertGenerationSource(source,options.claimId,true);saveTeachingLesson(lesson);
    });
    db.prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`direct-card-run:${documentId}:${runId}`,JSON.stringify({...contract,sourceRevision:source.revision,pdfSha256:source.pdfSha256,sourceOrigin:source.origin,pages,imagePages,...output}));
    notify('Saving checked cards');
    const saved=publishGeneration(source,title,pages,output,existing,options,currentProviderLabel());
    Object.assign(result,{...saved,readyCards:result.readyCards+saved.readyCards,processed:result.processed+saved.processed});
    result.warnings.push(...(output.diagnostics??[]).filter(d=>/no credits remaining|insufficient[_ ](?:quota|credits)|credit balance|billing/i.test(d)));
    finish(result.warnings.length?'needs_review':'complete');return result;
  }catch(error){
    const reason=error instanceof Error?error.message:'Direct generation failed';
    if(/canceled/i.test(reason))throw error;
    assertGenerationSource(source,options.claimId);result.warnings.push(reason);
    for(const page of pages)savePageAnalysis(documentId,{page,kind:'content',status:'retry',generationComplete:false,failureKind:/Invalid direct card/.test(reason)?'contract':/PDF|source/i.test(reason)?'source':'provider',reason,warnings:[reason],concepts:0,cards:0,missingObjectives:[reason],version:DIRECT_CARD_VERSION,sourceRevision:source.revision,updatedAt:new Date().toISOString()});
    finish('needs_review');return result;
  }
}
