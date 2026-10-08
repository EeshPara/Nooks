import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./studyContentLoader.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createStudyContentLoader } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const origin = 'https://nooks.example', path = '/assets/study-content-Ab_123.js';

test('concurrent note/reference loads share one request and a rejected URL is never reused for retry', async () => {
  const urls = []; let rejectFirst;
  const result = { NoteWorkspace: 'note component', StudyReference: 'reference component' };
  const load = createStudyContentLoader(path, origin, false, url => {
    urls.push(url); return urls.length === 1 ? new Promise((_resolve, reject) => { rejectFirst = reject; }) : Promise.resolve(result);
  });
  const first = load(), concurrent = load(); assert.equal(first, concurrent);
  await Promise.resolve(); rejectFirst(new Error('503'));
  await assert.rejects(first, /503/); await assert.rejects(concurrent, /503/);
  assert.equal(await load(), result);
  assert.deepEqual(urls, [origin + path, origin + path + '?nooks_retry=1']);
  const cached = load(); assert.equal(await cached, result); assert.equal(load(), cached); assert.equal(urls.length, 2);
});

test('each failed retry gets a new module URL, including synchronous importer errors', async () => {
  const urls = [];
  const load = createStudyContentLoader(path, origin, false, url => { urls.push(url); throw new Error('offline'); });
  for (let i = 0; i < 3; i++) await assert.rejects(load(), /offline/);
  assert.deepEqual(urls, [origin + path, origin + path + '?nooks_retry=1', origin + path + '?nooks_retry=2']);
});

test('only the exact same-origin compiled study namespace can select executable code', () => {
  for (const url of ['https://other.example' + path, 'https://user:password@nooks.example' + path, path + '?nooks_retry=4', path + '?user=code', path + '#fragment', '/assets/other.js', '/assets/study-content-x.js/elsewhere', '/assets/study-content-%2e%2e.js', 'data:text/javascript,alert(1)', '/src/study/DeferredStudyContent.tsx']) {
    assert.throws(() => createStudyContentLoader(url, origin), /Unknown study module/);
  }
});

test('development enables only the known source module path and keeps the same retry rules', async () => {
  const urls = [];
  const load = createStudyContentLoader('/src/study/DeferredStudyContent.tsx', origin, true, async url => { urls.push(url); return {}; });
  await load(); assert.deepEqual(urls, [origin + '/src/study/DeferredStudyContent.tsx']);
  assert.throws(() => createStudyContentLoader('/src/untrusted.tsx', origin, true), /Unknown study module/);
});
