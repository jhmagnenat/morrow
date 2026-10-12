import {randomUUID} from 'node:crypto';
import {openDb,insertNotion,markPassagesGenerated} from '@/lib/db';
import {getDocumentStudyCards,saveStudyCards,setNotionMetadata,attachSource,savePageAnalysis,pageAnalyses} from '@/lib/qualityDb';
import {readGenerationDocument,assertGenerationSource} from '@/lib/generationRepository';
import {canonicalLabel,reusableStudyCard,cardQuality,type StudyCard,type Evidence} from '@/lib/contentQuality';
import {recallContentHash,createCardReview,cardContentHash} from '@/lib/contentReview';
import {createRecoveryPoint} from '@/lib/recovery';
import {knowledgeCheckQuestions} from '@/lib/sourceSections';

export interface InspectedGeneration {
  pdfSha256:string;reviewer:string;reviewedAt:string;
  coverage?:'essential'|'partial';
  facts:Array<{page:number;topic:string;claim:string;question:string;answer:string;kind:StudyCard['kind'];evidenceKind?:'text'|'image';contextPages?:number[];replace?:{cardId:string;contentHash:string}}>;
  excludedPages?:Array<{page:number;reason:string}>;
}
export const INSPECTED_SELECTION_WARNING='Superseded by inspected essential source facts; original content and history retained';

// Explicit source inspection is a separate path from automatic model auditing.
// The caller attests the facts; hashes establish unchanged provenance, not truth.
export function publishInspectedGeneration(documentId:string,record:InspectedGeneration){
  const {source,title}=readGenerationDocument(documentId),db=openDb();
  if(!record.reviewer.trim()||!Number.isFinite(Date.parse(record.reviewedAt))||record.pdfSha256!==source.pdfSha256||!record.facts.length)throw Error('An identified inspection of the unchanged original PDF is required');
  if(db.prepare("SELECT 1 FROM generation_jobs WHERE document_id=? AND status='running'").get(documentId))throw Error('Cannot publish while generation is running');
  const questions=new Set<string>();
  for(const fact of record.facts){
    if(!source.pages.some(p=>p.page===fact.page)||!fact.topic.trim()||!fact.claim.trim()||questions.has(fact.question)||cardQuality(fact.question,fact.answer,fact.kind).length)throw Error('Invalid or repeated inspected source fact');
    questions.add(fact.question);
  }
  for(const excluded of record.excludedPages??[])if(!source.pages.some(p=>p.page===excluded.page)||record.facts.some(f=>f.page===excluded.page)||excluded.reason.trim().length<20||knowledgeCheckQuestions(source.pages.find(p=>p.page===excluded.page)!).length)throw Error('Invalid inspected non-teaching classification');
  const recovery=createRecoveryPoint('before-inspected-source-publication');
  db.exec('BEGIN IMMEDIATE');
  try{
    assertGenerationSource(source,undefined,true);
    const baseline=getDocumentStudyCards(documentId),studied=new Set(db.prepare('SELECT card_id FROM review_state').all().map(r=>String(r.card_id))),pending:StudyCard[]=[],retained=new Set<string>(),pages=[...new Set([...record.facts.map(f=>f.page),...(record.excludedPages??[]).map(p=>p.page)])];
    const groups=db.prepare('SELECT DISTINCT n.id,n.label FROM notions n JOIN notion_sources s ON s.notion_id=n.id WHERE s.document_id=?').all(documentId).map(n=>({id:String(n.id),label:String(n.label)}));
    for(const fact of record.facts){
      let group=groups.find(n=>canonicalLabel(n.label)===canonicalLabel(fact.topic));
      const provisional:StudyCard={id:randomUUID(),notionId:group?.id,cardType:'notion',question:fact.question,answer:fact.answer,objective:fact.claim,kind:fact.kind,example:'',explanation:'',status:'ready',warnings:[],userEdited:false,model:record.reviewer,promptVersion:'source-inspection-v1',reviewedConceptDefinition:fact.claim,evidence:[]};
      const description=`Inspected original figure: ${fact.claim}`;
      const evidence:Evidence[]=fact.evidenceKind==='text'?[...new Set([fact.page,...(fact.contextPages??[])])].map(page=>{
        const text=source.pages.find(p=>p.page===page)?.text;
        if(!text||text.trim().length<12)throw Error('Original text is required for every inspected textual source');
        return {documentId,page,quote:text};
      }):[{documentId,page:fact.page,quote:'',visualDescription:description,visualReview:{reviewer:record.reviewer,reviewedAt:record.reviewedAt,pdfSha256:record.pdfSha256,page:fact.page,description,scope:'visible-facts-only',recallHash:recallContentHash(provisional)}}];
      const replacement=fact.replace?baseline.find(c=>c.id===fact.replace!.cardId):undefined;
      if(fact.replace&&(!replacement||cardContentHash(replacement)!==fact.replace.contentHash))throw Error('The explicitly inspected replacement changed; current content was preserved');
      const duplicate=replacement??reusableStudyCard(baseline,provisional,group?.id??'',evidence,undefined,studied);
      if(duplicate&&(duplicate.userEdited||studied.has(duplicate.id)||duplicate.status==='suspended')){
        if(duplicate.status==='ready'&&duplicate.question===fact.question&&duplicate.answer===fact.answer&&duplicate.objective===fact.claim&&duplicate.evidence.some(e=>e.documentId===documentId&&e.page===fact.page))retained.add(duplicate.id);
        else throw Error('A protected card requires a separate source decision; its content was preserved');
        continue;
      }
      if(!group){const notion=insertNotion({label:fact.topic,domain:title,status:'draft',definition:fact.claim,explanation:'',grounding:'grounded',sources:[{documentId,page:fact.page}]});group=notion;groups.push(group);setNotionMetadata(group.id,'course',evidence,'source-inspection-v1',[]);}
      for(const e of evidence)attachSource(group.id,documentId,e.page);
      const card={...provisional,id:duplicate?.id??provisional.id,notionId:group.id,evidence};
      pending.push({...card,accuracyReview:createCardReview(card,new Map(source.pages.map(p=>[`${documentId}:${p.page}`,p.text])),new Map([[documentId,source.revision]]))});retained.add(card.id);
    }
    const saved=saveStudyCards(pending);
    if(saved.some(c=>c.status!=='ready'))throw Error('Inspected cards did not pass the current local source gates');
    // Reversibly defer old unstudied automatic variants on the inspected pages.
    let archived=0;
    for(const card of baseline){
      if(record.coverage==='partial')continue;
      if(retained.has(card.id)||card.userEdited||studied.has(card.id)||card.status==='suspended'||!card.promptVersion.startsWith('direct-cards-')||!card.evidence.length||!card.evidence.every(e=>e.documentId===documentId&&pages.includes(e.page)))continue;
      db.prepare('UPDATE study_cards SET payload=? WHERE id=?').run(JSON.stringify({...card,status:'suspended',warnings:[...new Set([...card.warnings,INSPECTED_SELECTION_WARNING])]}),card.id);archived++;
    }
    const current=getDocumentStudyCards(documentId);
    for(const group of groups){
      const cards=current.filter(c=>c.notionId===group.id);
      if(cards.some(c=>c.userEdited)||!db.prepare("SELECT 1 FROM notions n JOIN notion_metadata m ON m.notion_id=n.id WHERE n.id=? AND n.status<>'validated' AND m.user_edited=0 AND (m.generation_version='source-inspection-v1' OR m.generation_version LIKE 'direct-cards-%')").get(group.id))continue;
      const claims=[...new Set(cards.filter(c=>c.status==='ready'&&c.reviewedConceptDefinition).sort((a,b)=>Number(b.kind==='definition')-Number(a.kind==='definition')||Math.min(...a.evidence.map(e=>e.page))-Math.min(...b.evidence.map(e=>e.page))).map(c=>c.reviewedConceptDefinition!))];
      if(claims.length)db.prepare('UPDATE notions SET definition=? WHERE id=?').run(claims.join(' '),group.id);
    }
    for(const page of pages){
      const excluded=record.excludedPages?.find(p=>p.page===page);
      if(excluded){savePageAnalysis(documentId,{page,kind:'administrative',status:'skipped',generationComplete:true,reason:excluded.reason,warnings:[],concepts:0,cards:0,readyCards:0,draftCards:0,version:'source-inspection-v1',sourceRevision:source.revision,updatedAt:record.reviewedAt});markPassagesGenerated(db.prepare('SELECT id FROM passages WHERE document_id=? AND page=?').all(documentId,page).map(r=>String(r.id)));continue;}
      const facts=record.facts.filter(f=>f.page===page),cards=current.filter(c=>retained.has(c.id)&&c.status==='ready'&&c.evidence.some(e=>e.page===page));
      if(facts.some(f=>!cards.some(c=>c.objective===f.claim)))throw Error('An inspected essential fact was not published; page coverage was preserved');
      if(record.coverage==='partial'){
        const previous=pageAnalyses(documentId).find(p=>p.page===page);
        const replaced=new Set(facts.map(f=>baseline.find(c=>c.id===f.replace?.cardId)?.objective));
        const coverage=[...(previous?.knowledgeCoverage??[]).filter(k=>!replaced.has(k.claim)),...facts.map((f,i)=>({key:`inspected-${page}-${i}`,claim:f.claim,status:'covered',reason:`Original source inspected by ${record.reviewer}`,sourceIds:f.evidenceKind==='text'?[`p${page}s0`]:[`p${page}image`],cardKeys:cards.filter(c=>c.objective===f.claim).map(c=>c.id)}))];
        savePageAnalysis(documentId,{...previous,page,kind:'content',status:previous?.status??'retry',generationComplete:previous?.generationComplete??false,reason:'Selected cards inspected against the original source; remaining page coverage preserved.',warnings:previous?.warnings??[],concepts:previous?.concepts??new Set(cards.map(c=>c.notionId)).size,cards:previous?.cards??cards.length,knowledgeCoverage:coverage,version:previous?.version??'partial-source-inspection-v1',sourceRevision:source.revision,updatedAt:record.reviewedAt});
        continue;
      }
      savePageAnalysis(documentId,{page,kind:'content',status:'complete',generationComplete:true,reason:'Essential figure knowledge inspected against the original PDF; secondary numeric details deferred.',warnings:[],concepts:new Set(cards.map(c=>c.notionId)).size,cards:cards.length,readyCards:cards.length,draftCards:0,knowledgeCoverage:facts.map((f,i)=>({key:`inspected-${page}-${i}`,claim:f.claim,status:'covered',reason:`Original image inspected by ${record.reviewer}`,sourceIds:[`p${page}image`],cardKeys:cards.filter(c=>c.objective===f.claim).map(c=>c.id)})),version:'source-inspection-v1',sourceRevision:source.revision,updatedAt:record.reviewedAt});
      markPassagesGenerated(db.prepare('SELECT id FROM passages WHERE document_id=? AND page=?').all(documentId,page).map(r=>String(r.id)));
    }
    assertGenerationSource(source,undefined,true);
    db.exec('COMMIT');return {recovery,readyCards:retained.size,archived,pages,providerCalls:0};
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export interface InspectedQuestionCoverage {
  pdfSha256:string;reviewer:string;reviewedAt:string;
  questions:Array<{key:string;cardId:string;contentHash:string;reason:string}>;
}

// The identified inspector explicitly attests each original question's answer.
// This verifies unchanged source/content and completeness, not semantic truth
// by matching a hash or counting cards. It never changes the saved answers.
export function confirmInspectedQuestionCoverage(documentId:string,page:number,record:InspectedQuestionCoverage){
  const {source}=readGenerationDocument(documentId),db=openDb(),primary=source.pages.find(p=>p.page===page);
  if(!primary||record.pdfSha256!==source.pdfSha256||!record.reviewer.trim()||!Number.isFinite(Date.parse(record.reviewedAt)))throw Error('An identified inspection of the unchanged original PDF is required');
  const required=knowledgeCheckQuestions(primary),keys=new Set(record.questions.map(q=>q.key));
  if(!required.length||keys.size!==record.questions.length||required.length!==keys.size||required.some(q=>!keys.has(q.key)))throw Error('Every original question needs its own explicit source inspection');
  if(db.prepare("SELECT 1 FROM generation_jobs WHERE document_id=? AND status='running'").get(documentId))throw Error('Cannot confirm while generation is running');
  const cards=getDocumentStudyCards(documentId),coverage=required.map(question=>{
    const decision=record.questions.find(q=>q.key===question.key)!,card=cards.find(c=>c.id===decision.cardId);
    if(!card||card.status!=='ready'||cardContentHash(card)!==decision.contentHash||decision.reason.trim().length<20||!card.evidence.some(e=>e.documentId===documentId&&e.page===page))throw Error('Inspected answer changed or lacks current ready source evidence');
    return {key:question.key,claim:question.question,status:'covered',reason:`Explicit source inspection by ${record.reviewer}: ${decision.reason}`,sourceIds:[`p${page}s0`],cardKeys:[card.id]};
  });
  const recovery=createRecoveryPoint('before-inspected-question-coverage');
  db.exec('BEGIN IMMEDIATE');
  try{
    assertGenerationSource(source,undefined,true);
    const selected=cards.filter(c=>coverage.some(k=>k.cardKeys.includes(c.id)));
    savePageAnalysis(documentId,{page,kind:'quiz',status:'complete',generationComplete:true,reason:'Every original knowledge-check question explicitly inspected against its saved answer and original source context.',warnings:[],concepts:new Set(selected.map(c=>c.notionId)).size,cards:selected.length,readyCards:selected.length,draftCards:0,knowledgeCoverage:coverage,version:'question-source-inspection-v1',sourceRevision:source.revision,updatedAt:record.reviewedAt});
    markPassagesGenerated(db.prepare('SELECT id FROM passages WHERE document_id=? AND page=?').all(documentId,page).map(r=>String(r.id)));
    assertGenerationSource(source,undefined,true);db.exec('COMMIT');return {page,questions:coverage.length,providerCalls:0,recovery};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
