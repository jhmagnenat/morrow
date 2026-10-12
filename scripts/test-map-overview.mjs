import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = await mkdtemp(path.join(tmpdir(), 'map-overview-'));
const { outputText } = ts.transpileModule(await readFile('lib/mapOverview.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const file = path.join(dir, 'overview.mjs');
await writeFile(file, outputText);
const { mapOverview } = await import(pathToFileURL(file).href);
const notions = ['departments', 'actuaries', 'IT', 'RH', 'cycle-a', 'cycle-b', 'isolated'].map(id => ({ id }));
const link = (source, target, type = 'sub-notion') => ({ source, target, type });
const map = mapOverview(notions, [link('departments', 'actuaries'), link('departments', 'IT'), link('departments', 'RH'),
  link('departments', 'IT'), link('cycle-a', 'cycle-b'), link('cycle-b', 'cycle-a'),
  link('isolated', 'departments', 'prerequisite'), link('RH', 'absent'), link('IT', 'IT')]);
assert.deepEqual(map.children.get('departments'), ['actuaries', 'IT', 'RH']);
assert.ok(map.roots.includes('departments'), 'Prerequisites must not bury a theme');
assert.ok(map.roots.includes('isolated'));
assert.ok(map.roots.includes('cycle-a'), 'Disconnected cycles remain accessible');
assert.equal(map.children.has('RH'), false, 'Dangling links cannot create empty branches');
assert.deepEqual(mapOverview([], []).roots, []);
console.log('PASS: compact hierarchy, departments, deduplication, isolated topics, cycles and dangling links.');
