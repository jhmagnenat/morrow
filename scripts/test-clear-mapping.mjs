import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real database module against a disposable database, never user data.
const root = process.cwd();
await mkdir(path.join(root, '.next'), { recursive: true });
const workspace = await mkdtemp(path.join(root, '.next', 'test-clear-mapping-'));
process.env.MORROW_DATA_DIR=path.join(workspace,'data');
for (const name of ['teachingCourse','teachingIntegrity','teachingStorage','pdfStorage','sourceSections','pdfLayout','sourceDocument', 'db', 'courses', 'courseScope', 'qualityDb', 'contentQuality', 'contentAccuracy', 'contentReview', 'reliabilityChecks', 'clair', 'dataDirectory', 'identityScope', 'auth', 'coursePedagogy', 'generationPolicy', 'srs', 'fsrs', 'xp', 'mastery','taskIdentity']) {
  const source = await readFile(path.join(root, 'lib', `${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  await writeFile(path.join(workspace, `${name}.mjs`), outputText.replace(/@\/lib\/([a-zA-Z]+)/g, './$1.mjs'));
}
process.chdir(workspace);
const db = await import(pathToFileURL(path.join(workspace, 'db.mjs')).href);
const courses = await import(pathToFileURL(path.join(workspace, 'courses.mjs')).href);
const quality = await import(pathToFileURL(path.join(workspace, 'qualityDb.mjs')).href);
const notion = (label) => db.insertNotion({ label, domain: 'Insurance', status: 'draft', definition: label, sources: [] });
const addCard=(entity,type)=>quality.saveStudyCard({id:entity.id,cardType:type,...(type==='notion'?{notionId:entity.id}:{linkId:entity.id}),question:'What does this insurance concept mean?',answer:'A complete definition of this insurance concept.',example:'',kind:'definition',status:'ready',evidence:[],objective:'Definition',warnings:[],userEdited:false,model:'fixture',promptVersion:'test'});
try {
  const a = notion('A');
  const b = notion('B');
  const link = db.insertLink({ source: a.id, target: b.id, type: 'prerequisite', description: 'A before B' });
  addCard(a,'notion');addCard(b,'notion');addCard(link,'link');
  db.insertPronunciationCard({ notionId: a.id, text: 'Insurance', words: [] });
  db.insertVocabularyCard({ phrase: 'risk', translationFr: 'risque' });
  db.gradeCard('notion', a.id, 'good');
  db.gradeCard('link', link.id, 'easy');
  const connection = db.openDb();
  connection.exec(`INSERT INTO documents (id, title, kind) VALUES ('document', 'Course PDF', 'pdf');
    INSERT INTO passages (id, document_id, page, ordinal, text, generated) VALUES ('passage', 'document', 1, 0, 'Source text', 1);`);
  const before = db.exportSnapshot();
  const cardsBefore = db.getAllCardsForBrowse();
  const masteryBefore = db.getMasteryMap();
  const other = courses.createCourse('Other course');
  courses.setActiveCourse(other.id);
  notion('Other course notion');
  courses.setActiveCourse('default');
  db.clearMapping();
  assert.equal(db.getGraph(true).notions.length, 0);
  assert.equal(db.getGraph(true).links.length, 0);
  assert.deepEqual(db.getAllCardsForBrowse(), cardsBefore);
  assert.deepEqual(db.getMasteryMap(), masteryBefore);
  const after = db.exportSnapshot();
  for (const key of ['notions', 'links', 'reviewState', 'reviewLog', 'pronunciationCards', 'vocabularyCards', 'explainAttempts']) {
    assert.deepEqual(after[key], before[key], `${key} must survive clearing the mapping`);
  }
  assert.equal(after.documents[0].passages[0].generated, false);
  assert.equal(after.documents[0].passages[0].text, 'Source text');
  db.importSnapshot(after);
  assert.equal(db.getGraph(true).notions.length, 0, 'Backup restore must preserve an empty map');
  assert.deepEqual(db.getAllCardsForBrowse(), cardsBefore);
  const fresh = notion('Fresh mapping');
  assert.deepEqual(db.getGraph(true).notions.map((n) => n.id), [fresh.id]);
  assert.equal(db.getAllCardsForBrowse().length, cardsBefore.length);
  db.clearMapping();
  db.clearMapping();
  assert.equal(db.getGraph(true).notions.length, 0, 'Repeated clearing is safe');
  const legacy = { ...before };
  delete legacy.mappingHiddenNotionIds;
  delete legacy.quality;
  db.importSnapshot(legacy);
  assert.equal(db.getGraph(true).notions.length, 2, 'Old backups remain compatible');
  courses.setActiveCourse(other.id);
  assert.equal(db.getGraph(true).notions[0].label, 'Other course notion');
  console.log('PASS: empty mapping, all cards and progress preserved, documents reusable, backup round trip, old backups, new mapping, course isolation.');
} finally {
  for (const connection of globalThis.__courseDbs?.values() ?? []) connection.close();
  process.chdir(root);
}
