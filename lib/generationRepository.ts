import {createHash,randomUUID} from 'node:crypto';
import {openDb,insertNotion,markPassagesGenerated} from '@/lib/db';
import {getDocumentStudyCards,attachSource,setNotionMetadata,saveStudyCards,savePageAnalysis,ownsClaim} from '@/lib/qualityDb';
import {ensureSourceDocument,originalPdfHash,type SourceDocument} from '@/lib/sourceDocument';
import {readPdfFile} from '@/lib/pdfStorage';
import {createCardReview,cardContentHash} from '@/lib/contentReview';
import {canonicalLabel,reusableStudyCard,supersededAutomaticCard,SUPERSEDED_SELECTION_WARNING,type StudyCard} from '@/lib/contentQuality';
import {DIRECT_CARD_VERSION} from '@/lib/directCardContracts';
import type {GenerationOutput} from '@/lib/generationOutput';
import type {GenerationOptions} from '@/lib/generationTypes';
import type {Notion} from '@/lib/types';
import {saveTeachingLesson} from '@/lib/teachingStorage';

export const generationDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function findGenerationDocument(documentId:string){const row=openDb().prepare('SELECT id,title,page_count FROM documents WHERE id=?').get(documentId);return row?{id:String(row.id),title:String(row.title),pageCount:Number(row.page_count)||0}:undefined;}
export function readGenerationDocument(documentId:string){
  const db=openDb(),document=db.prepare('SELECT id,title,page_count FROM documents WHERE id=?').get(documentId);
  if(!document)throw Error('Document not found in this course');
  const pdf=readPdfFile(documentId),source=ensureSourceDocument(db,documentId,pdf);
  return {documentId,title:String(document.title),pdf,source};
}
export function pendingGenerationPages(documentId:string):number[]{return openDb().prepare('SELECT DISTINCT page FROM passages WHERE document_id=? AND generated=0 ORDER BY page').all(documentId).map(p=>Number(p.page));}
export function assertGenerationSource(source:SourceDocument,claimId?:string,checkFile=false){
  if(claimId&&!ownsClaim(source.documentId,claimId))throw Error('Generation canceled');
  if(openDb().prepare('SELECT revision FROM source_documents WHERE document_id=?').get(source.documentId)?.revision!==source.revision||(checkFile&&originalPdfHash(readPdfFile(source.documentId))!==source.pdfSha256))throw Error('Generation canceled: source document changed');
}

// Persistence is an adapter. Notions are projections of accepted cards;
// neither an existing map nor a generated lesson is an input requirement.
export function publishGeneration(source:SourceDocument,title:string,pages:number[],output:GenerationOutput,baseline:StudyCard[],options:GenerationOptions,model:string){
  const db=openDb(),notions:Notion[]=[],warnings:string[]=(output.diagnostics??[]).filter(d=>/repair failed|Target has|not on a primary/i.test(d)),published=new Map<string,StudyCard>();
  let cardsCreated=0,processed=0;const completedScope=new Set<number>();
  db.exec('BEGIN IMMEDIATE');
  try{
    assertGenerationSource(source,options.claimId,true);
    if(output.lesson)saveTeachingLesson(output.lesson);
    // Parallel batches may legitimately add cards citing each other's pages.
    // Reconcile against the live deck instead of canceling on collection changes.
    const baselineById=new Map(baseline.map(card=>[card.id,card]));
    const cards=getDocumentStudyCards(source.documentId),reviewedIds=new Set(db.prepare("SELECT card_id FROM review_state WHERE card_type IN ('notion','link')").all().map(r=>String(r.card_id)));
    const groups=db.prepare('SELECT DISTINCT n.id,n.label,n.definition FROM notions n JOIN notion_sources s ON s.notion_id=n.id LEFT JOIN notion_metadata m ON m.notion_id=n.id WHERE s.document_id=? AND COALESCE(m.layer,\'course\')<>\'organizer\'').all(source.documentId).map(n=>({id:String(n.id),label:String(n.label),definition:String(n.definition)}));
    const definitions=new Map<string,string[]>();
    for(const {candidate,issues,contractValid} of output.cards)if(contractValid&&!issues.length){
      const label=canonicalLabel(candidate.topic),claims=definitions.get(label)??[];
      if(candidate.topicDefinition&&!claims.includes(candidate.topicDefinition))claims.push(candidate.topicDefinition);
      definitions.set(label,claims);
    }
    const pending:StudyCard[]=[],text=new Map(source.pages.map(p=>[`${source.documentId}:${p.page}`,p.text])),revisions=new Map([[source.documentId,source.revision]]);
    for(const item of output.cards){
      const {candidate,evidence,issues}=item;warnings.push(...issues);
      if(!item.contractValid)continue;
      let group=groups.find(n=>canonicalLabel(n.label)===canonicalLabel(candidate.topic));
      const decision=output.review.decisions.find(d=>d.key===candidate.key);
      // One older overview cannot be reused for several distinct targets in
      // the same publication. Rewriting it for the first target changes its
      // baseline and must not prevent publishing the other source facts.
      const assigned=new Set([...published.values()].map(c=>c.id));
      const duplicateId=decision?.duplicateOf&&!assigned.has(decision.duplicateOf)?decision.duplicateOf:undefined;
      const duplicate=reusableStudyCard(cards.filter(c=>!assigned.has(c.id)),candidate,group?.id??'',evidence,issues.length?undefined:duplicateId,reviewedIds);
      const baselineDuplicate=reusableStudyCard(baseline,candidate,group?.id??'',evidence,undefined,reviewedIds);
      if(!duplicate&&baselineDuplicate&&!cards.some(c=>c.id===baselineDuplicate.id)){
        warnings.push('An existing card was deleted during generation and was not recreated');
        continue;
      }
      const before=duplicate?baselineById.get(duplicate.id):undefined;
      if(duplicate&&before&&cardContentHash(before)!==cardContentHash(duplicate)){
        warnings.push('An existing card changed during review and was preserved; this objective needs another review');
        continue;
      }
      if(duplicate&&!before){
        if(!issues.length&&duplicate.status==='ready'&&duplicate.question===candidate.question&&duplicate.answer===candidate.answer&&(duplicate.explanation??'')===(candidate.explanation??'')&&!duplicate.example&&duplicate.kind===candidate.kind)published.set(candidate.key,duplicate);
        else warnings.push('A concurrent batch already published this objective; its card was preserved for review');
        continue;
      }
      if(!duplicate&&duplicateId&&baselineById.has(duplicateId)&&!cards.some(c=>c.id===duplicateId)){
        warnings.push('An existing duplicate was deleted during review; this objective was not recreated');
        continue;
      }
      if(duplicate&&(duplicate.userEdited||duplicate.promptVersion==='source-inspection-v1'||reviewedIds.has(duplicate.id)||duplicate.status==='suspended'&&(!supersededAutomaticCard(duplicate)||reviewedIds.has(duplicate.id)))){
        if(duplicate.status==='ready'&&duplicate.question===candidate.question&&duplicate.answer===candidate.answer&&(duplicate.explanation??'')===(candidate.explanation??'')&&!duplicate.example&&!issues.length)published.set(candidate.key,duplicate);
        else warnings.push('Protected existing card was preserved; candidate was not published');
        continue;
      }
      if(duplicate&&issues.length)continue;
      if(!group&&!issues.length){
        const notion=insertNotion({label:candidate.topic,domain:title,status:'draft',definition:(definitions.get(canonicalLabel(candidate.topic))??[candidate.topicDefinition!]).join(' '),explanation:'',grounding:'grounded',sources:evidence.map(e=>({documentId:e.documentId,page:e.page}))});
        setNotionMetadata(notion.id,'course',evidence,DIRECT_CARD_VERSION,[]);notions.push(notion);groups.push(notion);group=notion;
      }
      if(group&&!issues.length)for(const e of evidence)attachSource(group.id,e.documentId,e.page);
      const unchangedRecall=duplicate?.status==='ready'&&duplicate.question===candidate.question&&duplicate.answer===candidate.answer&&duplicate.kind===candidate.kind&&!duplicate.example&&(duplicate.explanation??'')===(candidate.explanation??'')&&duplicate.evidence.every(e=>e.documentId===source.documentId);
      const allEvidence=unchangedRecall?[...new Map([...duplicate!.evidence,...evidence].map(e=>[`${e.documentId}:${e.page}:${e.quote}:${e.visualDescription??''}`,e])).values()]:evidence;
      let card:StudyCard={id:duplicate?.id??randomUUID(),notionId:group?.id,cardType:'notion',question:candidate.question,answer:candidate.answer,explanation:candidate.explanation??'',example:'',kind:candidate.kind,objective:candidate.objective,status:issues.length?'draft':'ready',evidence:allEvidence,warnings:issues,userEdited:false,model,promptVersion:DIRECT_CARD_VERSION,reviewedConceptDefinition:candidate.topicDefinition,...(item.teaching?{teaching:item.teaching}:{})};
      const target=output.draft.knowledge.find(k=>k.cardKeys.includes(candidate.key)&&!k.exclusionReason);
      if(target)card={...card,knowledgeTrace:{unitId:target.key,planKey:generationDigest({revision:source.revision,page:target.page,version:DIRECT_CARD_VERSION}),claim:target.claim,conditions:[]}};
      if(card.status==='ready')card={...card,accuracyReview:createCardReview(card,text,revisions)};
      pending.push(card);published.set(candidate.key,card);
      if(duplicate)cards.splice(cards.findIndex(c=>c.id===duplicate.id),1,card);else{cards.push(card);cardsCreated++;}
    }
    const saved=saveStudyCards(pending),byId=new Map(saved.map(c=>[c.id,c]));
    for(const [key,card] of published)published.set(key,byId.get(card.id)??card);
    for(const page of pages){
      const decisions=output.review.pages.filter(d=>d.page===page),decision=decisions.length===1?decisions[0]:undefined;
      const pageCards=[...new Map([...published.values()].filter(c=>c.evidence.some(e=>e.documentId===source.documentId&&e.page===page)).map(c=>[c.id,c])).values()];
      const proposed=output.cards.filter(c=>c.evidence.some(e=>e.page===page)&&!output.review.targets.some(t=>t.verdict==='non-teaching'&&output.draft.knowledge.find(k=>k.key===t.key)?.cardKeys.includes(c.candidate.key))),missing:string[]=[];
      if(!decision)missing.push('Missing or duplicate page coverage review');
      const targets=output.draft.knowledge.filter(k=>k.page===page);
      const targetStates=targets.map(target=>{
        const checked=output.review.targets.filter(t=>t.key===target.key),targetReview=checked.length===1?checked[0]:undefined;
        const excluded=targetReview?.verdict==='non-teaching';
        const deferred=target.selected===false&&targetReview?.selectionCorrect===true&&targetReview.verdict==='supported'&&targetReview.atomic&&!target.issues?.length;
        const validSources=targetReview?.selectionCorrect!==false&&target.sourceIds.length>0&&!target.issues?.length&&targetReview?.verdict==='supported'&&targetReview.atomic&&targetReview.coverageComplete;
        const covered=validSources&&target.cardKeys.some(key=>published.get(key)?.status==='ready'&&published.get(key)?.evidence.some(e=>e.page===page));
        if(!excluded&&!deferred&&!covered)missing.push(`Uncovered knowledge: ${target.claim}`);
        return {key:target.key,claim:target.claim,status:excluded?'excluded':deferred?'deferred':covered?'covered':'unresolved',reason:targetReview?.reason??target.issues?.join('; ')??'Missing target review',sourceIds:target.sourceIds,cardKeys:target.cardKeys};
      });
      for(const objective of decision?.objectives??[])if(!targetStates.some(t=>t.status==='deferred'&&t.claim===objective.description)&&(!objective.description.trim()||!objective.cardKeys.some(key=>published.get(key)?.status==='ready'&&published.get(key)?.evidence.some(e=>e.page===page))))missing.push(objective.description||'Invalid coverage objective');
      for(const item of proposed)if(published.get(item.candidate.key)?.status!=='ready')missing.push(`Unpublished objective: ${item.candidate.objective}`);
      if(output.cards.some(c=>!c.contractValid&&!c.evidence.some(e=>pages.includes(e.page))))missing.push('Unattributed invalid source references require review');
      const primaryText=source.pages.find(p=>p.page===page)?.text??'';
      const substantiveText=primaryText.split(/\s+/).filter(w=>/[\p{L}]/u.test(w)).length>=20;
      const skipped=Boolean(!substantiveText&&decision?.excluded&&!decision.objectives.length&&!proposed.length&&!targetStates.some(k=>k.status!=='excluded'));
      if(!skipped&&!decision?.objectives.length)missing.push('No essential knowledge coverage established for this page');
      if(decision?.excluded&&!skipped)missing.push('Contradictory non-teaching classification');
      const complete=Boolean(decision&&!missing.length);
      if(complete&&!skipped)completedScope.add(page);
      savePageAnalysis(source.documentId,{page,kind:skipped?'administrative':'content',status:complete?(skipped?'skipped':'complete'):'retry',generationComplete:Boolean(decision),reason:decision?.reason??'Coverage requires review',warnings:[...new Set(missing)],concepts:new Set(pageCards.map(c=>c.notionId).filter(Boolean)).size,cards:pageCards.length,readyCards:pageCards.filter(c=>c.status==='ready').length,draftCards:pageCards.filter(c=>c.status==='draft').length,knowledgeCoverage:targetStates,missingObjectives:[...new Set(missing)],version:DIRECT_CARD_VERSION,sourceRevision:source.revision,updatedAt:new Date().toISOString()});
      if(decision){
        const ids=db.prepare('SELECT id FROM passages WHERE document_id=? AND page=? AND generated=0').all(source.documentId,page).map(p=>String(p.id));markPassagesGenerated(ids);processed+=ids.length;
      }
      warnings.push(...missing);
    }
    // A successful fresh selection supersedes unchecked automatic variants.
    // Archive reversibly; never remove IDs, edits, scheduling or studied cards.
    const retained=new Set([...published.values()].map(c=>c.id));
    for(const card of cards){
      const before=baselineById.get(card.id);
      if(!before||retained.has(card.id)||card.userEdited||reviewedIds.has(card.id)||card.status==='suspended'||!card.promptVersion.startsWith('direct-cards-')||!card.evidence.length||!card.evidence.every(e=>e.documentId===source.documentId&&completedScope.has(e.page))||cardContentHash(before)!==cardContentHash(card))continue;
      db.prepare('UPDATE study_cards SET payload=? WHERE id=?').run(JSON.stringify({...card,status:'suspended',warnings:[...new Set([...card.warnings,SUPERSEDED_SELECTION_WARNING])]}),card.id);
    }
    // Rebuild automatic notions from independently reviewed claims across pages.
    // The claim is part of each card's immutable accuracy hash.
    const safeCards=getDocumentStudyCards(source.documentId);
    for(const group of groups){
      if(!db.prepare("SELECT 1 FROM notions n JOIN notion_metadata m ON m.notion_id=n.id WHERE n.id=? AND n.status<>'validated' AND m.user_edited=0 AND m.generation_version LIKE 'direct-cards-%'").get(group.id))continue;
      const linked=safeCards.filter(c=>c.notionId===group.id);
      if(linked.some(c=>c.userEdited)||db.prepare('SELECT 1 FROM notion_sources WHERE notion_id=? AND document_id<>?').get(group.id,source.documentId))continue;
      const claims=[...new Set(linked.filter(c=>c.status==='ready'&&c.reviewedConceptDefinition).sort((a,b)=>Number(b.kind==='definition')-Number(a.kind==='definition')||Math.min(...a.evidence.map(e=>e.page))-Math.min(...b.evidence.map(e=>e.page))).map(c=>c.reviewedConceptDefinition!.trim()))];
      if(claims.length){const definition=claims.join(' ');db.prepare('UPDATE notions SET definition=?,explanation=?,mapping_visible=1 WHERE id=?').run(definition,'',group.id);group.definition=definition;}
    }
    const activeNotions=new Set([...published.values()].filter(c=>c.status==='ready').map(c=>c.notionId));
    for(const group of groups){
      if(activeNotions.has(group.id)||!db.prepare("SELECT 1 FROM notions n JOIN notion_metadata m ON m.notion_id=n.id WHERE n.id=? AND n.status<>'validated' AND m.user_edited=0 AND m.generation_version LIKE 'direct-cards-%'").get(group.id))continue;
      const groupCards=db.prepare('SELECT payload FROM study_cards WHERE notion_id=?').all(group.id).map(r=>JSON.parse(String(r.payload)) as StudyCard);
      if(groupCards.some(c=>c.status!=='suspended'||c.userEdited||reviewedIds.has(c.id)))continue;
      const groupSources=db.prepare('SELECT document_id,page FROM notion_sources WHERE notion_id=?').all(group.id);
      if(groupSources.length&&groupSources.every(s=>s.document_id===source.documentId&&completedScope.has(Number(s.page))))db.prepare('UPDATE notions SET mapping_visible=0 WHERE id=?').run(group.id);
    }
    db.exec('COMMIT');return {notions,cardsCreated,processed,readyCards:new Set([...published.values()].filter(c=>c.status==='ready').map(c=>c.id)).size,warnings:[...new Set(warnings)]};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
