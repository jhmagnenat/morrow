import { scopedCourseId } from "@/lib/courseScope";
import {learningTaskIdentity} from '@/lib/taskIdentity';
import { summarizeCards } from "@/lib/contentQuality";
import { initializeQuality, getStudyCards, getStudyCard, getNotionMetadata, getLinkEvidence, getReviewSettings, exportQuality, clearQuality, importQuality } from "@/lib/qualityDb";
import type { StudyCard } from "@/lib/contentQuality";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { DEFAULT_COURSE_ID } from "@/lib/courses";
import { dataDirectory } from '@/lib/dataDirectory';
import { dueDateFrom, INITIAL_REVIEW_STATE, nextReviewState, type Grade, type ReviewState } from "@/lib/srs";
import {replayFsrs,validFsrsMemory,FSRS_WEIGHTS,fsrsParameterKey} from '@/lib/fsrs';
import {getFsrsWeights} from '@/lib/qualityDb';
import { levelFromXp, xpForGrade, type LevelProgress } from "@/lib/xp";
import {
  computeMasteryProfile,
  cardMasteryDimension,
  type MasteryDimension,
  type MasterySignal,
  MASTERY_DIMENSIONS,
  gradeToScore,
  verdictToScore,
  type MasteryInfo,
  type MasterySource,
} from "@/lib/mastery";
import type { ExplainLevel } from "@/lib/explain";
import type {
  AdeptExplanation,
  Document,
  DocumentKind,
  DrillCard,
  GenerationMode,
  GoFurtherNote,
  Link,
  LinkType,
  Notion,
  NotionStatus,
  Passage,
  Source,
  WorkQuestion,
} from "@/lib/types";

// One SQLite file per course (see lib/courses.ts) — openDb() below always
// connects to whichever course is currently active, caching one connection
// per course so switching back to a previously-opened course is instant.
// The original "default" course keeps using DB_NAME/encyclopedia.db for
// backward compatibility with the single-course setup this app started as.
function dbPathForCourse(courseId: string): string {
  const fileName = courseId === DEFAULT_COURSE_ID ? (process.env.DB_NAME ?? "encyclopedia") : courseId;
  return path.join(dataDirectory(), `${fileName}.db`);
}

declare global {
  var __courseDbs: Map<string, DatabaseSync> | undefined;
}

// Adds a column to an existing table if it isn't there yet — lets a column
// added in a later version of this file apply safely to a database file
// created by an earlier version, without losing whatever's already in it.
// CREATE TABLE IF NOT EXISTS alone only covers a brand-new database.
function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDb(): DatabaseSync {
  const courseId = scopedCourseId();
  if (!global.__courseDbs) global.__courseDbs = new Map();
  const cached = global.__courseDbs.get(dbPathForCourse(courseId));
  if (cached) {
    // Dev hot reload keeps existing connections alive across schema updates.
    ensureColumn(cached, "notions", "mapping_visible", "INTEGER NOT NULL DEFAULT 1");
    ensureColumn(cached, 'mastery_signals', 'dimension', 'TEXT');
    ensureColumn(cached, 'mastery_signals', 'unaided', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(cached, 'mastery_signals', 'task_id', 'TEXT');
    ensureColumn(cached, 'notion_metadata', 'clair', 'TEXT');
    ensureColumn(cached, 'explain_attempts', 'unaided', 'INTEGER NOT NULL DEFAULT 0');
    initializeQuality(cached);
    return cached;
  }

  const dbPath = dbPathForCourse(courseId);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT,
      page_count INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS passages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      text TEXT NOT NULL,
      generated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notions (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      definition TEXT NOT NULL,
      explanation TEXT,
      grounding TEXT,
      work_questions TEXT NOT NULL DEFAULT '[]',
      adept TEXT,
      go_further TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notion_sources (
      notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    -- Spaced-repetition state (SM-2), one row per card once it's been
    -- studied at least once. card_type is 'notion' (Drill) or 'link'
    -- (Connect) — no FK, since card_id points into whichever table; a
    -- deleted notion/link just leaves a harmless unused row.
    CREATE TABLE IF NOT EXISTS review_state (
      card_type TEXT NOT NULL,
      card_id TEXT NOT NULL,
      interval_days REAL NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      repetitions INTEGER NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_reviewed_at TEXT,
      PRIMARY KEY (card_type, card_id)
    );

    -- Full history of every grading event (unlike review_state, which only
    -- holds the current scheduling state) — powers the Progress dashboard's
    -- review heatmap, forecast, and retention rate.
    CREATE TABLE IF NOT EXISTS review_log (
      id TEXT PRIMARY KEY,
      card_type TEXT NOT NULL,
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Every mastery-relevant performance event, across every feature
    -- (Drill, Connect, Explain, Interview) — "how well did the user do on
    -- this notion just now", as a 0-1 score. Deliberately separate from
    -- review_state/review_log above: those drive WHEN a card comes back up
    -- (SRS scheduling); this drives the mastery level shown on the map,
    -- which is a different question (how well is it actually known).
    CREATE TABLE IF NOT EXISTS mastery_signals (
      id TEXT PRIMARY KEY,
      notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      score REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mastery_signals_notion ON mastery_signals(notion_id);

    -- One row per (notion, explain level) attempt history, so the "Explain"
    -- mode can show what's been completed and the last feedback received.
    CREATE TABLE IF NOT EXISTS explain_attempts (
      id TEXT PRIMARY KEY,
      notion_id TEXT NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      verdict TEXT NOT NULL,
      feedback TEXT NOT NULL,
      covered_keywords TEXT NOT NULL DEFAULT '[]',
      missing_keywords TEXT NOT NULL DEFAULT '[]',
      corrected_text TEXT,
      example_answer TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- English pronunciation practice cards (card_type 'pronunciation' in
    -- review_state/review_log) — usually generated from the corrected,
    -- idiomatic version of an Explain attempt, but can also stand alone.
    -- "words" is a JSON array of
    -- { word, ipa, syllables, sentenceStress, note, linksToNext, blendWithNext }.
    CREATE TABLE IF NOT EXISTS pronunciation_cards (
      id TEXT PRIMARY KEY,
      notion_id TEXT REFERENCES notions(id) ON DELETE CASCADE,
      source_attempt_id TEXT REFERENCES explain_attempts(id) ON DELETE SET NULL,
      text TEXT NOT NULL,
      words TEXT NOT NULL DEFAULT '[]',
      full_ipa TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- English expressions/phrases captured anywhere in the app (Alt+2 on a
    -- selection) with their French translation — card_type 'vocabulary'.
    CREATE TABLE IF NOT EXISTS vocabulary_cards (
      id TEXT PRIMARY KEY,
      phrase TEXT NOT NULL,
      translation_fr TEXT NOT NULL,
      example TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- A full mock job-interview session: generated questions tailored to a
    -- job + CV, the student's written answers, and per-answer feedback.
    -- "exchanges" is a JSON array of
    -- { question, relatedNotionIds, answer, feedback, correctedAnswer, score, answeredAt }.
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY,
      job_title TEXT NOT NULL,
      job_description TEXT NOT NULL DEFAULT '',
      cv_text TEXT NOT NULL DEFAULT '',
      cover_letter TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'in_progress',
      exchanges TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT
    );

    -- Single-row table tracking the daily review streak for this course —
    -- "cleared" means every due queue (notion/link/pronunciation/vocabulary)
    -- was empty at some point that day. XP itself isn't stored here; it's
    -- computed on the fly from review_log so there's nothing to keep in sync.
    CREATE TABLE IF NOT EXISTS app_progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_cleared_date TEXT,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec("INSERT OR IGNORE INTO app_progress (id) VALUES (1);");

  // Columns added after a table's original CREATE — applied to any
  // pre-existing database file that predates them.
  ensureColumn(db, "notions", "work_questions", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "notions", "adept", "TEXT");
  ensureColumn(db, "notions", "go_further", "TEXT");
  ensureColumn(db, "notions", "drill_card", "TEXT");
  ensureColumn(db, "notions", "course_context", "TEXT");
  ensureColumn(db, "notions", "mapping_visible", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "explain_attempts", "corrected_text", "TEXT");
  ensureColumn(db, "explain_attempts", "example_answer", "TEXT");
  ensureColumn(db, "pronunciation_cards", "full_ipa", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "interview_sessions", "cover_letter", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "mastery_signals", "dimension", "TEXT");
  ensureColumn(db, "mastery_signals", "unaided", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'mastery_signals', 'task_id', 'TEXT');
  ensureColumn(db, 'explain_attempts', 'unaided', 'INTEGER NOT NULL DEFAULT 0');

  initializeQuality(db);
  global.__courseDbs.set(dbPath, db);
  return db;
}

export interface Graph {
  notions: Notion[];
  links: Link[];
  documents: Document[];
}

export function getGraph(mappingOnly = false): Graph {
  const db = openDb();

  const notionRows = db.prepare(mappingOnly ? "SELECT * FROM notions WHERE mapping_visible = 1" : "SELECT * FROM notions").all() as Array<{
    id: string;
    label: string;
    domain: Notion["domain"];
    status: NotionStatus;
    definition: string;
    explanation: string | null;
    grounding: Notion["grounding"] | null;
    work_questions: string;
    adept: string | null;
    go_further: string | null;
    drill_card: string | null;
    course_context: string | null;
  }>;
  const sourceRows = db.prepare("SELECT * FROM notion_sources").all() as Array<{
    notion_id: string;
    document_id: string;
    page: number;
  }>;
  const linkRows = db.prepare(mappingOnly
    ? `SELECT links.* FROM links
       JOIN notions source ON source.id = links.source_id
       JOIN notions target ON target.id = links.target_id
       WHERE source.mapping_visible = 1 AND target.mapping_visible = 1`
    : "SELECT * FROM links").all() as Array<{
    id: string;
    source_id: string;
    target_id: string;
    type: LinkType;
    description: string;
  }>;
  const documentRows = db.prepare("SELECT * FROM documents").all() as Array<{
    id: string;
    title: string;
    kind: DocumentKind;
    filename: string | null;
    page_count: number | null;
  }>;

  const sourcesByNotion = new Map<string, Source[]>();
  for (const row of sourceRows) {
    const list = sourcesByNotion.get(row.notion_id) ?? [];
    list.push({ documentId: row.document_id, page: row.page });
    sourcesByNotion.set(row.notion_id, list);
  }

  const metadata = getNotionMetadata();
  const studyCards=getStudyCards();
  const linksById=new Map(linkRows.map(link=>[link.id,link]));
  const cardsByNotion=new Map<string,StudyCard[]>();
  for(const card of studyCards){
    const link=card.linkId?linksById.get(card.linkId):undefined;
    const recipients=new Set([card.notionId,link?.source_id,link?.target_id].filter((id):id is string=>!!id));
    for(const id of recipients){const list=cardsByNotion.get(id)??[];list.push(card);cardsByNotion.set(id,list);}
  }
  const notions: Notion[] = notionRows.filter(row=>!mappingOnly||!metadata[row.id]?.generationVersion?.startsWith('direct-cards-')||row.status==='validated'||metadata[row.id]?.userEdited||(cardsByNotion.get(row.id)??[]).some(c=>c.status==='ready'||c.userEdited)).map((row) => ({
    ...metadata[row.id],
    cardCoverage:summarizeCards(cardsByNotion.get(row.id)??[]),
    id: row.id,
    label: row.label,
    domain: row.domain,
    status: row.status,
    definition: row.definition,
    explanation: row.explanation ?? undefined,
    grounding: row.grounding ?? undefined,
    workQuestions: normalizeWorkQuestions(row.work_questions),
    adept: row.adept ? JSON.parse(row.adept) : undefined,
    goFurther: row.go_further ? JSON.parse(row.go_further) : undefined,
    drillCard: row.drill_card ? JSON.parse(row.drill_card) : undefined,
    courseContext: row.course_context ?? undefined,
    sources: sourcesByNotion.get(row.id) ?? [],
  }));

  const linkEvidence=getLinkEvidence();
  const archivedLinks=new Set<string>();
  if(mappingOnly){
    const curriculum=db.prepare("SELECT value FROM quality_settings WHERE key='course-learning-curriculum'").get();
    try{const ids=curriculum?JSON.parse(String(curriculum.value)).archivedLinkIds:[];if(Array.isArray(ids))for(const id of ids)if(typeof id==='string')archivedLinks.add(id);}catch{/* Older or invalid optional navigation metadata does not remove user data. */}
  }
  const visibleNotionIds=new Set(notions.map(n=>n.id));
  const links: Link[] = linkRows.filter(row=>!archivedLinks.has(row.id)&&(!mappingOnly||visibleNotionIds.has(row.source_id)&&visibleNotionIds.has(row.target_id))).map((row) => ({
    id: row.id,
    evidence: linkEvidence[row.id],
    source: row.source_id,
    target: row.target_id,
    type: row.type,
    description: row.description,
  }));

  const documents: Document[] = documentRows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    filename: row.filename ?? undefined,
    pageCount: row.page_count ?? undefined,
  }));

  return { notions, links, documents };
}

export function updateNotionStatus(id: string, status: NotionStatus) {
  const db = openDb();
  db.prepare("UPDATE notions SET status = ? WHERE id = ?").run(status, id);
}

export function updateNotionAdept(id: string, adept: AdeptExplanation) {
  const db = openDb();
  db.prepare("UPDATE notions SET adept = ? WHERE id = ?").run(JSON.stringify(adept), id);
}

export function updateNotionGoFurther(id: string, note: GoFurtherNote) {
  const db = openDb();
  db.prepare("UPDATE notions SET go_further = ? WHERE id = ?").run(JSON.stringify(note), id);
}

export function updateNotionDrillCard(id: string, card: DrillCard) {
  const db = openDb();
  db.prepare("UPDATE notions SET drill_card = ? WHERE id = ?").run(JSON.stringify(card), id);
}

// Notions created before each workQuestion carried its own answer stored
// just the question strings — normalize those into { question, answer: "" }
// so old data doesn't crash the new shape; lib/workQuestions.ts lazily
// backfills the missing answers the first time such a notion is viewed.
function normalizeWorkQuestions(raw: string | null): WorkQuestion[] {
  const parsed = JSON.parse(raw ?? "[]") as Array<string | WorkQuestion>;
  return parsed.map((item) => (typeof item === "string" ? { question: item, answer: "" } : item));
}

export function updateNotionWorkQuestions(id: string, workQuestions: WorkQuestion[]) {
  const db = openDb();
  db.prepare("UPDATE notions SET work_questions = ? WHERE id = ?").run(JSON.stringify(workQuestions), id);
}

export function insertNotion(notion: Omit<Notion, "id"> & { id?: string }): Notion {
  const db = openDb();
  const id = notion.id ?? randomUUID();
  db.prepare(
    "INSERT INTO notions (id, label, domain, status, definition, explanation, grounding, work_questions, adept, go_further, drill_card, course_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    notion.label,
    notion.domain,
    notion.status,
    notion.definition,
    notion.explanation ?? null,
    notion.grounding ?? null,
    JSON.stringify(notion.workQuestions ?? []),
    notion.adept ? JSON.stringify(notion.adept) : null,
    notion.goFurther ? JSON.stringify(notion.goFurther) : null,
    notion.drillCard ? JSON.stringify(notion.drillCard) : null,
    notion.courseContext ?? null
  );
  const insertSource = db.prepare(
    "INSERT INTO notion_sources (notion_id, document_id, page) VALUES (?, ?, ?)"
  );
  for (const source of notion.sources) {
    insertSource.run(id, source.documentId, source.page);
  }
  return { ...notion, id };
}

export function insertLink(linkInput: Omit<Link, "id"> & { id?: string }): Link {
  const db = openDb();
  const id = linkInput.id ?? randomUUID();
  db.prepare(
    "INSERT INTO links (id, source_id, target_id, type, description) VALUES (?, ?, ?, ?, ?)"
  ).run(id, linkInput.source, linkInput.target, linkInput.type, linkInput.description ?? "");
  return { ...linkInput, id };
}

export function updateLink(id: string, updates: Partial<Pick<Link, "source" | "target" | "type" | "description">>) {
  const db = openDb();
  const current = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as
    | { id: string; source_id: string; target_id: string; type: LinkType; description: string }
    | undefined;
  if (!current) return null;
  const next = {
    source: updates.source ?? current.source_id,
    target: updates.target ?? current.target_id,
    type: updates.type ?? current.type,
    description: updates.description ?? current.description,
  };
  db.prepare("UPDATE links SET source_id = ?, target_id = ?, type = ?, description = ? WHERE id = ?").run(
    next.source,
    next.target,
    next.type,
    next.description,
    id
  );
  return { id, ...next };
}

export function insertDocument(doc: Omit<Document, "id"> & { id?: string }): Document {
  const db = openDb();
  const id = doc.id ?? randomUUID();
  db.prepare(
    "INSERT INTO documents (id, title, kind, filename, page_count) VALUES (?, ?, ?, ?, ?)"
  ).run(id, doc.title, doc.kind, doc.filename ?? null, doc.pageCount ?? null);
  return { ...doc, id };
}

export function insertPassages(passages: Array<Omit<Passage, "id">>) {
  const db = openDb();
  const insert = db.prepare(
    "INSERT INTO passages (id, document_id, page, ordinal, text) VALUES (?, ?, ?, ?, ?)"
  );
  for (const passage of passages) {
    insert.run(randomUUID(), passage.documentId, passage.page, passage.ordinal, passage.text);
  }
}

export function getPassagesForDocument(documentId: string): Passage[] {
  const db = openDb();
  const rows = db
    .prepare("SELECT * FROM passages WHERE document_id = ? ORDER BY page, ordinal")
    .all(documentId) as Array<{
    id: string;
    document_id: string;
    page: number;
    ordinal: number;
    text: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    page: row.page,
    ordinal: row.ordinal,
    text: row.text,
  }));
}

// Only passages not yet consumed by a successful "Generate notions" run,
// so re-clicking generate on a large document (e.g. a 200-slide deck)
// continues where it left off instead of reprocessing the start every time.
export function getUngeneratedPassages(documentId: string): Passage[] {
  const db = openDb();
  const rows = db
    .prepare(
      "SELECT * FROM passages WHERE document_id = ? AND generated = 0 ORDER BY page, ordinal"
    )
    .all(documentId) as Array<{
    id: string;
    document_id: string;
    page: number;
    ordinal: number;
    text: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    page: row.page,
    ordinal: row.ordinal,
    text: row.text,
  }));
}

export function markPassagesGenerated(passageIds: string[]) {
  if (passageIds.length === 0) return;
  const db = openDb();
  const update = db.prepare("UPDATE passages SET generated = 1 WHERE id = ?");
  for (const id of passageIds) update.run(id);
}

export interface DocumentStats extends Document {
  passageCount: number;
  generatedPassageCount: number;
}

export function listDocumentsWithStats(): DocumentStats[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT d.*,
              COUNT(p.id) as passage_count,
              COALESCE(SUM(p.generated), 0) as generated_count
       FROM documents d
       LEFT JOIN passages p ON p.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    kind: DocumentKind;
    filename: string | null;
    page_count: number | null;
    passage_count: number;
    generated_count: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    filename: row.filename ?? undefined,
    pageCount: row.page_count ?? undefined,
    passageCount: row.passage_count,
    generatedPassageCount: row.generated_count,
  }));
}

export function deleteDocument(id: string) {
  const db = openDb();
  db.prepare("DELETE FROM generation_claims WHERE document_id=?").run(id);
  db.prepare("DELETE FROM page_analysis WHERE document_id=?").run(id);
  // passages and notion_sources both reference documents with ON DELETE
  // CASCADE: this removes the document's extracted passages and strips it
  // out of any notion's source list, without deleting the notions themselves.
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

export function getNotionById(id: string): Notion | null {
  const { notions } = getGraph();
  return notions.find((n) => n.id === id) ?? null;
}

export function deleteNotion(id: string) {
  const db = openDb();
  db.prepare("UPDATE pronunciation_cards SET notion_id=NULL WHERE notion_id=?").run(id);
  db.prepare("DELETE FROM notion_metadata WHERE notion_id=?").run(id);
  // notion_sources and links both reference notions with ON DELETE CASCADE,
  // so this also removes the notion's sources and every link touching it.
  db.prepare("DELETE FROM notions WHERE id = ?").run(id);
}

export function deleteLink(id: string) {
  const db = openDb();
  db.prepare("DELETE FROM links WHERE id = ?").run(id);
}

export function deletePronunciationCard(id: string) {
  const db = openDb();
  db.prepare("DELETE FROM pronunciation_cards WHERE id = ?").run(id);
}

export function deleteVocabularyCard(id: string) {
  const db = openDb();
  db.prepare("DELETE FROM vocabulary_cards WHERE id = ?").run(id);
}

// Folds `fromId` into `intoId`: its sources and links are reattached to
// `intoId`, then `fromId` is deleted. Used to clean up near-duplicate
// notions an LLM sometimes proposes (especially smaller local models).
export function mergeNotions(fromId: string, intoId: string) {
  const db = openDb();
  if (fromId === intoId) return;

  const fromSources = db
    .prepare("SELECT document_id, page FROM notion_sources WHERE notion_id = ?")
    .all(fromId) as Array<{ document_id: string; page: number }>;
  const insertSource = db.prepare(
    "INSERT INTO notion_sources (notion_id, document_id, page) VALUES (?, ?, ?)"
  );
  for (const s of fromSources) insertSource.run(intoId, s.document_id, s.page);

  db.prepare("UPDATE links SET source_id = ? WHERE source_id = ?").run(intoId, fromId);
  db.prepare("UPDATE links SET target_id = ? WHERE target_id = ?").run(intoId, fromId);

  // Drop self-loops and exact-duplicate links the redirect may have created.
  db.prepare("DELETE FROM links WHERE source_id = target_id AND source_id = ?").run(intoId);
  db.exec(`
    DELETE FROM links
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM links GROUP BY source_id, target_id, type
    )
  `);

  for(const c of getStudyCards().filter(c=>c.notionId===fromId)) {
    const updated={...c,notionId:intoId};db.prepare("UPDATE study_cards SET notion_id=?,payload=? WHERE id=?").run(intoId,JSON.stringify(updated),c.id);
  }
  const meta=getNotionMetadata(), from=meta[fromId], into=meta[intoId];
  if(from)db.prepare("INSERT INTO notion_metadata(notion_id,layer,evidence,user_edited,generation_version,source_notes) VALUES(?,?,?,?,?,?) ON CONFLICT(notion_id) DO UPDATE SET evidence=excluded.evidence,user_edited=excluded.user_edited,generation_version=excluded.generation_version,source_notes=excluded.source_notes").run(intoId,into?.layer ?? from.layer,JSON.stringify([...(into?.evidence ?? []),...from.evidence]),Number(Boolean(into?.userEdited || from.userEdited)),into?.generationVersion ?? from.generationVersion ?? null,JSON.stringify([...(into?.sourceNotes ?? []),...from.sourceNotes]));
  db.prepare("UPDATE pronunciation_cards SET notion_id=? WHERE notion_id=?").run(intoId,fromId);
  db.prepare("UPDATE mastery_signals SET notion_id=? WHERE notion_id=?").run(intoId,fromId);
  db.prepare("DELETE FROM notion_metadata WHERE notion_id=?").run(fromId);
  db.prepare("DELETE FROM notions WHERE id = ?").run(fromId);
}

// --- Spaced-repetition (Drill = notion cards, Connect = link cards) ---

export type CardType = "notion" | "link" | "pronunciation" | "vocabulary";

export interface DueNotion {
  teaching?:StudyCard['teaching'];
  cardId?: string;
  question?: string;
  evidence?: StudyCard["evidence"];
  notion: Notion;
  isNew: boolean;
}

export interface DueLink {
  cardId?: string;
  question?: string;
  evidence?: StudyCard["evidence"];
  link: Link;
  source: Notion;
  target: Notion;
  isNew: boolean;
}

function dueCardIds(db: DatabaseSync, cardType: CardType, allIds: string[], limit: number) {
  const stateRows = db
    .prepare("SELECT card_id, due_at FROM review_state WHERE card_type = ?")
    .all(cardType) as Array<{ card_id: string; due_at: string }>;
  const dueAtById = new Map(stateRows.map((r) => [r.card_id, r.due_at]));

  const now = new Date().toISOString();
  const due: Array<{ id: string; isNew: boolean }> = [];
  const fresh: Array<{ id: string; isNew: boolean }> = [];

  for (const id of allIds) {
    const dueAt = dueAtById.get(id);
    if (dueAt === undefined) fresh.push({ id, isNew: true });
    else if (dueAt <= now) due.push({ id, isNew: false });
  }

  const mastery = getMasteryMap(), studyCards=getStudyCards(),cardsById = new Map(studyCards.map(c => [c.id, c]));
  const weakness = (id: string) => {
    const card = cardsById.get(id);
    return card?.notionId ? mastery[card.notionId]?.dimensions?.[cardMasteryDimension(card.kind)].score ?? 0.55 : 0.55;
  };
  due.sort((a,b) => dueAtById.get(a.id)!.slice(0,10).localeCompare(dueAtById.get(b.id)!.slice(0,10)) || weakness(a.id)-weakness(b.id) || dueAtById.get(a.id)!.localeCompare(dueAtById.get(b.id)!));
  fresh.sort((a,b) => weakness(a.id)-weakness(b.id));
  const settings = getReviewSettings();
  const today = new Date(); today.setHours(0,0,0,0);
  const introduced = db.prepare("SELECT COUNT(*) n FROM (SELECT card_type,card_id,MIN(reviewed_at) first_at FROM review_log GROUP BY card_type,card_id) WHERE first_at>=?").get(today.toISOString()) as {n:number};
  const newBudget = Math.max(0, settings.newPerDay - introduced.n);
  // Allocate the shared new-card budget consistently across all decks.
  const eligible = [...studyCards.filter(c => c.status === "ready").map(c => ({type:c.cardType,id:c.id})),
    ...getAllPronunciationCards().map(c=>({type:"pronunciation",id:c.id})), ...getAllVocabularyCards().map(c=>({type:"vocabulary",id:c.id}))];
  const reviewed = new Set((db.prepare("SELECT card_type,card_id FROM review_state").all()).map(r=>`${r.card_type}:${r.card_id}`));
  const groups=["notion","link","pronunciation","vocabulary"].map(type=>eligible.filter(c=>c.type===type).sort((a,b)=>weakness(a.id)-weakness(b.id)));
  const fair=Array.from({length:Math.max(...groups.map(g=>g.length),0)},(_,i)=>groups.flatMap(g=>g[i]?[g[i]]:[])).flat();
  const allowedNew = new Set(fair.filter(c=>!reviewed.has(`${c.type}:${c.id}`)).slice(0,newBudget).map(c=>`${c.type}:${c.id}`));
  return [...due, ...fresh.filter(c=>allowedNew.has(`${cardType}:${c.id}`))].slice(0, Math.min(limit, settings.sessionLimit));

}

// Notions due for review today, plus every notion never studied before
// (brand new cards), capped to a reasonable session size. Weaker notions
// are surfaced first within whatever SRS already selected as due — SRS
// still owns WHAT qualifies and WHEN; this only reorders the session so a
// weak topic doesn't get buried behind ones already well in hand. A null
// (never-tested) mastery score sorts as neutral, not pushed to either end.
export function getDueNotions(limit = 100, mode:'qa'|'notions'='qa'): DueNotion[] {
  const db = openDb(); const { notions } = getGraph();
  const notionsById=new Map(notions.map(n=>[n.id,n]));
  const cards = getStudyCards().filter(c=>c.cardType === "notion" && c.status === "ready" && (mode==='qa'||c.kind==='definition'&&!c.presentation&&Boolean(c.notionId&&notionsById.has(c.notionId))));
  const byId = new Map(cards.map(c=>[c.id,c]));
  return dueCardIds(db,"notion",cards.map(c=>c.id),limit).flatMap(({id,isNew})=> {
    const c=byId.get(id)!; const n=c.notionId?notionsById.get(c.notionId):undefined;
    const notion: Notion = {...(n ?? {id:c.notionId ?? c.id,label:c.objective,domain:"Archived",status:"draft",definition:c.answer,sources:[]}), drillCard:{kind:c.kind,definition:c.answer,example:c.example,explanation:c.explanation,...(c.presentation?{presentation:c.presentation}:{})}};
    return [{notion,cardId:c.id,question:c.question,evidence:c.evidence,teaching:c.teaching,isNew}];
  });
}
export function getDueLinks(limit = 100): DueLink[] {
  const db=openDb(); const {notions,links}=getGraph();
  const notionsById=new Map(notions.map(n=>[n.id,n])),linksById=new Map(links.map(l=>[l.id,l]));
  const cards=getStudyCards().filter(c=>c.cardType === "link" && c.status === "ready");
  const byId=new Map(cards.map(c=>[c.id,c]));
  return dueCardIds(db,"link",cards.map(c=>c.id),limit).flatMap(({id,isNew})=> {
    const c=byId.get(id)!; const original=c.linkId?linksById.get(c.linkId):undefined;
    const placeholder: Notion={id:c.id,label:c.objective,domain:"Archived",status:"draft",definition:c.answer,sources:[]};
    const link: Link=original ? {...original,description:c.answer} : {id:c.linkId ?? c.id,source:c.id,target:c.id,type:"related",description:c.answer};
    return [{link,source:notionsById.get(link.source) ?? placeholder,target:notionsById.get(link.target) ?? placeholder,cardId:c.id,question:c.question,evidence:c.evidence,isNew}];
  });
}

export interface PronunciationWord {
  word: string;
  // Dictionary-style IPA with the stress mark included, e.g. "/kəmˈpjuːtər/".
  ipa: string;
  // Readable syllable breakdown with the stressed syllable capitalized,
  // e.g. "com-PU-ter" — mirrors how a learner would actually say it.
  syllables: string;
  // Whether this word carries the sentence's main emphasis (new/contrasting
  // content), secondary emphasis, or none — sentence stress depends on
  // meaning, not just word-level dictionary stress.
  sentenceStress: "primary" | "secondary" | "none";
  // One short line naming the rule applied, if any (e.g. "ends in -tion,
  // stress falls on the syllable just before it").
  note?: string;
  // True if, in natural connected speech, this word blends into the next
  // one (linking/liaison/elision — e.g. "let" + "me" -> "lemme"). Drawn as
  // a connecting arc in the UI so the blend is visually obvious.
  linksToNext?: boolean;
  // The blended, colloquial pronunciation of this word + the next one,
  // only set when linksToNext is true (e.g. "lemme", "wanna", "gonna").
  blendWithNext?: string;
}

export interface PronunciationCard {
  id: string;
  notionId?: string;
  sourceAttemptId?: string;
  text: string;
  words: PronunciationWord[];
  // One connected-speech IPA transcription of the whole sentence, as a
  // fluent speaker would actually say it (liaisons included) — distinct
  // from the per-word citation-form IPA in `words`.
  fullIpa?: string;
  createdAt: string;
}

export function insertPronunciationCard(
  card: Omit<PronunciationCard, "id" | "createdAt">
): PronunciationCard {
  const db = openDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO pronunciation_cards (id, notion_id, source_attempt_id, text, words, full_ipa)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    card.notionId ?? null,
    card.sourceAttemptId ?? null,
    card.text,
    JSON.stringify(card.words),
    card.fullIpa ?? ""
  );
  return { ...card, id, createdAt: new Date().toISOString() };
}

interface PronunciationCardRow {
  id: string;
  notion_id: string | null;
  source_attempt_id: string | null;
  text: string;
  words: string;
  full_ipa: string;
  created_at: string;
}

function rowToPronunciationCard(row: PronunciationCardRow): PronunciationCard {
  return {
    id: row.id,
    notionId: row.notion_id ?? undefined,
    sourceAttemptId: row.source_attempt_id ?? undefined,
    text: row.text,
    words: JSON.parse(row.words),
    fullIpa: row.full_ipa || undefined,
    createdAt: row.created_at,
  };
}

export function getPronunciationCardById(id: string): PronunciationCard | null {
  const db = openDb();
  const row = db.prepare("SELECT * FROM pronunciation_cards WHERE id = ?").get(id) as
    | PronunciationCardRow
    | undefined;
  return row ? rowToPronunciationCard(row) : null;
}

export function getAllPronunciationCards(): PronunciationCard[] {
  const db = openDb();
  const rows = db.prepare("SELECT * FROM pronunciation_cards").all() as unknown as PronunciationCardRow[];
  return rows.map(rowToPronunciationCard);
}

// Same due/new logic as notions and links (the Pronounce mode).
export function getDuePronunciationCards(limit = 20): Array<{ card: PronunciationCard; isNew: boolean }> {
  const db = openDb();
  const allRows = db.prepare("SELECT * FROM pronunciation_cards").all() as unknown as PronunciationCardRow[];
  const byId = new Map(allRows.map((r) => [r.id, r]));

  return dueCardIds(db, "pronunciation", allRows.map((r) => r.id), limit)
    .map(({ id, isNew }) => {
      const row = byId.get(id);
      return row ? { card: rowToPronunciationCard(row), isNew } : null;
    })
    .filter((d): d is { card: PronunciationCard; isNew: boolean } => Boolean(d));
}

export function getPronunciationCardCount(): number {
  const db = openDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM pronunciation_cards").get() as { count: number };
  return row.count;
}

// --- Vocabulary cards (Alt+2 capture) ---

export interface VocabularyCard {
  id: string;
  phrase: string;
  translationFr: string;
  example?: string;
  note?: string;
  context?: string;
  createdAt: string;
}

export function insertVocabularyCard(card: Omit<VocabularyCard, "id" | "createdAt">): VocabularyCard {
  const db = openDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO vocabulary_cards (id, phrase, translation_fr, example, note, context)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, card.phrase, card.translationFr, card.example ?? "", card.note ?? "", card.context ?? "");
  return { ...card, id, createdAt: new Date().toISOString() };
}

interface VocabularyCardRow {
  id: string;
  phrase: string;
  translation_fr: string;
  example: string;
  note: string;
  context: string;
  created_at: string;
}

function rowToVocabularyCard(row: VocabularyCardRow): VocabularyCard {
  return {
    id: row.id,
    phrase: row.phrase,
    translationFr: row.translation_fr,
    example: row.example || undefined,
    note: row.note || undefined,
    context: row.context || undefined,
    createdAt: row.created_at,
  };
}

export function getVocabularyCardById(id: string): VocabularyCard | null {
  const db = openDb();
  const row = db.prepare("SELECT * FROM vocabulary_cards WHERE id = ?").get(id) as
    | VocabularyCardRow
    | undefined;
  return row ? rowToVocabularyCard(row) : null;
}

export function getAllVocabularyCards(): VocabularyCard[] {
  const db = openDb();
  const rows = db.prepare("SELECT * FROM vocabulary_cards").all() as unknown as VocabularyCardRow[];
  return rows.map(rowToVocabularyCard);
}

export function getDueVocabularyCards(limit = 20): Array<{ card: VocabularyCard; isNew: boolean }> {
  const db = openDb();
  const allRows = db.prepare("SELECT * FROM vocabulary_cards").all() as unknown as VocabularyCardRow[];
  const byId = new Map(allRows.map((r) => [r.id, r]));

  return dueCardIds(db, "vocabulary", allRows.map((r) => r.id), limit)
    .map(({ id, isNew }) => {
      const row = byId.get(id);
      return row ? { card: rowToVocabularyCard(row), isNew } : null;
    })
    .filter((d): d is { card: VocabularyCard; isNew: boolean } => Boolean(d));
}

export function getVocabularyCardCount(): number {
  const db = openDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM vocabulary_cards").get() as { count: number };
  return row.count;
}

// Shared existence check for the polymorphic review routes (grade/reset/due-now).
export function cardExists(cardType: CardType, cardId: string): boolean {
  if (cardType === "pronunciation") return getPronunciationCardById(cardId) !== null;
  if (cardType === "vocabulary") return getVocabularyCardById(cardId) !== null;
  return getStudyCard(cardId)?.cardType===cardType;
}

// Deletes the underlying card itself (not just its schedule) — for a notion
// or link that means removing it from the graph entirely, since there's no
// separate "card" entity apart from the notion/link it drills. Also clears
// its review_state row, which would otherwise be orphaned.
export function deleteCard(cardType: CardType, cardId: string) {
  const db = openDb();
  db.prepare('DELETE FROM quality_settings WHERE key=?').run(`review-epoch:${cardType}:${cardId}`);
  db.prepare('DELETE FROM quality_settings WHERE key=?').run(`fsrs:${cardType}:${cardId}`);
  if (cardType === "notion" || cardType === "link") db.prepare("DELETE FROM study_cards WHERE id=? AND card_type=?").run(cardId,cardType);
  else if (cardType === "pronunciation") deletePronunciationCard(cardId);
  else deleteVocabularyCard(cardId);
  db.prepare("DELETE FROM review_state WHERE card_type = ? AND card_id = ?").run(cardType, cardId);
}

// --- Mock job interview sessions ---

export interface InterviewExchange {
  taskId?:string;
  learningDimension?: MasteryDimension;
  referenceAnswer?: string;
  sourceEvidence?: StudyCard['evidence'];
  unaided?: boolean;
  question: string;
  // Notions from the knowledge graph this question genuinely tests, if
  // any — most interview questions (behavioral, "tell me about a time...")
  // won't tag anything; only ones that actually probe course content do.
  // Feeds the SAME mastery signal store as Drill/Connect/Explain once the
  // answer is graded, and is what lets a weak topic surface in Interview
  // question selection later.
  relatedNotionIds?: string[];
  answer?: string;
  feedback?: string;
  correctedAnswer?: string;
  // 0-1, how well the candidate handled the question — distinct from
  // `feedback` (prose for the user to read); only meaningful when
  // relatedNotionIds is non-empty, since that's the only time it's used
  // (to write a mastery signal for those notions).
  score?: number;
  answeredAt?: string;
}

export interface InterviewSession {
  mode?: 'job' | 'course';
  id: string;
  jobTitle: string;
  jobDescription: string;
  cvText: string;
  coverLetter: string;
  durationMinutes: number;
  status: "in_progress" | "completed";
  exchanges: InterviewExchange[];
  summary?: string;
  startedAt: string;
  endedAt?: string;
}

export function insertInterviewSession(input: {
  jobTitle: string;
  jobDescription: string;
  cvText: string;
  coverLetter: string;
  durationMinutes: number;
  exchanges: InterviewExchange[];
}): InterviewSession {
  const db = openDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO interview_sessions (id, job_title, job_description, cv_text, cover_letter, duration_minutes, status, exchanges)
     VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?)`
  ).run(
    id,
    input.jobTitle,
    input.jobDescription,
    input.cvText,
    input.coverLetter,
    input.durationMinutes,
    JSON.stringify(input.exchanges)
  );
  return {
    id,
    mode: input.exchanges.some(e => e.learningDimension) ? 'course' : 'job',
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    cvText: input.cvText,
    coverLetter: input.coverLetter,
    durationMinutes: input.durationMinutes,
    status: "in_progress",
    exchanges: input.exchanges,
    startedAt: new Date().toISOString(),
  };
}

interface InterviewSessionRow {
  id: string;
  job_title: string;
  job_description: string;
  cv_text: string;
  cover_letter: string;
  duration_minutes: number;
  status: "in_progress" | "completed";
  exchanges: string;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
}

function rowToInterviewSession(row: InterviewSessionRow): InterviewSession {
  const exchanges = JSON.parse(row.exchanges) as InterviewExchange[];
  return {
    mode: exchanges.some(e => e.learningDimension) ? 'course' : 'job',
    id: row.id,
    jobTitle: row.job_title,
    jobDescription: row.job_description,
    cvText: row.cv_text,
    coverLetter: row.cover_letter,
    durationMinutes: row.duration_minutes,
    status: row.status,
    exchanges,
    summary: row.summary ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
  };
}

export function getInterviewSessionById(id: string): InterviewSession | null {
  const db = openDb();
  const row = db.prepare("SELECT * FROM interview_sessions WHERE id = ?").get(id) as
    | InterviewSessionRow
    | undefined;
  return row ? rowToInterviewSession(row) : null;
}

export function getAllInterviewSessions(): InterviewSession[] {
  const db = openDb();
  const rows = db
    .prepare("SELECT * FROM interview_sessions ORDER BY started_at DESC")
    .all() as unknown as InterviewSessionRow[];
  return rows.map(rowToInterviewSession);
}

export function updateInterviewExchanges(id: string, exchanges: InterviewExchange[]) {
  const db = openDb();
  db.prepare("UPDATE interview_sessions SET exchanges = ? WHERE id = ?").run(JSON.stringify(exchanges), id);
}

export function recordInterviewAnswer(sessionId: string, index: number, answer: string, feedback: {feedback: string; correctedAnswer: string; score: number}, unaided: boolean) {
  const db = openDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const session = getInterviewSessionById(sessionId);
    if (!session || session.status !== 'in_progress' || !session.exchanges[index]) throw new Error('Interview session is not available');
    const current = session.exchanges[index];
    if (current.answeredAt) {
      if (current.answer !== answer) throw new Error('This question has already been answered');
      db.exec('COMMIT'); return session.exchanges;
    }
    session.exchanges[index] = {...current, answer, ...feedback, unaided, answeredAt: new Date().toISOString()};
    updateInterviewExchanges(sessionId, session.exchanges);
    for (const notionId of new Set(current.relatedNotionIds ?? [])) {
      if (db.prepare('SELECT id FROM notions WHERE id=?').get(notionId)) recordMasterySignal(notionId, 'interview', feedback.score, current.learningDimension, unaided,current.learningDimension?learningTaskIdentity(notionId,current.learningDimension,current.question):current.taskId);
    }
    db.exec('COMMIT'); return session.exchanges;
  } catch (error) {db.exec('ROLLBACK'); throw error;}
}

export function completeInterviewSession(id: string, summary: string) {
  const db = openDb();
  db.prepare("UPDATE interview_sessions SET status = 'completed', summary = ?, ended_at = ? WHERE id = ?").run(
    summary,
    new Date().toISOString(),
    id
  );
}

export function getReviewState(cardType: CardType, cardId: string): ReviewState {
  const db = openDb();
  const row = db
    .prepare("SELECT interval_days, ease_factor, repetitions FROM review_state WHERE card_type = ? AND card_id = ?")
    .get(cardType, cardId) as { interval_days: number; ease_factor: number; repetitions: number } | undefined;
  const retention=getReviewSettings().retention;
  const weights=getFsrsWeights();
  if (!row) return {...INITIAL_REVIEW_STATE,retention,weights};
  const stored=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`fsrs:${cardType}:${cardId}`);
  const parsed=stored?JSON.parse(String(stored.value)):undefined;
  const last=db.prepare('SELECT last_reviewed_at FROM review_state WHERE card_type=? AND card_id=?').get(cardType,cardId);
  const epoch=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`review-epoch:${cardType}:${cardId}`);
  const epochAt=epoch?JSON.parse(String(epoch.value)).at:'';
  const matchingParameters=parsed?.parameterKey===fsrsParameterKey(weights)||parsed?.parameterKey===undefined&&fsrsParameterKey(weights)===fsrsParameterKey(FSRS_WEIGHTS);
  const memory=validFsrsMemory(parsed)&&parsed.lastReview===last?.last_reviewed_at&&matchingParameters?parsed:replayFsrs(db.prepare('SELECT grade,reviewed_at reviewedAt FROM review_log WHERE card_type=? AND card_id=? AND reviewed_at<=? AND reviewed_at>? ORDER BY reviewed_at,rowid').all(cardType,cardId,String(last?.last_reviewed_at??''),String(epochAt??'')) as Array<{grade:Grade;reviewedAt:string}>,retention,weights);
  return { intervalDays: row.interval_days, easeFactor: row.ease_factor, repetitions: row.repetitions,fsrs:memory,retention,weights };
}

export function gradeCard(
  cardType: CardType,
  cardId: string,
  grade: Grade,
  reviewedAt?: Date
): { intervalDays: number; dueAt: string } {
  const db = openDb();
  const current = getReviewState(cardType, cardId);
  const epoch=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`review-epoch:${cardType}:${cardId}`);
  const reviewTime=new Date(Math.max(reviewedAt?.getTime()??Date.now(),epoch?Date.parse(JSON.parse(String(epoch.value)).at)+1:0));
  const next = nextReviewState(current, grade,reviewTime);
  const dueAt = dueDateFrom(next.intervalDays,reviewTime);
  const now = reviewTime.toISOString();

  db.prepare(
    `INSERT INTO review_state (card_type, card_id, interval_days, ease_factor, repetitions, due_at, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_type, card_id) DO UPDATE SET
       interval_days = excluded.interval_days,
       ease_factor = excluded.ease_factor,
       repetitions = excluded.repetitions,
       due_at = excluded.due_at,
       last_reviewed_at = excluded.last_reviewed_at`
  ).run(cardType, cardId, next.intervalDays, next.easeFactor, next.repetitions, dueAt, now);
  db.prepare('INSERT INTO quality_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`fsrs:${cardType}:${cardId}`,JSON.stringify(next.fsrs));

  db.prepare("INSERT INTO review_log (id, card_type, card_id, grade, reviewed_at) VALUES (?, ?, ?, ?, ?)").run(
    randomUUID(),
    cardType,
    cardId,
    grade,
    now
  );

  // Mastery signal — separate from the SRS bookkeeping above. A Drill grade
  // feeds its own notion directly; a Connect grade tests the RELATIONSHIP
  // between two notions, so it feeds both ends.
  const masteryScore = gradeToScore(grade);
  if (cardType === "notion") {
    const card = getStudyCard(cardId);
    if (card?.notionId && db.prepare("SELECT id FROM notions WHERE id=?").get(card.notionId)) recordMasterySignal(card.notionId, "drill", masteryScore, cardMasteryDimension(card.kind),false,learningTaskIdentity(card.notionId,cardMasteryDimension(card.kind),card.question));
  } else if (cardType === "link") {
    const link = db.prepare("SELECT source_id, target_id FROM links WHERE id = ?").get(getStudyCard(cardId)?.linkId ?? cardId) as
      | { source_id: string; target_id: string }
      | undefined;
    if (link) {
      recordMasterySignal(link.source_id, "connect", masteryScore, 'relations');
      recordMasterySignal(link.target_id, "connect", masteryScore, 'relations');
    }
  }

  maybeUpdateStreak(db);

  return { intervalDays: next.intervalDays, dueAt };
}

// --- Mastery ---

export function recordMasterySignal(notionId: string, source: MasterySource, score: number, dimension?: MasteryDimension, unaided = false,taskId?:string) {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Mastery score must be finite and between zero and one');
  if (dimension !== undefined && !MASTERY_DIMENSIONS.includes(dimension)) throw new Error('Invalid mastery dimension');
  const db = openDb();
  if(taskId!==undefined&&(typeof taskId!=='string'||taskId.length>300))throw Error('Invalid mastery task');
  db.prepare("INSERT INTO mastery_signals (id, notion_id, source, score, created_at, dimension, unaided, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    notionId,
    source,
    score,
    new Date().toISOString(),
    dimension ?? null,
    Number(unaided),taskId??null
  );
  if (dimension && score < 0.55 && source !== 'drill' && source !== 'connect') {
    // A failed understanding task advances only already introduced, relevant
    // cards. It does not award XP, fabricate a review, or consume new-card slots.
    const earlier = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const relationIds=dimension==='relations'?new Set((db.prepare('SELECT id FROM links WHERE source_id=? OR target_id=?').all(notionId,notionId)).map(r=>String(r.id))):new Set<string>();
    for (const card of getStudyCards().filter(c => c.status === 'ready' && (c.notionId === notionId || !!c.linkId&&relationIds.has(c.linkId)) && cardMasteryDimension(c.kind) === dimension)) {
      db.prepare('UPDATE review_state SET due_at=? WHERE card_type=? AND card_id=? AND due_at>?').run(earlier, card.cardType, card.id, earlier);
    }
  }
}

const MASTERY_SIGNAL_WINDOW = 10;

export function getMasteryForNotion(notionId: string): MasteryInfo {
  return getMasteryMap()[notionId] ?? computeMasteryProfile([]);
}

// All notions in the current course at once — avoids N+1 queries when
// coloring the whole map. SQLite's window functions could do the "top 10
// per notion" trim in SQL, but course sizes here are small (tens to low
// hundreds of notions), so grouping in JS is simpler and plenty fast.
export function getMasteryMap(): Record<string, MasteryInfo> {
  const db = openDb();
  const rows = db
    .prepare("SELECT notion_id,score,dimension,source,unaided,task_id taskId FROM mastery_signals ORDER BY created_at DESC,rowid DESC")
    .all() as unknown as Array<MasterySignal & {notion_id: string}>;

  const byNotion = new Map<string, MasterySignal[]>();
  for (const row of rows) {
    const list = byNotion.get(row.notion_id) ?? [];
    if (list.filter(s => s.dimension === row.dimension).length < MASTERY_SIGNAL_WINDOW) list.push({...row, unaided: Boolean(row.unaided)});
    byNotion.set(row.notion_id, list);
  }

  const result: Record<string, MasteryInfo> = {};
  for (const [notionId, scores] of byNotion) {
    result[notionId] = computeMasteryProfile(scores);
  }
  return result;
}

// Bumps the daily streak the moment every due queue (notion/link/
// pronunciation/vocabulary) is empty — called after every grade, since
// that's the only point where clearing the day's queue can happen. A no-op
// once today is already recorded, so re-clearing mid-day doesn't double-count.
function maybeUpdateStreak(db: DatabaseSync) {
  const allClear =
    getDueNotions(1).length === 0 &&
    getDueLinks(1).length === 0 &&
    getDuePronunciationCards(1).length === 0 &&
    getDueVocabularyCards(1).length === 0;
  if (!allClear) return;

  const row = db
    .prepare("SELECT last_cleared_date, current_streak, longest_streak FROM app_progress WHERE id = 1")
    .get() as { last_cleared_date: string | null; current_streak: number; longest_streak: number };

  const today = calendarDay(new Date());
  if (row.last_cleared_date === today) return;

  const yesterday = calendarDay(new Date(Date.now()-86400000));
  const newStreak = row.last_cleared_date === yesterday ? row.current_streak + 1 : 1;
  const newLongest = Math.max(row.longest_streak, newStreak);

  db.prepare(
    "UPDATE app_progress SET last_cleared_date = ?, current_streak = ?, longest_streak = ? WHERE id = 1"
  ).run(today, newStreak, newLongest);
}

export interface ProgressStats extends LevelProgress {
  currentStreak: number;
  longestStreak: number;
}

export function getProgressStats(): ProgressStats {
  const db = openDb();
  const rows = db.prepare("SELECT grade, COUNT(*) as count FROM review_log GROUP BY grade").all() as Array<{
    grade: Grade;
    count: number;
  }>;
  let totalXp = 0;
  for (const r of rows) totalXp += xpForGrade(r.grade) * r.count;

  const row = db
    .prepare("SELECT current_streak, longest_streak FROM app_progress WHERE id = 1")
    .get() as { current_streak: number; longest_streak: number };

  return { ...levelFromXp(totalXp), currentStreak: row.current_streak, longestStreak: row.longest_streak };
}

// Clears a card's scheduling state (back to "new"), without touching its
// review_log history — the Anki-style "forget" action, exposed from Browse.
export function resetCardProgress(cardType: CardType, cardId: string) {
  const db = openDb();
  const last=db.prepare('SELECT MAX(reviewed_at) at FROM review_log WHERE card_type=? AND card_id=?').get(cardType,cardId);
  const at=new Date(Math.max(Date.now(),Date.parse(String(last?.at??''))||0)).toISOString();
  db.prepare('INSERT INTO quality_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`review-epoch:${cardType}:${cardId}`,JSON.stringify({at}));
  db.prepare("DELETE FROM review_state WHERE card_type = ? AND card_id = ?").run(cardType, cardId);
  db.prepare('DELETE FROM quality_settings WHERE key=?').run(`fsrs:${cardType}:${cardId}`);
}

// Pulls a scheduled-for-later card into today's queue by moving its due
// date to now, without resetting its interval/ease/repetitions — exposed
// from Browse as "review now". No-op (and harmless) if the card has no
// review_state row yet, since a never-studied card is already due.
export function makeCardDueNow(cardType: CardType, cardId: string) {
  const db = openDb();
  db.prepare("UPDATE review_state SET due_at = ? WHERE card_type = ? AND card_id = ?").run(
    new Date().toISOString(),
    cardType,
    cardId
  );
}

// --- Browse (full card list, Anki-style) ---

export interface BrowseCard {
  cardType: CardType;
  cardId: string;
  label: string;
  detail: string;
  studyCard?: StudyCard;
  isNew: boolean;
  intervalDays: number;
  dueAt: string | null;
  repetitions: number;
}

export function getAllCardsForBrowse(): BrowseCard[] {
  const db = openDb();
  const pronunciationCards = getAllPronunciationCards();
  const vocabularyCards = getAllVocabularyCards();

  const stateRows = db
    .prepare("SELECT card_type, card_id, interval_days, due_at, repetitions FROM review_state")
    .all() as Array<{ card_type: CardType; card_id: string; interval_days: number; due_at: string; repetitions: number }>;
  const stateByKey = new Map(stateRows.map((r) => [`${r.card_type}:${r.card_id}`, r]));

  const withState = (cardType: CardType, cardId: string) => {
    const s = stateByKey.get(`${cardType}:${cardId}`);
    return {
      isNew: !s,
      intervalDays: s?.interval_days ?? 0,
      dueAt: s?.due_at ?? null,
      repetitions: s?.repetitions ?? 0,
    };
  };

  const cards: BrowseCard[] = [];
  for (const c of getStudyCards()) {
    cards.push({cardType:c.cardType,cardId:c.id,label:c.question,detail:c.status,studyCard:c,...withState(c.cardType,c.id)});
  }
  for (const p of pronunciationCards) {
    const label = p.text.length > 70 ? `${p.text.slice(0, 70)}…` : p.text;
    cards.push({ cardType: "pronunciation", cardId: p.id, label, detail: "pronunciation", ...withState("pronunciation", p.id) });
  }
  for (const v of vocabularyCards) {
    cards.push({
      cardType: "vocabulary",
      cardId: v.id,
      label: v.phrase,
      detail: v.translationFr,
      ...withState("vocabulary", v.id),
    });
  }

  return cards;
}

function calendarDay(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}

// --- Progress dashboard ---

export const MATURE_THRESHOLD_DAYS = 21; // Anki's own definition of "mature"

export interface MaturityBuckets {
  new: number;
  young: number;
  mature: number;
}

// Anki-style maturity split for one card type ("notion" = Drill decks,
// "link" = Connect decks), counted against every card that currently
// exists (not just ones ever reviewed) so "new" is accurate.
export function getMaturityBuckets(cardType: CardType, totalCards: number): MaturityBuckets {
  const active=getAllCardsForBrowse().filter(c=>c.cardType===cardType && (!c.studyCard || c.studyCard.status==="ready"));
  const activeIds=new Set(active.map(c=>c.cardId));
  totalCards=active.length;
  const db = openDb();
  const rows = db
    .prepare("SELECT card_id,interval_days FROM review_state WHERE card_type = ?")
    .all(cardType) as Array<{ card_id:string;interval_days: number }>;

  let young = 0;
  let mature = 0;
  for (const row of rows) {
    if(!activeIds.has(row.card_id))continue;
    if (row.interval_days >= MATURE_THRESHOLD_DAYS) mature++;
    else young++;
  }
  const reviewed = young + mature;
  return { new: Math.max(totalCards - reviewed, 0), young, mature };
}

// Cards due per day for the next `days` days — the review forecast.
export function getForecast(days: number): Array<{ date: string; count: number }> {
  const db = openDb();
  const active=new Set(getAllCardsForBrowse().filter(c=>!c.studyCard || c.studyCard.status==="ready").map(c=>`${c.cardType}:${c.cardId}`));
  const rows = db.prepare("SELECT card_type,card_id,due_at FROM review_state").all() as Array<{card_type:string;card_id:string;due_at: string }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    if(!active.has(`${row.card_type}:${row.card_id}`))continue;
    const date = calendarDay(new Date(Math.max(Date.now(),new Date(row.due_at).getTime())));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const result: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const key = calendarDay(d);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

// Review activity per day for the last `days` days, from the full log —
// the GitHub-style heatmap.
export function getReviewHeatmap(days: number): Array<{ date: string; count: number }> {
  const db = openDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db
    .prepare("SELECT reviewed_at FROM review_log WHERE reviewed_at >= ?")
    .all(since.toISOString()) as Array<{ reviewed_at: string }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = calendarDay(new Date(row.reviewed_at));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const result: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = calendarDay(d);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

// Delayed recall only: Hard is a difficult successful recall, not forgetting.
// Initial exposure and repeated same-day learning do not measure retention.
export function getRetentionRate(): number | null {
  const db = openDb();
  const row = db.prepare(`WITH ordered AS (
    SELECT grade,reviewed_at,LAG(reviewed_at) OVER (
      PARTITION BY card_type,card_id ORDER BY reviewed_at,rowid) previous
    FROM review_log
  ) SELECT grade,COUNT(*) count FROM ordered
    WHERE julianday(reviewed_at)-julianday(previous)>=1 GROUP BY grade`).all() as Array<{
    grade: Grade;
    count: number;
  }>;
  const total = row.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return null;
  const good = row
    .filter((r) => r.grade !== "again")
    .reduce((sum, r) => sum + r.count, 0);
  return good / total;
}

// Per-domain share of notions that are "mature" — ties the dashboard back
// to the graph's own domain colors.
export function getDomainMastery(): Array<{ domain: string; total: number; mature: number }> {
  const { notions } = getGraph();
  const mastery=getMasteryMap();

  const byDomain = new Map<string, { total: number; mature: number }>();
  for (const n of notions.filter(n=>n.layer!=="organizer")) {
    const entry = byDomain.get(n.domain) ?? { total: 0, mature: 0 };
    entry.total++;
    if(mastery[n.id]?.level==='mastered')entry.mature++;
    byDomain.set(n.domain, entry);
  }
  return [...byDomain.entries()].map(([domain, v]) => ({ domain, ...v }));
}

export function getExplainLevelCounts(): Record<ExplainLevel, number> {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT level, COUNT(DISTINCT notion_id) as count
       FROM explain_attempts
       WHERE verdict = 'pass'
       GROUP BY level`
    )
    .all() as Array<{ level: ExplainLevel; count: number }>;
  const result: Record<ExplainLevel, number> = { child: 0, nonexpert: 0, expert: 0 };
  for (const row of rows) result[row.level] = row.count;
  return result;
}

// --- Explain mode ---

export interface ExplainAttempt {
  unaided?: boolean;
  id: string;
  notionId: string;
  level: ExplainLevel;
  answerText: string;
  verdict: "pass" | "retry";
  feedback: string;
  coveredKeywords: string[];
  missingKeywords: string[];
  // An idiomatic, corrected rewrite of the student's own answer — kept close
  // to their wording/length, fixing grammar and phrasing. Used as the source
  // text for the Pronounce mode so practice is tied to what they actually
  // tried to say, not a generic textbook sentence.
  correctedText?: string;
  // A fresh, complete model explanation at this level — written independent
  // of the student's own wording, for them to learn from by comparison.
  exampleAnswer?: string;
  createdAt: string;
}

export function recordExplainAttempt(
  attempt: Omit<ExplainAttempt, "id" | "createdAt">
): ExplainAttempt {
  const db = openDb();
  const id = randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
  db.prepare(
    `INSERT INTO explain_attempts
      (id, notion_id, level, answer_text, verdict, feedback, covered_keywords, missing_keywords, corrected_text, example_answer, unaided)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    attempt.notionId,
    attempt.level,
    attempt.answerText,
    attempt.verdict,
    attempt.feedback,
    JSON.stringify(attempt.coveredKeywords),
    JSON.stringify(attempt.missingKeywords),
    attempt.correctedText ?? null,
    attempt.exampleAnswer ?? null,
    Number(attempt.unaided === true)
  );
  recordMasterySignal(attempt.notionId, "explain", verdictToScore(attempt.verdict), 'reconstruction', attempt.unaided === true);
  db.exec('COMMIT');
  return { ...attempt, id, createdAt: new Date().toISOString() };
  } catch (error) {db.exec('ROLLBACK');throw error;}
}

// Latest attempt per level for this notion (so the UI can show what's
// already been passed without re-querying full history).
export function getLatestExplainAttempts(notionId: string): Partial<Record<ExplainLevel, ExplainAttempt>> {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT * FROM explain_attempts
       WHERE notion_id = ?
       ORDER BY created_at DESC`
    )
    .all(notionId) as unknown as ExplainAttemptRow[];

  const result: Partial<Record<ExplainLevel, ExplainAttempt>> = {};
  for (const row of rows) {
    if (result[row.level]) continue; // already have the latest (most recent) for this level
    result[row.level] = rowToExplainAttempt(row);
  }
  return result;
}

interface ExplainAttemptRow {
  unaided?: number;
  id: string;
  notion_id: string;
  level: ExplainLevel;
  answer_text: string;
  verdict: "pass" | "retry";
  feedback: string;
  covered_keywords: string;
  missing_keywords: string;
  corrected_text: string | null;
  example_answer: string | null;
  created_at: string;
}

function rowToExplainAttempt(row: ExplainAttemptRow): ExplainAttempt {
  return {
    unaided: Boolean(row.unaided),
    id: row.id,
    notionId: row.notion_id,
    level: row.level,
    answerText: row.answer_text,
    verdict: row.verdict,
    feedback: row.feedback,
    coveredKeywords: JSON.parse(row.covered_keywords),
    missingKeywords: JSON.parse(row.missing_keywords),
    correctedText: row.corrected_text ?? undefined,
    exampleAnswer: row.example_answer ?? undefined,
    createdAt: row.created_at,
  };
}

// Every attempt for one (notion, level) pair, oldest first — the full
// back-and-forth for the Explain tab's chat-style history, not just the
// latest one.
export function getExplainHistory(notionId: string, level: ExplainLevel): ExplainAttempt[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT * FROM explain_attempts
       WHERE notion_id = ? AND level = ?
       ORDER BY created_at ASC`
    )
    .all(notionId, level) as unknown as ExplainAttemptRow[];

  return rows.map(rowToExplainAttempt);
}

export function getExplainAttemptById(id: string): ExplainAttempt | null {
  const db = openDb();
  const row = db.prepare("SELECT * FROM explain_attempts WHERE id = ?").get(id) as
    | ExplainAttemptRow
    | undefined;
  return row ? rowToExplainAttempt(row) : null;
}

// The most recent attempts across every notion where a corrected rewrite
// exists and actually differs from what the student wrote — the raw
// material for the personal writing-pattern analysis (not notion-specific,
// since a recurring phrasing habit only shows up across many attempts).
export function getRecentExplainAttemptsWithCorrections(limit = 30): ExplainAttempt[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT * FROM explain_attempts
       WHERE corrected_text IS NOT NULL AND corrected_text != '' AND corrected_text != answer_text
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as unknown as ExplainAttemptRow[];
  return rows.map(rowToExplainAttempt);
}

// --- Export / Import (full backup & restore) ---

export interface Snapshot {
  version: 1;
  exportedAt: string;
  quality?: Record<string, unknown[]>;
  masterySignals?: Array<{id:string;notion_id:string;source:string;score:number;created_at:string;dimension?: MasteryDimension | null;unaided?: number;task_id?:string|null}>;
  progress?: {last_cleared_date:string|null;current_streak:number;longest_streak:number};
  documents: Array<
    Document & { pdfBase64?: string; passages: Array<{ page: number; ordinal: number; text: string; generated: boolean }> }
  >;
  notions: Notion[];
  links: Link[];
  mappingHiddenNotionIds?: string[];
  reviewState: Array<{
    cardType: CardType;
    cardId: string;
    intervalDays: number;
    easeFactor: number;
    repetitions: number;
    dueAt: string;
    lastReviewedAt: string | null;
  }>;
  reviewLog: Array<{ cardType: CardType; cardId: string; grade: Grade; reviewedAt: string }>;
  explainAttempts: ExplainAttempt[];
  pronunciationCards: PronunciationCard[];
  vocabularyCards: VocabularyCard[];
  interviewSessions: InterviewSession[];
}

export function exportSnapshot(): Snapshot {
  return withDatabaseSnapshot(readSnapshot);
}

// A WAL read transaction sees one database version across every table.
// File-backed backups request the write lock just while copying PDF bytes,
// so a concurrent reset cannot remove assets halfway through that copy.
export function withDatabaseSnapshot<T>(read:()=>T,lockFiles=false):T {
  const db=openDb(),owned=!db.isTransaction;
  if(owned)db.exec(lockFiles?'BEGIN IMMEDIATE':'BEGIN');
  try{const result=read();if(owned)db.exec('COMMIT');return result;}
  catch(error){if(owned&&db.isTransaction)db.exec('ROLLBACK');throw error;}
}

function readSnapshot(): Snapshot {
  const db = openDb();
  const { notions, links, documents } = getGraph();

  const passageRows = db.prepare("SELECT * FROM passages").all() as Array<{
    document_id: string;
    page: number;
    ordinal: number;
    text: string;
    generated: number;
  }>;
  const passagesByDoc = new Map<string, Snapshot["documents"][number]["passages"]>();
  for (const row of passageRows) {
    const list = passagesByDoc.get(row.document_id) ?? [];
    list.push({ page: row.page, ordinal: row.ordinal, text: row.text, generated: Boolean(row.generated) });
    passagesByDoc.set(row.document_id, list);
  }

  const reviewRows = db.prepare("SELECT * FROM review_state").all() as Array<{
    card_type: CardType;
    card_id: string;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    due_at: string;
    last_reviewed_at: string | null;
  }>;

  const logRows = db.prepare("SELECT * FROM review_log").all() as Array<{
    card_type: CardType;
    card_id: string;
    grade: Grade;
    reviewed_at: string;
  }>;

  const attemptRows = db.prepare("SELECT * FROM explain_attempts").all() as unknown as ExplainAttemptRow[];
  const pronunciationRows = db
    .prepare("SELECT * FROM pronunciation_cards")
    .all() as unknown as PronunciationCardRow[];
  const vocabularyRows = db.prepare("SELECT * FROM vocabulary_cards").all() as unknown as VocabularyCardRow[];
  const interviewRows = db
    .prepare("SELECT * FROM interview_sessions")
    .all() as unknown as InterviewSessionRow[];

  return {
    version: 1,
    quality: exportQuality(),
    masterySignals: db.prepare("SELECT * FROM mastery_signals").all() as unknown as NonNullable<Snapshot["masterySignals"]>,
    progress: db.prepare("SELECT last_cleared_date,current_streak,longest_streak FROM app_progress WHERE id=1").get() as unknown as Snapshot["progress"],
    exportedAt: new Date().toISOString(),
    documents: documents.map((d) => ({ ...d, passages: passagesByDoc.get(d.id) ?? [] })),
    notions,
    links,
    mappingHiddenNotionIds: (db.prepare("SELECT id FROM notions WHERE mapping_visible = 0").all() as Array<{ id: string }>).map((row) => row.id),
    reviewState: reviewRows.map((r) => ({
      cardType: r.card_type,
      cardId: r.card_id,
      intervalDays: r.interval_days,
      easeFactor: r.ease_factor,
      repetitions: r.repetitions,
      dueAt: r.due_at,
      lastReviewedAt: r.last_reviewed_at,
    })),
    reviewLog: logRows.map((r) => ({
      cardType: r.card_type,
      cardId: r.card_id,
      grade: r.grade,
      reviewedAt: r.reviewed_at,
    })),
    explainAttempts: attemptRows.map(rowToExplainAttempt),
    pronunciationCards: pronunciationRows.map(rowToPronunciationCard),
    vocabularyCards: vocabularyRows.map(rowToVocabularyCard),
    interviewSessions: interviewRows.map(rowToInterviewSession),
  };
}

// Wipes everything in the current course's database, leaving it completely
// empty (same tables import wipes, just without re-inserting anything) —
// the "Reset" action in the Backup panel.
export function clearMapping() {
  // Keep the underlying notions/links: they are also the Drill/Connect cards.
  const db = openDb();
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec("DELETE FROM generation_claims;");
    db.exec("DELETE FROM page_analysis;");
    db.exec("UPDATE notions SET mapping_visible = 0;");
    db.exec("UPDATE passages SET generated = 0;");
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function resetAllData() {
  const db = openDb();
  const owned=!db.isTransaction;
  if(owned)db.exec('BEGIN IMMEDIATE');
  try{
  clearQuality();
  db.exec("DELETE FROM notions;"); // cascades pronunciation_cards that have a notion_id set
  db.exec("DELETE FROM documents;");
  db.exec("DELETE FROM pronunciation_cards;"); // standalone ones (notion_id NULL) don't cascade from the above
  db.exec("DELETE FROM vocabulary_cards;");
  db.exec("DELETE FROM interview_sessions;");
  db.exec("DELETE FROM review_state;");
  db.exec("DELETE FROM review_log;");
  db.exec("UPDATE app_progress SET last_cleared_date=NULL,current_streak=0,longest_streak=0 WHERE id=1;");
  if(owned)db.exec('COMMIT');
  }catch(error){if(owned&&db.isTransaction)db.exec('ROLLBACK');throw error;}
}

// Clears every notion/link in the current course but keeps documents and
// their already-extracted passages, and flips every passage back to
// ungenerated — so "Generate notions" reprocesses the same source text
// from scratch under the CURRENT prompt, without re-uploading the PDFs.
// For when prompt/extraction-quality fixes landed after a course was
// already generated and the old output needs to be thrown away.
export function resetGraphForRegeneration() {
  clearMapping();
  openDb().exec("DELETE FROM page_analysis;");

}

// Wipes everything currently in the database and replaces it with the
// snapshot's content, preserving original ids so all cross-references
// (sources, links) stay intact. Destructive and intentionally so — this is
// a restore, not a merge.
export function importSnapshot(snapshot: Snapshot,assertCurrent?:()=>void) {
  for (const signal of snapshot.masterySignals ?? []) {
    if(signal.task_id!=null&&(typeof signal.task_id!=='string'||signal.task_id.length>300))throw Error('Invalid mastery task in backup');
    if (!signal || typeof signal.id !== 'string' || typeof signal.notion_id !== 'string' || !['drill','connect','explain','interview'].includes(signal.source) || !Number.isFinite(signal.score) || signal.score < 0 || signal.score > 1 || !Number.isFinite(new Date(signal.created_at).getTime()) || signal.dimension != null && !MASTERY_DIMENSIONS.includes(signal.dimension) || signal.unaided !== undefined && ![0,1].includes(signal.unaided)) throw new Error('Invalid mastery signal in backup');
  }
  const db = openDb();
  const owned=!db.isTransaction;
  db.exec(owned?'BEGIN IMMEDIATE':'SAVEPOINT snapshot_import');
  try {
  assertCurrent?.();
  clearQuality();

  db.exec("DELETE FROM notions;"); // cascades links, notion_sources, explain_attempts, pronunciation_cards linked to a notion
  db.exec("DELETE FROM documents;"); // cascades passages, remaining notion_sources
  db.exec("DELETE FROM pronunciation_cards;"); // standalone ones (notion_id NULL) don't cascade from the above
  db.exec("DELETE FROM vocabulary_cards;"); // standalone, no FK to notions
  db.exec("DELETE FROM interview_sessions;"); // standalone, no FK to notions
  db.exec("DELETE FROM review_state;"); // no FK (card_id may point to a notion, link, pronunciation, or vocabulary card)
  db.exec("DELETE FROM review_log;");

  const insertDoc = db.prepare(
    "INSERT INTO documents (id, title, kind, filename, page_count) VALUES (?, ?, ?, ?, ?)"
  );
  const insertPassage = db.prepare(
    "INSERT INTO passages (id, document_id, page, ordinal, text, generated) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const doc of snapshot.documents) {
    insertDoc.run(doc.id, doc.title, doc.kind, doc.filename ?? null, doc.pageCount ?? null);
    for (const p of doc.passages) {
      insertPassage.run(randomUUID(), doc.id, p.page, p.ordinal, p.text, p.generated ? 1 : 0);
    }
  }

  const insertNotionStmt = db.prepare(
    "INSERT INTO notions (id, label, domain, status, definition, explanation, grounding, work_questions, adept, go_further, drill_card, course_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertSource = db.prepare(
    "INSERT INTO notion_sources (notion_id, document_id, page) VALUES (?, ?, ?)"
  );
  for (const n of snapshot.notions) {
    insertNotionStmt.run(
      n.id,
      n.label,
      n.domain,
      n.status,
      n.definition,
      n.explanation ?? null,
      n.grounding ?? null,
      JSON.stringify(n.workQuestions ?? []),
      n.adept ? JSON.stringify(n.adept) : null,
      n.goFurther ? JSON.stringify(n.goFurther) : null,
      n.drillCard ? JSON.stringify(n.drillCard) : null,
      n.courseContext ?? null
    );
    for (const s of n.sources) insertSource.run(n.id, s.documentId, s.page);
  }

  const hideNotion = db.prepare("UPDATE notions SET mapping_visible = 0 WHERE id = ?");
  for (const id of snapshot.mappingHiddenNotionIds ?? []) hideNotion.run(id);

  const insertLinkStmt = db.prepare(
    "INSERT INTO links (id, source_id, target_id, type, description) VALUES (?, ?, ?, ?, ?)"
  );
  for (const l of snapshot.links) {
    insertLinkStmt.run(l.id, l.source, l.target, l.type, l.description ?? "");
  }

  const insertReview = db.prepare(
    `INSERT INTO review_state (card_type, card_id, interval_days, ease_factor, repetitions, due_at, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of snapshot.reviewState) {
    insertReview.run(r.cardType, r.cardId, r.intervalDays, r.easeFactor, r.repetitions, r.dueAt, r.lastReviewedAt);
  }

  const insertLog = db.prepare(
    "INSERT INTO review_log (id, card_type, card_id, grade, reviewed_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const r of snapshot.reviewLog ?? []) {
    insertLog.run(randomUUID(), r.cardType, r.cardId, r.grade, r.reviewedAt);
  }

  const insertAttempt = db.prepare(
    `INSERT INTO explain_attempts
      (id, notion_id, level, answer_text, verdict, feedback, covered_keywords, missing_keywords, corrected_text, example_answer, created_at, unaided)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const a of snapshot.explainAttempts) {
    insertAttempt.run(
      a.id,
      a.notionId,
      a.level,
      a.answerText,
      a.verdict,
      a.feedback,
      JSON.stringify(a.coveredKeywords),
      JSON.stringify(a.missingKeywords),
      a.correctedText ?? null,
      a.exampleAnswer ?? null,
      a.createdAt,
      Number(a.unaided === true)
    );
  }

  const insertPronunciation = db.prepare(
    `INSERT INTO pronunciation_cards (id, notion_id, source_attempt_id, text, words, full_ipa, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of snapshot.pronunciationCards ?? []) {
    insertPronunciation.run(
      p.id,
      p.notionId ?? null,
      p.sourceAttemptId ?? null,
      p.text,
      JSON.stringify(p.words),
      p.fullIpa ?? "",
      p.createdAt
    );
  }

  const insertVocabulary = db.prepare(
    `INSERT INTO vocabulary_cards (id, phrase, translation_fr, example, note, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const v of snapshot.vocabularyCards ?? []) {
    insertVocabulary.run(v.id, v.phrase, v.translationFr, v.example ?? "", v.note ?? "", v.context ?? "", v.createdAt);
  }

  const insertInterview = db.prepare(
    `INSERT INTO interview_sessions
      (id, job_title, job_description, cv_text, cover_letter, duration_minutes, status, exchanges, summary, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of snapshot.interviewSessions ?? []) {
    insertInterview.run(
      s.id,
      s.jobTitle,
      s.jobDescription,
      s.cvText,
      s.coverLetter ?? "",
      s.durationMinutes,
      s.status,
      JSON.stringify(s.exchanges),
      s.summary ?? null,
      s.startedAt,
      s.endedAt ?? null
    );
  }
  importQuality(snapshot.quality);
  for(const signal of snapshot.masterySignals ?? [])db.prepare("INSERT INTO mastery_signals(id,notion_id,source,score,created_at,dimension,unaided,task_id) VALUES(?,?,?,?,?,?,?,?)").run(signal.id,signal.notion_id,signal.source,signal.score,signal.created_at,signal.dimension ?? null,signal.unaided ?? 0,signal.task_id??null);
  const progress=snapshot.progress;
  db.prepare("UPDATE app_progress SET last_cleared_date=?,current_streak=?,longest_streak=? WHERE id=1").run(progress?.last_cleared_date ?? null,progress?.current_streak ?? 0,progress?.longest_streak ?? 0);
  db.exec(owned?'COMMIT':'RELEASE snapshot_import');
  } catch(error) {
    if(owned)db.exec('ROLLBACK');
    else db.exec('ROLLBACK TO snapshot_import; RELEASE snapshot_import');
    throw error;
  }
}

export type { GenerationMode };
