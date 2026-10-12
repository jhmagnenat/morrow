import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {curriculum,excluded,groups,connections,visualFacts,VERSION,PDF_SHA256} from './insurance-curriculum-v17.mjs';
import {DOCUMENT} from './repair-understand-content.mjs';
import {isolatedModules} from './isolated-modules.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const tables=['notions','notion_metadata','notion_sources','links','link_metadata','study_cards','passages','documents'];
const historyTables=['review_state','review_log','mastery_signals','review_requests','interview_sessions','explain_attempts'];
const rows=(db,table)=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const fingerprint=(db,names)=>hash(names.map(t=>[t,rows(db,t)]));
const notionSql='INSERT INTO notions(id,label,domain,status,definition,explanation,grounding,work_questions,course_context,mapping_visible) VALUES(?,?,?,?,?,?,?,?,?,?)';
const writeCard=(db,card)=>db.prepare('INSERT INTO study_cards(id,card_type,notion_id,link_id,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET notion_id=excluded.notion_id,link_id=excluded.link_id,payload=excluded.payload').run(card.id,card.cardType,card.notionId??null,card.linkId??null,JSON.stringify(card));

export async function applyCurriculum(options={}){
  const databasePath=resolve(options.databasePath??'data/encyclopedia.db');
  const pdfPath=resolve(options.pdfPath??`data/uploads/default/${DOCUMENT}.pdf`);
  const backupDirectory=resolve(options.backupDirectory??'data/backups');
  const dryRun=options.dryRun??true;
  const pdfSha256=createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
  // The explicit test override is not a CLI option. Production is pinned to
  // the original PDF inspected page by page, never a label-only match.
  if(pdfSha256!==(options.expectedPdfSha256??PDF_SHA256))throw Error('The reviewed PDF was replaced; this curriculum cannot be applied.');
  const previousDataDirectory=process.env.MORROW_DATA_DIR;
  let env;
  try{env=await isolatedModules(['intuitivePedagogy']);}
  finally{if(previousDataDirectory===undefined)delete process.env.MORROW_DATA_DIR;else process.env.MORROW_DATA_DIR=previousDataDirectory;}
  const {cardQuality,clairQualityIssues,teachingQualityIssues}=await env.load('contentQuality');
  const {reliabilityReport}=await env.load('reliabilityReport');
  const db=new DatabaseSync(databasePath);
  try{
    const baseline=fingerprint(db,tables),historyBefore=fingerprint(db,historyTables);
    const old=rows(db,'notions'),metadata=new Map(rows(db,'notion_metadata').map(m=>[m.notion_id,m]));
    const sourceTexts=new Map();for(const p of db.prepare('SELECT page,text FROM passages WHERE document_id=? ORDER BY page,ordinal').all(DOCUMENT))sourceTexts.set(p.page,[sourceTexts.get(p.page),p.text].filter(Boolean).join('\n'));
    const source=(page)=>{
      const text=sourceTexts.get(page);if(!text)throw Error(`Missing original page ${page}`);
      if(visualFacts[page])return {documentId:DOCUMENT,page,quote:'',visualDescription:visualFacts[page],visualReview:{reviewer:'Codex page-by-page original-PDF inspection',reviewedAt:'2026-10-09T21:10:53.000Z',pdfSha256,page,description:visualFacts[page],scope:'visible-facts-only'}};
      if(text.length<12)throw Error(`Page ${page} lacks verified text or inspected visual evidence`);
      return {documentId:DOCUMENT,page,quote:text};
    };
    const relevant=new Set(db.prepare('SELECT notion_id FROM notion_sources WHERE document_id=?').all(DOCUMENT).map(s=>s.notion_id));
    const missing=old.filter(n=>relevant.has(n.id)&&metadata.get(n.id)?.layer!=='organizer'&&!curriculum.some(c=>c.label===n.label)&&!(n.label in excluded));
    if(missing.length)throw Error(`Additional concepts require review: ${missing.map(n=>n.label).join(', ')}`);
    const protectedIds=new Set(old.filter(n=>n.status==='validated'||metadata.get(n.id)?.user_edited).map(n=>n.id));
    const resolved=new Map(curriculum.map(c=>[c.label,old.find(n=>n.label===c.label)?.id??randomUUID()]));
    const prepared=curriculum.map(c=>{
      const sources=c.pages.map(source),id=resolved.get(c.label);
      const articulations=connections.filter(([a,b])=>a===c.label||b===c.label).map(([a,b,pages,explanation])=>({notionId:resolved.get(a===c.label?b:a),label:a===c.label?b:a,type:'related',direction:a===c.label?'outgoing':'incoming',explanation,evidence:pages.map(source)}));
      if(articulations.some(a=>!a.notionId))throw Error('A curriculum connection has a missing endpoint.');
      const first=c.tasks[0];
      const clair={version:1,conceptLabel:c.label,depth:'deep',importance:c.group==='foundations'?'foundation':'core',context:c.context,logic:{answer:c.definition,steps:c.steps,analogy:{model:'',mapping:'',limit:''},formalism:c.formalism},articulations,implications:{origin:'generated',setup:first.setup,assumptions:first.assumptions,question:first.question,answer:first.answer,why:first.reasoning,limits:c.formalism},reconstruction:{question:`Without notes, explain ${c.label}: state the decisive distinction, derive the steps, and identify a conclusion that these sources do not establish.`,expectedAnswer:[c.definition,...c.steps,c.formalism].join('\n')},sources,practice:c.tasks.slice(1)};
      const explanation=[c.context,c.definition,...c.steps,c.formalism,...c.tasks.map(t=>[t.setup,`Assume: ${t.assumptions}`,t.question,t.answer,t.reasoning].join('\n'))].join('\n\n');
      const candidates=[{...c.ruleCard,kind:'mechanism'},...c.tasks.map(t=>({question:[t.setup,`Assume: ${t.assumptions}`,t.question].join('\n'),answer:`${t.answer}\n${t.reasoning}`,kind:'application'}))];
      const issues=[...clairQualityIssues(c.label,clair),...teachingQualityIssues(c.label,explanation),...candidates.flatMap(card=>cardQuality(card.question,card.answer,card.kind))];
      if(!c.tasks.length||!c.steps.length||!groups[c.group]||issues.length)throw Error(`${c.label}: ${issues.join('; ')||'Incomplete learning structure'}`);
      return {c,id,sources,clair,explanation,candidates};
    });
    const preview={version:VERSION,concepts:prepared.length,newConcepts:prepared.filter(p=>!old.some(n=>n.id===p.id)).map(p=>p.c.label),cards:prepared.reduce((n,p)=>n+p.candidates.length,0),archivedLabels:Object.keys(excluded),groups:Object.values(groups).map(g=>g.label),connections:connections.length,protectedNotions:protectedIds.size,pdfSha256,baseline};
    if(dryRun)return preview;
    mkdirSync(backupDirectory,{recursive:true});const backup=resolve(backupDirectory,`before-curriculum-v17-${Date.now()}.db`);db.prepare('VACUUM INTO ?').run(backup);
    let corrected=0,created=0,rewrittenCards=0,createdCards=0,suspendedCards=0;const touched=new Set();
    db.exec('BEGIN IMMEDIATE');
    try{
      if(fingerprint(db,tables)!==baseline||fingerprint(db,historyTables)!==historyBefore||createHash('sha256').update(readFileSync(pdfPath)).digest('hex')!==pdfSha256)throw Error('The course, history or PDF changed during review; nothing was applied.');
      for(const {c,id,sources,clair,explanation,candidates} of prepared){
        if(protectedIds.has(id))continue;
        const existing=old.find(n=>n.id===id);
        const grounding=/foundational|background|teaching convention/i.test(c.formalism)?'inferred':'grounded';
        if(existing){db.prepare('UPDATE notions SET definition=?,explanation=?,course_context=?,grounding=?,mapping_visible=1 WHERE id=?').run(c.definition,explanation,c.context,grounding,id);corrected++;}
        else{db.prepare(notionSql).run(id,c.label,groups[c.group].label,'draft',c.definition,explanation,grounding,'[]',c.context,1);created++;}
        db.prepare('INSERT INTO notion_metadata(notion_id,layer,evidence,user_edited,generation_version,source_notes,clair) VALUES(?,?,?,?,?,?,?) ON CONFLICT(notion_id) DO UPDATE SET layer=excluded.layer,evidence=excluded.evidence,generation_version=excluded.generation_version,source_notes=excluded.source_notes,clair=excluded.clair').run(id,'course',JSON.stringify(sources),0,VERSION,JSON.stringify(sources.map(s=>({documentId:DOCUMENT,page:s.page,explanation,courseContext:c.context,version:VERSION}))),JSON.stringify(clair));
        db.prepare('DELETE FROM notion_sources WHERE notion_id=?').run(id);for(const page of new Set(c.pages))db.prepare('INSERT INTO notion_sources(notion_id,document_id,page) VALUES(?,?,?)').run(id,DOCUMENT,page);
        const available=db.prepare("SELECT * FROM study_cards WHERE notion_id=? AND card_type='notion' ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,id").all(id,id).map(row=>JSON.parse(row.payload));
        const used=new Set();
        for(const candidate of candidates){
          let previous=available.find(card=>!used.has(card.id)&&!card.userEdited&&card.status!=='suspended'&&card.question===candidate.question);
          previous??=available.find(card=>!used.has(card.id)&&!card.userEdited&&card.status!=='suspended');
          const cardId=previous?.id??randomUUID();used.add(cardId);touched.add(cardId);
          const revisions=previous&&previous.question!==candidate.question?[...(previous.revisions??[]),{question:previous.question,answer:previous.answer,example:previous.example??'',objective:previous.objective??'',at:new Date().toISOString()}]:(previous?.revisions??[]);
          writeCard(db,{...previous,id:cardId,cardType:'notion',notionId:id,...candidate,example:'',objective:`${c.label}: ${candidate.question}`,status:'ready',warnings:[],userEdited:false,evidence:sources,model:'original-PDF reviewed curriculum',promptVersion:VERSION,...(revisions.length?{revisions}:{})});
          if(previous)rewrittenCards++;else createdCards++;
        }
      }
      const archivedIds=old.filter(n=>n.label in excluded&&!protectedIds.has(n.id)).map(n=>n.id);
      for(const id of archivedIds)db.prepare('UPDATE notions SET mapping_visible=0 WHERE id=?').run(id);
      // Preserve all IDs, payloads and histories. Automatic obsolete cards leave
      // active queues; user-written cards and protected concepts remain intact.
      const teachingIds=new Set([...resolved.values(),...archivedIds]);
      const oldLinks=rows(db,'links');
      for(const row of rows(db,'study_cards')){const card=JSON.parse(row.payload);const edge=oldLinks.find(l=>l.id===card.linkId);if(touched.has(card.id)||card.userEdited||card.status==='suspended'||protectedIds.has(card.notionId)||edge&&(protectedIds.has(edge.source_id)||protectedIds.has(edge.target_id)))continue;if(teachingIds.has(card.notionId)||edge&&(teachingIds.has(edge.source_id)||teachingIds.has(edge.target_id))){writeCard(db,{...card,status:'suspended',warnings:[...new Set([...(card.warnings??[]),'Retained in archive; replaced by the reviewed curriculum and its source-specific questions.'])]});suspendedCards++;}}
      const groupIds=new Map();
      for(const [key,g] of Object.entries(groups)){
        const previous=old.find(n=>n.label===g.original||n.label===g.label),id=previous?.id??randomUUID();groupIds.set(key,id);
        if(protectedIds.has(id))continue;
        if(previous)db.prepare('UPDATE notions SET label=?,definition=?,explanation=?,course_context=?,mapping_visible=1 WHERE id=?').run(g.label,g.summary,g.summary,'Navigation for the reviewed course; membership is not a causal dependency.',id);
        else db.prepare(notionSql).run(id,g.label,'Course overview','draft',g.summary,g.summary,'inferred','[]','Navigation only.',1);
        db.prepare('INSERT INTO notion_metadata(notion_id,layer,evidence,user_edited,generation_version,source_notes,clair) VALUES(?,?,?,?,?,?,?) ON CONFLICT(notion_id) DO UPDATE SET layer=excluded.layer,generation_version=excluded.generation_version,clair=NULL').run(id,'organizer','[]',0,VERSION,'[]',null);
      }
      const managedIds=new Set([...teachingIds,...groupIds.values()]);
      // Keep old edges for archived cards and recoverable history. A manifest
      // excludes obsolete edges from the learning graph without dangling IDs.
      const activeLinks=new Set();
      const saveEdge=(a,b,type,description,evidence=[])=>{if(protectedIds.has(a)||protectedIds.has(b))return;const previous=oldLinks.find(l=>l.source_id===a&&l.target_id===b&&l.type===type),id=previous?.id??randomUUID();activeLinks.add(id);db.prepare('INSERT INTO links(id,source_id,target_id,type,description) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,description=excluded.description').run(id,a,b,type,description);db.prepare('INSERT INTO link_metadata(link_id,evidence) VALUES(?,?) ON CONFLICT(link_id) DO UPDATE SET evidence=excluded.evidence').run(id,JSON.stringify(evidence));};
      for(const p of prepared)saveEdge(groupIds.get(p.c.group),p.id,'chapter',`Navigation: ${groups[p.c.group].summary}`);
      for(const [a,b,pages,description] of connections)saveEdge(resolved.get(a),resolved.get(b),'related',description,pages.map(source));
      const introductions={products:['Customer need and product','Insurance Product Types','Life Insurance','Term life insurance','Property and Casualty Products','Motor liability insurance','Health and Accident Insurance','Reinsurance','Captive Insurance','Breakdown of Monthly Spending on Insurance in Switzerland'],markets:['Premium market share'],functions:['Balance Sheet Functions - Assets','Balance Sheet Functions - Liabilities','Balance Sheet Functions - Capital and Result']};
      const order=Object.keys(groups).flatMap(key=>{
        const members=prepared.filter(p=>p.c.group===key),first=introductions[key]??[];
        return [...first.map(label=>members.find(p=>p.c.label===label)).filter(Boolean),...members.filter(p=>!first.includes(p.c.label))].map(p=>p.id);
      });
      const archivedLinkIds=oldLinks.filter(l=>managedIds.has(l.source_id)&&managedIds.has(l.target_id)&&!protectedIds.has(l.source_id)&&!protectedIds.has(l.target_id)&&!activeLinks.has(l.id)).map(l=>l.id);
      const manifest={version:VERSION,documentId:DOCUMENT,pdfSha256,reviewedAt:new Date().toISOString(),activeNotionIds:[...resolved.values()],archivedIds,archivedLinkIds,learningOrder:order,criteria:{originalPagesReviewed:38,sourceBound:true,explicitHypotheses:true,workedVariants:true,sourceVersusBackground:true},limitations:['Source and calculation review is not an independent human learning-effectiveness study.','Model-generated future changes require their own audit.']};
      db.prepare('INSERT INTO quality_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('course-learning-curriculum',JSON.stringify(manifest));
      const taught=new Set(prepared.flatMap(p=>p.c.pages));
      for(let page=1;page<=38;page++){
        const content=taught.has(page),members=prepared.filter(p=>p.c.pages.includes(page));
        const analysis={page,kind:content?'content':page===38?'bibliography':page===24?'empty':'administrative',status:content?'complete':'skipped',reason:content?'Source topic is covered by the original-PDF reviewed curriculum.':page===24?'Advertising image does not teach an insurance decision rule.':'Course orientation, logistics, reflection, assessment or reading list; not subject learning.',warnings:[],concepts:members.length,cards:members.length*3,readyCards:members.length*3,draftCards:0,missingObjectives:[],updatedAt:new Date().toISOString(),version:VERSION};
        db.prepare('INSERT INTO page_analysis(document_id,page,payload) VALUES(?,?,?) ON CONFLICT(document_id,page) DO UPDATE SET payload=excluded.payload').run(DOCUMENT,page,JSON.stringify(analysis));
      }
      db.prepare('UPDATE passages SET generated=1 WHERE document_id=?').run(DOCUMENT);
      const currentCards=rows(db,'study_cards').map(r=>JSON.parse(r.payload)).filter(c=>touched.has(c.id));
      const currentNotions=prepared.filter(p=>!protectedIds.has(p.id)).map(p=>({id:p.id,label:p.c.label,definition:p.c.definition,explanation:p.explanation,clair:p.clair}));
      const report=reliabilityReport({cards:currentCards,notions:currentNotions,documents:[{id:DOCUMENT,title:'Reviewed insurance course',pageCount:38,pdfSha256}],passages:[...sourceTexts].map(([page,text])=>({documentId:DOCUMENT,page,text}))});
      if(report.summary.readyCardsWithIssues||report.summary.lessonsWithDetectedIssues)throw Error('Post-save source or content validation failed.');
      if(fingerprint(db,historyTables)!==historyBefore)throw Error('Learning history changed unexpectedly.');
      db.exec('COMMIT');return {...preview,backup,corrected,created,rewrittenCards,createdCards,suspendedCards,historyPreserved:true,report:report.summary};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  const result=await applyCurriculum({dryRun:!process.argv.includes('--apply')});
  mkdirSync('.next',{recursive:true});writeFileSync('.next/insurance-curriculum-review.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
