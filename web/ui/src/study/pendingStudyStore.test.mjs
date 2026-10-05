import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./pendingStudyStore.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createPendingStudyStore, isPendingProgress } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const storage = () => { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
const result = { artifactId: 'cards', kind: 'flashcards', sessionId: 'session-one', score: 2, total: 3, xp: 20, durationSeconds: 30, cardRatings: { a: 'good', b: 'again', c: 'good' } };

test('pending results survive a browser reload only in the originating account', () => {
  const disk = storage();
  assert.equal(createPendingStudyStore('account:alice', 'results', disk, new Map()).retain(result.sessionId, result), true);
  const reload = createPendingStudyStore('account:alice', 'results', disk, new Map());
  assert.deepEqual(reload.get(result.sessionId), result);
  assert.deepEqual(createPendingStudyStore('account:bob', 'results', disk, new Map()).entries(), []);
  assert.deepEqual(createPendingStudyStore('device', 'results', disk, new Map()).entries(), []);
  reload.acknowledge(result.sessionId, result);
  assert.deepEqual(createPendingStudyStore('account:alice', 'results', disk, new Map()).entries(), []);
});
test('a late checkpoint acknowledgement cannot remove newer answers', () => {
  const pending = createPendingStudyStore('device', 'checkpoints', storage(), new Map());
  const previous = { answers: { 0: 'a' } }, newest = { answers: { 0: 'a', 1: 'b' } };
  pending.retain('quiz:1', previous); pending.retain('quiz:1', newest); pending.acknowledge('quiz:1', previous);
  assert.deepEqual(pending.get('quiz:1'), newest);
  pending.acknowledge('quiz:1', newest); assert.equal(pending.get('quiz:1'), undefined);
});
test('storage quota failure keeps the latest work in memory and leaves earlier disk recovery intact', () => {
  const disk = storage(), memory = new Map(), pending = createPendingStudyStore('device', 'results', disk, memory);
  pending.retain(result.sessionId, result);
  disk.setItem = () => { throw new Error('Quota'); };
  const newer = { ...result, sessionId: 'session-two' };
  assert.equal(pending.retain(newer.sessionId, newer), false);
  assert.deepEqual(createPendingStudyStore('device', 'results', disk, memory).get(newer.sessionId), newer);
  assert.deepEqual(createPendingStudyStore('device', 'results', disk, new Map()).get(result.sessionId), result);
});
test('native unverified host context never writes private answers to browser storage', () => {
  const disk = storage(), memory = new Map();
  createPendingStudyStore('host', 'results', disk, memory).retain(result.sessionId, result);
  assert.equal(disk.map.size, 0);
  assert.deepEqual(createPendingStudyStore('host', 'results', disk, memory).get(result.sessionId), result);
  assert.deepEqual(createPendingStudyStore('host', 'results', disk, new Map()).entries(), []);
});
test('corrupt recovery cannot be submitted as a completed practice session', () => {
  assert.equal(isPendingProgress(result), true);
  assert.equal(isPendingProgress({ ...result, artifactRevision: 9 }), true);
  for (const artifactRevision of [0, -1, '1', null, 1.5]) assert.equal(isPendingProgress({ ...result, artifactRevision }), false);
  for (const value of [null, {}, { ...result, score: 4 }, { ...result, total: 0 }, { ...result, kind: 'note' }]) assert.equal(isPendingProgress(value), false);
});
test('ordinary artifact IDs matching Object prototype names are safe to read and acknowledge', () => {
  const pending = createPendingStudyStore('device', 'editors', storage(), new Map());
  for (const id of ['toString', 'valueOf', '__proto__']) {
    assert.equal(pending.get(id), undefined); pending.acknowledge(id, undefined);
    const value = { id, title: 'My study set' }; pending.retain(id, value);
    assert.deepEqual(pending.get(id), value); pending.acknowledge(id, value); assert.equal(pending.get(id), undefined);
  }
});
test('oversized recovery is refused without evicting earlier pending work', () => {
  const pending = createPendingStudyStore('host', 'checkpoints', undefined, new Map());
  pending.retain('first', { answer: 'Keep this' });
  assert.equal(pending.retain('large', { answer: 'x'.repeat(2 * 1024 * 1024) }), false);
  assert.deepEqual(pending.get('first'), { answer: 'Keep this' }); assert.equal(pending.get('large'), undefined);
});
