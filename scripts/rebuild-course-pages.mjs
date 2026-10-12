import { mkdir, writeFile } from 'node:fs/promises';

const [courseId, documentId, ...rawPages] = process.argv.slice(2);
const pages = [...new Set(rawPages.map(Number))];
if (!courseId || !documentId || !pages.length || pages.some(p => !Number.isInteger(p) || p < 1)) {
  throw Error('Usage: node scripts/rebuild-course-pages.mjs COURSE_ID DOCUMENT_ID PAGE ...');
}
const headers = { 'X-Course-Id': courseId, 'Content-Type': 'application/json' };
const base = 'http://127.0.0.1:3000';
const stamp = Date.now();
await mkdir('data/backups', { recursive: true });
await mkdir('.next', { recursive: true });
const backup = await fetch(`${base}/api/export`, { headers });
if (!backup.ok) throw Error(`Backup failed: ${backup.status}`);
const snapshot = await backup.text();
const saved = JSON.parse(snapshot);
const document = saved.documents.find(d => d.id === documentId);
if (!document || pages.some(p => p > document.pageCount)) throw Error('Document/page outside the requested course');
await writeFile(`data/backups/before-targeted-notes-${stamp}.json`, snapshot, 'utf8');
console.log(`Backed up course ${courseId}. Reprocessing only slides ${pages.join(', ')}.`);
const report = [];
for (const page of pages) {
  const reset = await fetch(`${base}/api/documents/${documentId}/quality`, {
    method: 'POST', headers, body: JSON.stringify({ pages: [page] }),
  });
  if (!reset.ok) throw Error(`Cannot reprocess slide ${page}: ${await reset.text()}`);
  console.log(`Generating slide ${page}...`);
  const response = await fetch(`${base}/api/documents/${documentId}/generate`, {
    method: 'POST', headers, body: JSON.stringify({ pages: [page], mode: 'strict', enrichment: false }),
    signal: AbortSignal.timeout(300000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? `Generation failed: ${response.status}`);
  const detail = await fetch(`${base}/api/documents/${documentId}/pages/${page}`, { headers }).then(r => r.json());
  report.push({ page, result, detail });
  await writeFile(`.next/course-notes-report-${stamp}.json`, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ page, status: detail.analysis?.status, concepts: detail.analysis?.concepts,
    readyCards: detail.analysis?.readyCards, missingObjectives: detail.analysis?.missingObjectives,
    warnings: result.warnings }));
}
console.log(`Report: .next/course-notes-report-${stamp}.json`);
