import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

await mkdir('.next', { recursive: true });
const directory = await mkdtemp(path.resolve('.next/test-study-session-'));
const source = await readFile('lib/studySession.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const file = path.join(directory, 'studySession.mjs');
await writeFile(file, outputText);
const { createStudyStore, restoreStudyQueue, studyCardKey } = await import(pathToFileURL(file).href);

const entries = new Map();
const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
const cards = [
  { notion: { id: 'n1' } }, { notion: { id: 'n2' } }, { notion: { id: 'n3' } },
];
const keys = new Set(['notion:n1', 'notion:n2', 'notion:n3']);
const initial = { cards, index: 0, revealed: false, sessionDone: false, reviewedCount: 0 };
const restore = (value) => restoreStudyQueue(value, keys);
const key = 'course-a:today:drill';
const store = createStudyStore(key, initial, storage, restore);
let notified = 0;
const unsubscribe = store.subscribe(() => notified++);
store.set((previous) => ({ ...previous, index: 1, revealed: true, reviewedCount: 1 }));
assert.equal(notified, 1);
assert.equal(JSON.parse(entries.get(key)).index, 1, 'Progress must be saved synchronously');
const resumed = createStudyStore(key, initial, storage, restore);
assert.deepEqual(resumed.getSnapshot(), store.getSnapshot(), 'Reload must resume position and revealed state');
assert.deepEqual(createStudyStore('course-b:today:drill', initial, storage, restore).getSnapshot(), initial, 'Courses must stay separate');
assert.deepEqual(createStudyStore('course-a:tomorrow:drill', initial, storage, restore).getSnapshot(), initial, 'A new day gets a fresh session');
assert.deepEqual(createStudyStore('course-a:today:connect', initial, storage, restore).getSnapshot(), initial, 'Tabs have independent sessions');
unsubscribe();
store.set((previous) => ({ ...previous, sessionDone: true }));
assert.equal(notified, 1);
assert.equal(createStudyStore(key, initial, storage, restore).getSnapshot().sessionDone, true);
const deleted = restoreStudyQueue({ ...initial, index: 1, revealed: true }, new Set(['notion:n1', 'notion:n3']));
assert.equal(deleted.index, 1);
assert.equal(deleted.cards[deleted.index].notion.id, 'n3');
assert.equal(deleted.revealed, false, 'A replacement card must not inherit the deleted card’s revealed state');
assert.equal(restoreStudyQueue(initial, new Set()), null, 'An obsolete queue must fall back to fresh server data');
assert.equal(restoreStudyQueue({ ...initial, index: 99 }, keys), null);
entries.set(key, '{broken');
assert.deepEqual(createStudyStore(key, initial, storage, restore).getSnapshot(), initial);
const blocked = createStudyStore(key, initial, { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } }, restore);
blocked.set({ ...initial, index: 2 });
assert.equal(blocked.getSnapshot().index, 2, 'Blocked storage must still allow in-memory progress');
assert.equal(studyCardKey({ kind: 'notion', notion: { id: 'n1' } }), 'notion:n1');
assert.equal(studyCardKey({ kind: 'link', link: { id: 'l1' } }), 'link:l1');
assert.equal(studyCardKey({ card: { id: 'p1', words: [] } }), 'pronunciation:p1');
assert.equal(studyCardKey({ card: { id: 'v1', phrase: 'risk' } }), 'vocabulary:v1');
assert.equal(studyCardKey(null), null);
for (const entry of [
  { kind: 'notion', notion: { id: 'n1' } },
  { link: { id: 'l1' } },
  { card: { id: 'p1', words: [] } },
  { card: { id: 'v1', phrase: 'risk' } },
]) {
  const cardKey = studyCardKey(entry);
  const queue = { ...initial, cards: [entry, entry], index: 1, reviewedCount: 1, revealed: true };
  const queueStore = createStudyStore(cardKey, queue, storage, (value) => restoreStudyQueue(value, new Set([cardKey])));
  queueStore.set(queue);
  assert.deepEqual(createStudyStore(cardKey, initial, storage, (value) => restoreStudyQueue(value, new Set([cardKey]))).getSnapshot(), queue);
}
console.log('PASS: synchronous saving, reload, course/tab/day isolation, finished sessions, deleted cards, invalid and blocked storage, all card types.');
