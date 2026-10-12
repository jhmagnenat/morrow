import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "@/lib/db";
import type { ContentLayer, Evidence, StudyCard } from "@/lib/contentQuality";
import { cardQuality, clairMatchesConcept, clairQualityIssues, teachingQualityIssues, pedagogicalIssues, verifiesQuote,verifiedVisualEvidence } from "@/lib/contentQuality";
import type { NotionSourceNote } from "@/lib/types";
import { isCourseMethodNotion, isInsuranceCourse, isNonTeachingSlide } from "@/lib/coursePedagogy";
import { isClairLesson, type ClairLesson } from '@/lib/clair';
import {validFsrsMemory,validFsrsWeights,FSRS_WEIGHTS} from '@/lib/fsrs';
import { dataDirectory } from '@/lib/dataDirectory';
import {cardReviewIssues,lessonReviewIssues,validContentReview,recallContentHash} from '@/lib/contentReview';
import {readPdfFile} from '@/lib/pdfStorage';
import {originalPdfHash} from '@/lib/sourceDocument';
import {initializeSourceDocuments,loadSourceDocument} from '@/lib/sourceDocument';
import {administrativePageReason,hasSourceTeachingText,type SourcePage} from '@/lib/sourceSections';
import {getTeachingLessons,teachingTraceIssues,validTeachingTrace} from '@/lib/teachingStorage';
import {validTeachingLesson} from '@/lib/teachingIntegrity';

const TABLES = ["study_cards", "notion_metadata", "link_metadata", "page_analysis", "generation_runs", "quality_settings", "review_requests", "source_documents", "source_pages", "generation_jobs"] as const;
const initialized = new WeakSet<DatabaseSync>();
export function quarantineCourseMethodology(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM quality_settings WHERE key='course_methodology_v8_checked'").get()) return;
  const passages=db.prepare("SELECT document_id,page,text FROM passages ORDER BY document_id,page,ordinal").all();
  const insurance=isInsuranceCourse(passages.map(p=>String(p.text)).join("\n"));
  if (!insurance) return;
  const pageText=new Map<string,string>();
  for (const p of passages) {const key=`${p.document_id}:${p.page}`;pageText.set(key,`${pageText.get(key) ?? ""}\n${p.text}`);}
  const sources=db.prepare("SELECT notion_id,document_id,page FROM notion_sources").all();
  const ids=new Set<string>();
  for (const notion of db.prepare("SELECT n.id,n.label,n.status,m.user_edited FROM notions n LEFT JOIN notion_metadata m ON m.notion_id=n.id").all()) {
    if (notion.user_edited || notion.status==='validated') continue;
    const cited=sources.filter(s=>s.notion_id===notion.id);
    const onlyNonTeaching=cited.length>0 && cited.every(s=>isNonTeachingSlide(pageText.get(`${s.document_id}:${s.page}`) ?? ""));
    if (isCourseMethodNotion(String(notion.label),insurance) || onlyNonTeaching) ids.add(String(notion.id));
  }
  const linkIds=new Set(db.prepare("SELECT id,source_id,target_id FROM links").all().filter(l=>ids.has(String(l.source_id)) || ids.has(String(l.target_id))).map(l=>String(l.id)));
  for (const row of db.prepare("SELECT id,payload FROM study_cards").all()) {
    const card=JSON.parse(String(row.payload)) as StudyCard;
    if (card.userEdited || (!ids.has(card.notionId ?? "") && !linkIds.has(card.linkId ?? ""))) continue;
    const updated={...card,status:card.status==='suspended' ? 'suspended' : 'draft',warnings:[...new Set([...card.warnings,"Course methodology or explicitly non-taught material: archived from the mapping, retained for verification."])]};
    db.prepare("UPDATE study_cards SET payload=? WHERE id=?").run(JSON.stringify(updated),card.id);
  }
  for (const id of ids) db.prepare("UPDATE notions SET mapping_visible=0 WHERE id=?").run(id);
  db.prepare("INSERT INTO quality_settings VALUES('course_methodology_v8_checked','true')").run();
}

// Reversible safety migration: preserve cards, edits and scheduling while
// excluding unaudited automatic cards and known contradictions from study.
export function quarantineUnverifiedCards(db:DatabaseSync) {
  const labels=new Map(db.prepare('SELECT id,label FROM notions').all().map(n=>[String(n.id),String(n.label)]));
  for(const row of db.prepare('SELECT id,payload FROM study_cards').all()) {
    const card=JSON.parse(String(row.payload)) as StudyCard;
    if(card.userEdited || card.status!=='ready')continue;
    const issues=teachingQualityIssues(labels.get(card.notionId??'')??card.question,`${card.answer}\n${card.example}`);
    if(card.promptVersion==='legacy')issues.push('Automatic legacy card: verify its learning objective and answer before enabling review.');
    if(!issues.length)continue;
    const updated={...card,status:'draft',warnings:[...new Set([...card.warnings,...issues])]};
    db.prepare('UPDATE study_cards SET payload=? WHERE id=?').run(JSON.stringify(updated),card.id);
  }
}

export function queueTeachingRechecks(db:DatabaseSync) {
  for(const notion of db.prepare("SELECT n.id,n.label,n.definition,n.explanation,n.status,m.user_edited,m.source_notes FROM notions n JOIN notion_metadata m ON m.notion_id=n.id WHERE m.layer='course'").all()) {
    if(notion.user_edited || notion.status==='validated')continue;
    const explanation=String(notion.explanation??'');
    const issues=teachingQualityIssues(String(notion.label),`${notion.definition}\n${explanation}`);
    if(!issues.length)continue;
    const notes=notion.source_notes?JSON.parse(String(notion.source_notes)) as NotionSourceNote[]:[];
    const matching=notes.filter(n=>n.explanation===explanation);
    const sources=matching.length?matching:db.prepare('SELECT document_id documentId,page FROM notion_sources WHERE notion_id=?').all(notion.id);
    for(const source of sources) {
      const documentId=String(source.documentId),page=Number(source.page);
      const row=db.prepare('SELECT payload FROM page_analysis WHERE document_id=? AND page=?').get(documentId,page);
      const old=row?JSON.parse(String(row.payload)) as PageAnalysis:undefined;
      const warnings=issues.map(issue=>`Consistency recheck — ${notion.label}: ${issue}`);
      if(old?.status==='skipped')continue;
      const payload:PageAnalysis={page,kind:old?.kind??'content',status:'retry',reason:old?.reason??'Previously generated teaching needs a consistency check.',concepts:old?.concepts??0,cards:old?.cards??0,...old,warnings:[...new Set([...(old?.warnings??[]),...warnings])],missingObjectives:[...new Set([...(old?.missingObjectives??[]),...warnings])],updatedAt:new Date().toISOString(),version:old?.version??'legacy'};
      payload.status='retry';
      db.prepare('INSERT INTO page_analysis VALUES(?,?,?) ON CONFLICT(document_id,page) DO UPDATE SET payload=excluded.payload').run(documentId,page,JSON.stringify(payload));
      db.prepare('UPDATE passages SET generated=0 WHERE document_id=? AND page=?').run(documentId,page);
    }
  }
}
function quarantineLegacyLogistics(db:DatabaseSync){
  if(db.prepare("SELECT 1 FROM quality_settings WHERE key='legacy_logistics_checked'").get())return;
  const administrative=/^(course (evaluation|assessment|grading|logistics|organization|organisation)|classroom challenges|further reading|reading list|attendance rules)\b/i;
  const ids=new Set(db.prepare("SELECT id,label FROM notions").all().filter(n=>administrative.test(String(n.label))).map(n=>String(n.id)));
  const links=new Set(db.prepare("SELECT id,source_id,target_id FROM links").all().filter(l=>ids.has(String(l.source_id)) || ids.has(String(l.target_id))).map(l=>String(l.id)));
  for(const row of db.prepare("SELECT * FROM study_cards").all()){
    const card=JSON.parse(String(row.payload)) as StudyCard;
    if(card.promptVersion!=="legacy" || !(ids.has(card.notionId ?? "") || links.has(card.linkId ?? "")))continue;
    const reviewed=db.prepare("SELECT 1 FROM review_state WHERE card_type=? AND card_id=?").get(card.cardType,card.id);
    const updated={...card,status:reviewed ? card.status : "draft",warnings:[...card.warnings,"Course logistics are excluded from learning content; retained for manual review"]};
    db.prepare("UPDATE study_cards SET payload=? WHERE id=?").run(JSON.stringify(updated),card.id);
  }
  for(const id of ids)db.prepare("UPDATE notions SET mapping_visible=0 WHERE id=?").run(id);
  db.prepare("INSERT INTO quality_settings VALUES('legacy_logistics_checked','true')").run();
}
export function initializeQuality(db: DatabaseSync) {
  if (initialized.has(db)) return;
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_cards'").get() && Number(db.prepare("SELECT COUNT(*) n FROM notions").get()?.n)>0) {
    const directory=path.join(dataDirectory(),"backups");fs.mkdirSync(directory,{recursive:true});
    db.prepare("VACUUM INTO ?").run(path.join(directory,`before-independent-cards-${Date.now()}-${randomUUID()}.db`));
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_cards(id TEXT PRIMARY KEY, card_type TEXT NOT NULL, notion_id TEXT, link_id TEXT, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notion_metadata(notion_id TEXT PRIMARY KEY, layer TEXT NOT NULL DEFAULT 'course', evidence TEXT NOT NULL DEFAULT '[]', user_edited INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS link_metadata(link_id TEXT PRIMARY KEY, evidence TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS page_analysis(document_id TEXT NOT NULL, page INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(document_id,page));
    CREATE TABLE IF NOT EXISTS generation_runs(id TEXT PRIMARY KEY, document_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quality_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_requests(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS generation_claims(document_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, expires_at TEXT NOT NULL);
  `);
  initializeSourceDocuments(db);
  db.exec(`CREATE TABLE IF NOT EXISTS generation_jobs(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,run_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('running','complete','needs_review','failed','canceled','interrupted')),payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS generation_jobs_status ON generation_jobs(status);
    INSERT OR IGNORE INTO generation_jobs SELECT substr(q.key,16),json_extract(q.value,'$.id'),json_extract(q.value,'$.status'),q.value FROM quality_settings q JOIN documents d ON d.id=substr(q.key,16) WHERE q.key LIKE 'generation-job:%' AND json_valid(q.value) AND json_extract(q.value,'$.id') IS NOT NULL AND json_extract(q.value,'$.status') IN ('running','complete','needs_review','failed','canceled','interrupted');`);
  db.exec(`CREATE TABLE IF NOT EXISTS card_sources(card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,document_id TEXT NOT NULL,page INTEGER NOT NULL,PRIMARY KEY(card_id,document_id,page));
    CREATE INDEX IF NOT EXISTS card_sources_document_page ON card_sources(document_id,page,card_id);
    CREATE TRIGGER IF NOT EXISTS index_card_sources_insert AFTER INSERT ON study_cards BEGIN
      INSERT OR IGNORE INTO card_sources SELECT NEW.id,json_extract(e.value,'$.documentId'),json_extract(e.value,'$.page') FROM json_each(NEW.payload,'$.evidence') e WHERE json_extract(e.value,'$.documentId') IS NOT NULL AND json_extract(e.value,'$.page') IS NOT NULL;
    END;
    CREATE TRIGGER IF NOT EXISTS index_card_sources_update AFTER UPDATE OF payload ON study_cards BEGIN
      DELETE FROM card_sources WHERE card_id=NEW.id;
      INSERT OR IGNORE INTO card_sources SELECT NEW.id,json_extract(e.value,'$.documentId'),json_extract(e.value,'$.page') FROM json_each(NEW.payload,'$.evidence') e WHERE json_extract(e.value,'$.documentId') IS NOT NULL AND json_extract(e.value,'$.page') IS NOT NULL;
    END;
    INSERT OR IGNORE INTO card_sources SELECT c.id,json_extract(e.value,'$.documentId'),json_extract(e.value,'$.page') FROM study_cards c,json_each(c.payload,'$.evidence') e WHERE json_extract(e.value,'$.documentId') IS NOT NULL AND json_extract(e.value,'$.page') IS NOT NULL;`);
  if(!db.prepare("PRAGMA table_info(notion_metadata)").all().some(c=>c.name==='generation_version'))db.exec("ALTER TABLE notion_metadata ADD COLUMN generation_version TEXT");
  if(!db.prepare("PRAGMA table_info(notion_metadata)").all().some(c=>c.name==='source_notes'))db.exec("ALTER TABLE notion_metadata ADD COLUMN source_notes TEXT");
  if(!db.prepare("PRAGMA table_info(notion_metadata)").all().some(c=>c.name==='clair'))db.exec("ALTER TABLE notion_metadata ADD COLUMN clair TEXT");
  db.exec(`CREATE TRIGGER IF NOT EXISTS invalidate_clair_after_edit
    AFTER UPDATE OF label,definition,explanation ON notions
    WHEN OLD.label IS NOT NEW.label OR OLD.definition IS NOT NEW.definition OR OLD.explanation IS NOT NEW.explanation
    BEGIN UPDATE notion_metadata SET clair=NULL WHERE notion_id=NEW.id; END;`);
  if (db.prepare("SELECT key FROM quality_settings WHERE key='cards_migrated'").get()) {quarantineLegacyLogistics(db);quarantineCourseMethodology(db);quarantineUnverifiedCards(db);queueTeachingRechecks(db);initialized.add(db);return;}
  const add = db.prepare("INSERT OR IGNORE INTO study_cards VALUES(?,?,?,?,?)");
  for (const n of db.prepare("SELECT * FROM notions").all()) {
    const drill = n.drill_card ? JSON.parse(String(n.drill_card)) : null;
    const sources = db.prepare("SELECT document_id,page FROM notion_sources WHERE notion_id=?").all(n.id);
    const card: StudyCard = { id: String(n.id), cardType: "notion", notionId: String(n.id),
      question: `What is ${n.label}?`, answer: drill?.definition ?? String(n.definition), example: drill?.example ?? "",
      kind: "definition", status: "draft", evidence: sources.map(s => ({documentId: String(s.document_id), page: Number(s.page), quote: ""})),
      objective: String(n.label), warnings: ["Legacy card: source support has not been checked"], userEdited: false, model: "legacy", promptVersion: "legacy" };
    add.run(card.id, card.cardType, card.notionId!, null, JSON.stringify(card));
  }
  for (const l of db.prepare("SELECT l.*,a.label a,b.label b FROM links l JOIN notions a ON a.id=l.source_id JOIN notions b ON b.id=l.target_id").all()) {
    const card: StudyCard = {id: String(l.id), cardType: "link", linkId: String(l.id), question: `How are ${l.a} and ${l.b} connected?`,
      answer: String(l.description), example: "", kind: "comparison", status: "draft", evidence: [], objective: "Explain this relationship",
      warnings: ["Legacy card: source support has not been checked"], userEdited: false, model: "legacy", promptVersion: "legacy"};
    add.run(card.id, card.cardType, null, card.linkId!, JSON.stringify(card));
  }
  db.prepare("INSERT INTO quality_settings VALUES('cards_migrated','true')").run();
  quarantineLegacyLogistics(db);
  quarantineCourseMethodology(db);
  quarantineUnverifiedCards(db);
  queueTeachingRechecks(db);
  initialized.add(db);
}
export function getStudyCards(): StudyCard[] {
  const db=openDb(),cards=db.prepare("SELECT payload FROM study_cards").all().map(r=>JSON.parse(String(r.payload)) as StudyCard),context=cardSafetyContext(db,cards);
  return cards.map(card=>safeStudyCard(card,context));
}
export function getStudyCard(id:string):StudyCard|undefined{
  const db=openDb(),row=db.prepare('SELECT payload FROM study_cards WHERE id=?').get(id);
  if(!row)return;
  const card=JSON.parse(String(row.payload)) as StudyCard;
  return safeStudyCard(card,cardSafetyContext(db,[card]));
}
export function getDocumentStudyCards(documentId:string,pages?:number[]):StudyCard[]{
  if(pages&&!pages.length)return [];
  const db=openDb(),rows=db.prepare(`SELECT DISTINCT c.payload FROM study_cards c JOIN card_sources s ON s.card_id=c.id WHERE s.document_id=?${pages?` AND s.page IN (${pages.map(()=>'?').join(',')})`:''}`).all(documentId,...(pages??[]));
  const cards=rows.map(r=>JSON.parse(String(r.payload)) as StudyCard),context=cardSafetyContext(db,cards);
  return cards.map(card=>safeStudyCard(card,context));
}
export function archiveDirectMetadataNotions(documentId:string,pages:number[]) {
  const db=openDb(),excluded=new Set(pages);
  const human=new Set(getDocumentStudyCards(documentId).filter(c=>c.userEdited).map(c=>c.notionId));
  const candidates=db.prepare("SELECT n.id,n.status,m.user_edited FROM notions n JOIN notion_metadata m ON m.notion_id=n.id WHERE m.generation_version LIKE 'direct-cards-%'").all();
  for(const n of candidates){
    if(n.user_edited||n.status==='validated'||human.has(String(n.id)))continue;
    const sources=db.prepare('SELECT document_id,page FROM notion_sources WHERE notion_id=?').all(n.id);
    if(sources.length&&sources.every(s=>s.document_id===documentId&&excluded.has(Number(s.page))))db.prepare('UPDATE notions SET mapping_visible=0 WHERE id=?').run(n.id);
  }
}
function cardSafetyContext(db:DatabaseSync,cards?:StudyCard[]) {
  const labels=new Map<string,string>();
  const text=new Map<string,string>();
  if(cards){
    const ids=[...new Set(cards.map(c=>c.notionId).filter((id):id is string=>Boolean(id)))];
    for(const n of db.prepare(`SELECT id,label FROM notions WHERE id IN (${ids.map(()=>'?').join(',')||'NULL'})`).all(...ids))labels.set(String(n.id),String(n.label));
  }else for(const n of db.prepare('SELECT id,label FROM notions').all())labels.set(String(n.id),String(n.label));
  const documentIds=cards?[...new Set(cards.flatMap(c=>c.evidence.map(e=>e.documentId)))]:undefined;
  const clause=documentIds?` WHERE document_id IN (${documentIds.map(()=>'?').join(',')||'NULL'})`:'';
  for(const p of db.prepare(`SELECT document_id,page,text FROM passages${clause} ORDER BY document_id,page,ordinal`).all(...(documentIds??[]))) {
    const key=`${p.document_id}:${p.page}`;text.set(key,[text.get(key),String(p.text)].filter(Boolean).join('\n'));
  }
  const source={revisions:new Map<string,string>(),text:new Map<string,string>()};
  for(const d of db.prepare(`SELECT document_id,revision FROM source_documents${clause}`).all(...(documentIds??[])))source.revisions.set(String(d.document_id),String(d.revision));
  for(const p of db.prepare(`SELECT document_id,page,text FROM source_pages${clause}`).all(...(documentIds??[])))source.text.set(`${p.document_id}:${p.page}`,String(p.text));
  const byDocument=new Map<string,SourcePage[]>(),administrativePages=new Set<string>();
  for(const [key,value] of source.text){const split=key.lastIndexOf(':'),documentId=key.slice(0,split);const pages=byDocument.get(documentId)??[];pages.push({page:Number(key.slice(split+1)),text:value});byDocument.set(documentId,pages);}
  for(const [documentId,pages] of byDocument){pages.sort((a,b)=>a.page-b.page);for(const page of pages)if(administrativePageReason(page,pages))administrativePages.add(`${documentId}:${page.page}`);}
  const pdfHashes=new Map<string,string>();
  for(const id of new Set((cards??[]).flatMap(c=>c.evidence.filter(e=>e.visualReview).map(e=>e.documentId)))){
    try{const hash=originalPdfHash(readPdfFile(id));if(hash)pdfHashes.set(id,hash);}catch{/* Missing original files cannot validate visual provenance. */}
  }
  return {labels,text,source,administrativePages,pdfHashes,lessons:new Map(getTeachingLessons().map(l=>[l.id,l]))};
}
function safeStudyCard(card:StudyCard,context:ReturnType<typeof cardSafetyContext>):StudyCard {
  if(!card.userEdited&&card.status!=='suspended'&&card.promptVersion.startsWith('direct-cards-')&&card.evidence.length&&card.evidence.every(e=>context.administrativePages.has(`${e.documentId}:${e.page}`)))return {...card,status:'suspended',warnings:[...new Set([...card.warnings,'Excluded course metadata or participant feedback; original card and review history retained'])]};
  if(card.status!=='ready')return card;
  const issues=[...teachingQualityIssues(context.labels.get(card.notionId??'')??card.question,`${card.answer}\n${card.example}`)];
  const inspectedVisual=card.evidence.length>0&&card.evidence.every(e=>verifiedVisualEvidence(e,context.pdfHashes.get(e.documentId),recallContentHash(card)));
  for(const e of card.evidence)if(!e.quote.trim()&&!verifiedVisualEvidence(e,context.pdfHashes.get(e.documentId),recallContentHash(card)))issues.push('Visual evidence must be inspected against the original PDF for this exact question and answer.');
  if(!card.teaching&&!inspectedVisual&&!card.userEdited&&card.promptVersion.startsWith('direct-cards-')&&card.evidence.length&&card.evidence.every(e=>!hasSourceTeachingText(context.source.text.get(`${e.documentId}:${e.page}`)??'')))issues.push('Heading/reference text does not verify image facts; inspect the original source');
  if(!card.userEdited&&card.promptVersion.startsWith('direct-cards-')&&/communication tone/i.test(context.labels.get(card.notionId??'')??'')){
    const outline=card.evidence.map(e=>(context.source.text.get(`${e.documentId}:1`)??'')+' '+(context.source.text.get(`${e.documentId}:2`)??'')).join(' ').replace(/\s+/g,' ');
    if(/insurance (?:company|industry)/i.test(outline)&&!/communication/i.test(outline))issues.push('Participant communication feedback is outside this course subject');
  }
  if(!card.userEdited&&card.promptVersion.startsWith('direct-cards-'))issues.push(...pedagogicalIssues({question:card.question,answer:card.answer,topic:context.labels.get(card.notionId??'')??'',objective:card.objective}));
  if(!card.userEdited&&!card.presentation&&/^(?:slides-|qa-|direct-cards-)/.test(card.promptVersion)&&!card.accuracyReview)issues.push('This generated card needs the current independent claim review before it can be studied.');
  if(!card.userEdited&&card.promptVersion==='legacy')issues.push('This legacy card has not passed a current source review.');
  issues.push(...cardReviewIssues(card,context.text,context.source));
  if(card.teaching)issues.push(...teachingTraceIssues(card.teaching,context.lessons));
  // Imported templates have their own compatibility gate. Their length and
  // presentation differ from generated atomic cards; arithmetic still applies.
  if(!card.presentation)issues.push(...cardQuality(card.question,card.answer,card.kind));
  for(const e of card.evidence){const text=card.accuracyReview?.sources.some(s=>s.documentId===e.documentId&&s.revision)?context.source.text:context.text;const original=text.get(`${e.documentId}:${e.page}`)??'';const teachingAnchor=card.teaching&&e.quote.trim()&&original.normalize('NFC').replace(/\s+/g,' ').includes(e.quote.normalize('NFC').replace(/\s+/g,' '));if(e.quote.trim()&&!teachingAnchor&&!verifiesQuote(e.quote,original))issues.push('The source quotation changed or disappeared; verify this card before reviewing.');}
  if(!issues.length)return card;
  // This is a read-time safety projection: preserve stored edits, suspension,
  // IDs and FSRS, but never let a stale ready flag bypass queues/offline/export.
  return {...card,status:'draft',warnings:[...new Set([...card.warnings,...issues])]};
}
export function saveStudyCard(card: StudyCard,context?:ReturnType<typeof cardSafetyContext>) {
  card=safeStudyCard(card,context??cardSafetyContext(openDb(),[card]));
  const previous=openDb().prepare("SELECT payload FROM study_cards WHERE id=?").get(card.id);
  if(previous){
    const old=JSON.parse(String(previous.payload)) as StudyCard;
    if(old.question!==card.question || old.answer!==card.answer || old.example!==card.example || old.objective!==card.objective || old.explanation!==card.explanation){
      card={...card,...(old.question!==card.question||old.answer!==card.answer?{presentation:undefined}:{}),revisions:[...(old.revisions ?? []),{question:old.question,answer:old.answer,example:old.example,explanation:old.explanation,objective:old.objective,at:new Date().toISOString()}].slice(-8)};
    }
  }
  openDb().prepare(`INSERT INTO study_cards VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,notion_id=excluded.notion_id,link_id=excluded.link_id`)
    .run(card.id, card.cardType, card.notionId ?? null, card.linkId ?? null, JSON.stringify(card));
  return card;
}
export function saveStudyCards(cards:StudyCard[]):StudyCard[]{const context=cardSafetyContext(openDb(),cards);return cards.map(card=>saveStudyCard(card,context));}
export function getNotionMetadata(): Record<string, {layer: ContentLayer; evidence: Evidence[]; userEdited: boolean; generationVersion?:string; sourceNotes:NotionSourceNote[];clair?: ClairLesson;contentWarnings?:string[]}> {
  const db=openDb(),rows=db.prepare('SELECT * FROM notion_metadata').all();
  const text=rows.some(r=>r.clair)?cardSafetyContext(db).text:new Map<string,string>();
  return Object.fromEntries(rows.map(r=>{
    const clair=r.clair?JSON.parse(String(r.clair)) as ClairLesson:undefined;
    return [String(r.notion_id),{layer:r.layer as ContentLayer,evidence:JSON.parse(String(r.evidence)),userEdited:Boolean(r.user_edited),generationVersion:r.generation_version?String(r.generation_version):undefined,sourceNotes:r.source_notes?JSON.parse(String(r.source_notes)):[],clair,...(clair?{contentWarnings:lessonReviewIssues(clair,text)}:{})}];
  }));
}
export function setNotionClair(id: string, lesson: ClairLesson | null) {
  if (lesson && !isClairLesson(lesson)) throw new Error('Invalid C.L.A.I.R. lesson');
  const notion=openDb().prepare('SELECT label FROM notions WHERE id=?').get(id);
  if(lesson&&(!notion||!clairMatchesConcept(String(notion.label),lesson)))throw new Error('Lesson belongs to a different concept');
  if(lesson){const issues=clairQualityIssues(String(notion!.label),lesson);if(issues.length)throw Error(`Unsafe structured lesson: ${issues.join('; ')}`);}
  openDb().prepare('UPDATE notion_metadata SET clair=? WHERE notion_id=?').run(lesson ? JSON.stringify(lesson) : null, id);
}
export function setNotionMetadata(id: string, layer: ContentLayer, evidence: Evidence[], generationVersion?:string,sourceNotes?:NotionSourceNote[]) {
  openDb().prepare(`INSERT INTO notion_metadata(notion_id,layer,evidence,generation_version,source_notes) VALUES(?,?,?,?,?) ON CONFLICT(notion_id) DO UPDATE SET layer=excluded.layer,evidence=excluded.evidence,generation_version=COALESCE(excluded.generation_version,notion_metadata.generation_version),source_notes=COALESCE(excluded.source_notes,notion_metadata.source_notes)`)
    .run(id, layer, JSON.stringify(evidence),generationVersion ?? null,sourceNotes ? JSON.stringify(sourceNotes) : null);
}
export function getLinkEvidence(): Record<string,Evidence[]> {
  return Object.fromEntries(openDb().prepare("SELECT * FROM link_metadata").all().map(r=>[String(r.link_id),JSON.parse(String(r.evidence))]));
}
export function setLinkEvidence(id:string,evidence:Evidence[]) {
  openDb().prepare("INSERT INTO link_metadata VALUES(?,?) ON CONFLICT(link_id) DO UPDATE SET evidence=excluded.evidence").run(id,JSON.stringify(evidence));
}
export function attachSource(notionId: string, documentId: string, page: number) {
  const db = openDb();
  if (!db.prepare("SELECT 1 FROM notion_sources WHERE notion_id=? AND document_id=? AND page=?").get(notionId, documentId, page))
    db.prepare("INSERT INTO notion_sources VALUES(?,?,?)").run(notionId, documentId, page);
  db.prepare("UPDATE notions SET mapping_visible=1 WHERE id=?").run(notionId);
}
export interface PageAnalysis {previousAnalysis?:Omit<PageAnalysis,'previousAnalysis'>;knowledgeCoverage?:Array<{key:string;claim:string;status:string;reason:string;sourceIds:string[];cardKeys:string[]}>;failureKind?:'provider'|'contract'|'source';generationComplete?:boolean;page: number; kind: string; status: "complete" | "skipped" | "retry"; reason: string; warnings: string[]; concepts: number; cards: number; readyCards?:number; draftCards?:number; teachingPoints?:Array<{detail:string;covered:boolean}>; missingObjectives?:string[]; sourceRevision?:string; updatedAt: string; version: string;}
export function pageAnalyses(documentId: string): PageAnalysis[] {
  return openDb().prepare("SELECT payload FROM page_analysis WHERE document_id=? ORDER BY page").all(documentId).map(r => JSON.parse(String(r.payload)));
}
export function savePageAnalysis(documentId: string, analysis: PageAnalysis) {
  if(analysis.status==='retry'&&!analysis.previousAnalysis){
    const row=openDb().prepare('SELECT payload FROM page_analysis WHERE document_id=? AND page=?').get(documentId,analysis.page);
    const prior=row?JSON.parse(String(row.payload)) as PageAnalysis:undefined;
    if(prior){
      const {previousAnalysis,...body}=prior;
      const previous=previousAnalysis??(prior.generationComplete||prior.status==='complete'||prior.status==='skipped'?body:undefined);
      if(previous)analysis={...analysis,previousAnalysis:previous};
    }
  }
  openDb().prepare("INSERT INTO page_analysis VALUES(?,?,?) ON CONFLICT(document_id,page) DO UPDATE SET payload=excluded.payload")
    .run(documentId, analysis.page, JSON.stringify(analysis));
}
export function retryPages(documentId: string, pages: number[]) {
  const db = openDb();
  for (const page of pages) {
    db.prepare("UPDATE passages SET generated=0 WHERE document_id=? AND page=?").run(documentId,page);
    const row=db.prepare('SELECT payload FROM page_analysis WHERE document_id=? AND page=?').get(documentId,page);
    if(row){const prior=JSON.parse(String(row.payload)) as PageAnalysis;savePageAnalysis(documentId,{...prior,status:'retry',generationComplete:false,failureKind:undefined,knowledgeCoverage:undefined,reason:'Regeneration pending; saved cards and previous analysis are preserved',warnings:[],missingObjectives:[],updatedAt:new Date().toISOString()});}
  }
}
export function ensureDocumentPages(documentId: string, count: number) {
  const db = openDb();
  for (let page=1; page<=count; page++) if (!db.prepare("SELECT 1 FROM passages WHERE document_id=? AND page=?").get(documentId,page))
    db.prepare("INSERT INTO passages(id,document_id,page,ordinal,text) VALUES(?,?,?,0,'')").run(randomUUID(),documentId,page);
}
export function saveGenerationRun(id: string, documentId: string, payload: unknown) {
  openDb().prepare("INSERT INTO generation_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(id,documentId,JSON.stringify(payload));
}
export function getReviewSettings() {
  const row = openDb().prepare("SELECT value FROM quality_settings WHERE key='review'").get();
  return {newPerDay:20,sessionLimit:100,retention:0.9,...(row ? JSON.parse(String(row.value)) as {newPerDay:number;sessionLimit:number;retention?:number} : {})};
}
export function getFsrsWeights():readonly number[]{
  const row=openDb().prepare("SELECT value FROM quality_settings WHERE key='scheduler-profile'").get();
  if(!row)return FSRS_WEIGHTS;
  try{const profile=JSON.parse(String(row.value));return validFsrsWeights(profile.weights)?profile.weights:FSRS_WEIGHTS;}catch{return FSRS_WEIGHTS;}
}
export function saveReviewSettings(settings: {newPerDay: number; sessionLimit: number;retention?:number}) {
  const retention=settings.retention??getReviewSettings().retention;
  if(!Number.isFinite(retention)||retention<0.7||retention>0.99)throw new Error('Retention must be between 0.7 and 0.99');
  openDb().prepare("INSERT INTO quality_settings VALUES('review',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({...settings,retention}));
}
export function exportQuality() { return Object.fromEntries(TABLES.map(table => [table, openDb().prepare(`SELECT * FROM ${table}`).all()])); }
export function clearQuality() {openDb().exec("DELETE FROM generation_claims");for (const table of TABLES) openDb().exec(`DELETE FROM ${table}`);}
export function claimDocument(documentId:string,runId:string) {
  const now=new Date().toISOString(),expires=new Date(Date.now()+15*60*1000).toISOString();
  return Boolean(openDb().prepare("INSERT INTO generation_claims VALUES(?,?,?) ON CONFLICT(document_id) DO UPDATE SET run_id=excluded.run_id,expires_at=excluded.expires_at WHERE generation_claims.expires_at<=? RETURNING run_id").get(documentId,runId,expires,now));
}
export function ownsClaim(documentId:string,runId:string) {return Boolean(openDb().prepare("SELECT 1 FROM generation_claims WHERE document_id=? AND run_id=?").get(documentId,runId));}
export function renewClaim(documentId:string,runId:string) {openDb().prepare("UPDATE generation_claims SET expires_at=? WHERE document_id=? AND run_id=?").run(new Date(Date.now()+15*60*1000).toISOString(),documentId,runId);}
export function releaseClaim(documentId:string,runId:string) {openDb().prepare("DELETE FROM generation_claims WHERE document_id=? AND run_id=?").run(documentId,runId);}
export function importQuality(data: Record<string, unknown[]> | undefined) {
  if (!data) {const db=openDb();db.prepare("DELETE FROM quality_settings WHERE key='cards_migrated'").run();initialized.delete(db);initializeQuality(db);return;}
  for (const table of TABLES) for (const item of data[table] ?? []) {
    const row = item as Record<string, string | number | null>;
    if(table==='quality_settings' && String(row.key).startsWith('fsrs:') && !validFsrsMemory(JSON.parse(String(row.value))))throw new Error('Invalid FSRS memory in backup');
    if(!row || typeof row!=="object")throw new Error(`Invalid ${table} backup record`);
    if(table==='source_documents'&&(!/^[a-f0-9]{64}$/.test(String(row.revision))||!['pdf','legacy-passages'].includes(String(row.origin))||(row.pdf_sha256!==null&&!/^[a-f0-9]{64}$/.test(String(row.pdf_sha256)))))throw Error('Invalid source document in backup');
    if(table==='source_pages'&&(typeof row.text!=='string'||!Number.isInteger(row.page)||Number(row.page)<1))throw Error('Invalid source page in backup');
    if(table==='generation_jobs'){const job=JSON.parse(String(row.payload));if(job.id!==row.run_id||job.documentId!==row.document_id||job.status!==row.status)throw Error('Invalid generation job in backup');}
    if("payload" in row){
      const payload=JSON.parse(String(row.payload));
      if(!payload || typeof payload!=="object")throw new Error(`Invalid ${table} payload`);
      if(table==="study_cards"){
        const card=payload as StudyCard;
        if(card.id!==row.id || card.cardType!==row.card_type || !["notion","link"].includes(card.cardType) || !["draft","ready","suspended"].includes(card.status) || typeof card.question!=="string" || typeof card.answer!=="string" || typeof card.example!=="string" || typeof card.objective!=="string" || typeof card.model!=="string" || typeof card.promptVersion!=="string" || typeof card.userEdited!=="boolean" || !Array.isArray(card.evidence) || !Array.isArray(card.warnings) || card.warnings.some(w=>typeof w!=="string"))throw new Error("Invalid study card in backup");
        for(const e of card.evidence)if(!e || typeof e.documentId!=="string" || !Number.isInteger(e.page) || e.page<1 || typeof e.quote!=="string" || (e.visualDescription!==undefined && typeof e.visualDescription!=="string"))throw new Error("Invalid card evidence in backup");
        if(card.revisions!==undefined && (!Array.isArray(card.revisions) || card.revisions.some(r=>!r || typeof r.question!=="string" || typeof r.answer!=="string" || typeof r.example!=="string" || typeof r.objective!=="string" || typeof r.at!=="string" || !Number.isFinite(new Date(r.at).getTime()))))throw new Error("Invalid card history in backup");
        if(card.presentation&&(!/^[a-f0-9]{64}$/.test(card.presentation.packageHash)||typeof card.presentation.frontHtml!=='string'||typeof card.presentation.backHtml!=='string'||card.presentation.frontHtml.length>1000000||card.presentation.backHtml.length>1000000))throw Error('Invalid imported card presentation');
        if(card.accuracyReview!==undefined&&!validContentReview(card.accuracyReview))throw Error('Invalid card accuracy review in backup');
        if(card.teaching!==undefined&&!validTeachingTrace(card.teaching))throw Error('Invalid teaching provenance in backup');
        if(card.explanation!==undefined&&(typeof card.explanation!=='string'||card.explanation.length>12000))throw Error('Invalid card explanation in backup');
      }
      if(table==="page_analysis" && (!Number.isInteger(payload.page) || !["complete","skipped","retry"].includes(payload.status) || !Array.isArray(payload.warnings)))throw new Error("Invalid page audit in backup");
      if(table==="review_requests" && (typeof payload.dueAt!=="string" || !Number.isFinite(new Date(payload.dueAt).getTime()) || typeof payload.intervalDays!=="number"))throw new Error("Invalid review receipt in backup");
    }
    if("evidence" in row && !Array.isArray(JSON.parse(String(row.evidence))))throw new Error("Invalid evidence in backup");
    if(table==='notion_metadata' && row.source_notes) {
      const notes=JSON.parse(String(row.source_notes));
      if(!Array.isArray(notes) || notes.some(n=>!n || typeof n.documentId!=='string' || !Number.isInteger(n.page) || n.page<1 || typeof n.explanation!=='string' || typeof n.courseContext!=='string' || typeof n.version!=='string'))throw new Error('Invalid source notes in backup');
    }
    if(table==='notion_metadata' && row.clair && !isClairLesson(JSON.parse(String(row.clair))))throw new Error('Invalid C.L.A.I.R. lesson in backup');
    if(table==="quality_settings"){
      const setting=JSON.parse(String(row.value));
        if(String(row.key).startsWith('teaching-lesson:')&&(!validTeachingLesson(setting)||String(row.key)!==`teaching-lesson:${setting.id}`))throw Error('Invalid reconstructed lesson in backup');
      if(row.key==='scheduler-profile'&&!validFsrsWeights(setting.weights))throw new Error('Invalid personalized scheduler in backup');
      if(String(row.key).startsWith('review-epoch:')&&(typeof setting.at!=='string'||!Number.isFinite(Date.parse(setting.at))))throw new Error('Invalid review reset boundary in backup');
      if(row.key==="review" && (!Number.isInteger(setting.newPerDay) || setting.newPerDay<0 || setting.newPerDay>200 || !Number.isInteger(setting.sessionLimit) || setting.sessionLimit<1 || setting.sessionLimit>500 || (setting.retention!==undefined && (!Number.isFinite(setting.retention)||setting.retention<0.7||setting.retention>0.99))))throw new Error("Invalid review settings in backup");
    }
    const columns = (openDb().prepare(`PRAGMA table_info(${table})`).all()).map(c => String(c.name));
    openDb().prepare(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(()=>"?").join(",")})`).run(...columns.map(c => row[c] ?? null));
  }
  for(const row of openDb().prepare('SELECT document_id FROM source_documents').all())loadSourceDocument(openDb(),String(row.document_id));
}
