import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./noteAutosave.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createNoteAutosave, noteIsDirty } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const note = { id: 'note-one', title: 'Biology', kind: 'note', content: 'Original text', subject: 'Biology', color: 'sand', revision: 4, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
const pause = (milliseconds = 12) => new Promise(resolve => setTimeout(resolve, milliseconds));
const gate = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('debounce coalesces typing and blur flushes the latest text immediately', async () => {
  const calls = [];
  const queue = createNoteAutosave(note, true, async value => { calls.push(value); return { ...value, revision: value.revision + 1 }; }, 25);
  queue.start(); queue.update({ content: 'First' }); queue.update({ content: 'Latest' });
  await pause(5); assert.equal(calls.length, 0);
  assert.equal(await queue.flush(), true);
  assert.equal(calls.length, 1); assert.equal(calls[0].content, 'Latest'); assert.equal(queue.snapshot().artifact.revision, 5);
  await pause(35); assert.equal(calls.length, 1); queue.stop();
});

test('typing during an in-flight write is preserved and serialized against the returned revision', async () => {
  const pending = [gate(), gate()]; const calls = [];
  const queue = createNoteAutosave(note, true, value => { calls.push(value); return pending[calls.length - 1].promise; }, 5);
  queue.start(); queue.update({ content: 'First write' }); const complete = queue.flush();
  queue.update({ content: 'Typed while saving' }); await pause();
  assert.equal(calls.length, 1); assert.equal(queue.snapshot().draft.content, 'Typed while saving');
  // React may deliver the successful mutation's props before the Promise settles.
  queue.receive({ ...calls[0], revision: 5 }, true);
  pending[0].resolve({ ...calls[0], revision: 5 }); await pause();
  assert.equal(calls.length, 2); assert.equal(calls[1].revision, 5); assert.equal(calls[1].content, 'Typed while saving');
  assert.equal(queue.snapshot().draft.content, 'Typed while saving');
  pending[1].resolve({ ...calls[1], revision: 6 }); assert.equal(await complete, true);
  assert.equal(queue.snapshot().artifact.revision, 6); assert.equal(noteIsDirty(queue.snapshot()), false); queue.stop();
});

test('a failed save keeps the draft and pauses until an explicit retry', async () => {
  let count = 0;
  const queue = createNoteAutosave(note, true, async value => { if (++count === 1) throw new Error('Offline'); return { ...value, revision: 5 }; }, 5);
  queue.start(); queue.update({ content: 'Keep this text' }); assert.equal(await queue.flush(), false);
  queue.update({ title: 'Keep this too' }); await pause(25);
  assert.equal(count, 1); assert.equal(queue.snapshot().phase, 'error'); assert.equal(queue.snapshot().draft.content, 'Keep this text');
  assert.equal(await queue.retry(), true); assert.equal(count, 2); assert.equal(queue.snapshot().draft.title, 'Keep this too'); queue.stop();
});

test('revision conflicts never blindly retry and can only resume after explicit version review', async () => {
  const calls = [];
  const queue = createNoteAutosave(note, true, async value => { calls.push(value); if (value.revision === 4) throw new Error('This item changed after you opened it. Reload revision 5.'); return { ...value, revision: value.revision + 1 }; }, 5);
  queue.start(); queue.update({ content: 'My writing' }); await queue.flush();
  assert.equal(queue.snapshot().phase, 'conflict'); assert.equal(await queue.retry(), false);
  queue.update({ content: 'My later writing' }); await pause(20); assert.equal(calls.length, 1);
  const remote = { ...note, revision: 5, content: 'Someone else’s update' };
  assert.equal(queue.resolve(remote, true), true); await queue.flush();
  assert.equal(calls.length, 2); assert.equal(calls[1].revision, 5); assert.equal(calls[1].content, 'My later writing'); queue.stop();
});

test('workspace refreshes do not overwrite an unsaved draft and loading the reviewed version stops writes', async () => {
  let count = 0;
  const queue = createNoteAutosave(note, true, async value => { count++; return { ...value, revision: value.revision + 1 }; }, 5);
  queue.start(); queue.update({ content: 'Unsaved local' });
  const remote = { ...note, revision: 5, content: 'New saved text' };
  queue.receive(remote); assert.equal(queue.snapshot().phase, 'conflict'); assert.equal(queue.snapshot().draft.content, 'Unsaved local');
  queue.resolve(remote, false); await pause(20);
  assert.equal(queue.snapshot().draft.content, 'New saved text'); assert.equal(noteIsDirty(queue.snapshot()), false); assert.equal(count, 0); queue.stop();
});

test('empty new notes wait for real content and retain title changes without failed saves', async () => {
  const calls = [];
  const queue = createNoteAutosave({ ...note, content: '', revision: undefined }, false, async value => { calls.push(value); return { ...value, revision: 1 }; }, 5);
  queue.start(); queue.update({ title: 'An actual title' }); await pause(20); await queue.flush();
  assert.equal(calls.length, 0); assert.notEqual(queue.snapshot().phase, 'error');
  queue.update({ content: 'My first sentence.' }); await queue.flush();
  assert.equal(calls.length, 1); assert.equal(calls[0].title, 'An actual title'); assert.equal(queue.snapshot().persisted, true); queue.stop();
});

test('clearing a persisted note autosaves its empty body and advances the confirmed revision', async () => {
  const calls = [];
  const queue = createNoteAutosave(note, true, async value => { calls.push(value); return { ...value, revision: value.revision + 1 }; }, 5);
  queue.start(); queue.update({ content: '' }); await pause(25);
  assert.equal(calls.length, 1); assert.equal(calls[0].content, '');
  assert.equal(queue.snapshot().artifact.revision, 5); assert.equal(queue.snapshot().draft.content, '');
  assert.equal(queue.snapshot().phase, 'saved'); assert.equal(noteIsDirty(queue.snapshot()), false);
  assert.equal(await queue.flush(), true); queue.stop();
});

test('clearing a new note during its first save queues the empty edit against the returned revision', async () => {
  const pending = gate(); const calls = [];
  const queue = createNoteAutosave({ ...note, content: '', revision: undefined }, false, value => {
    calls.push(value);
    return calls.length === 1 ? pending.promise : Promise.resolve({ ...value, revision: value.revision + 1 });
  }, 5);
  queue.start(); queue.update({ content: 'First sentence' }); const done = queue.flush();
  queue.update({ content: '' });
  assert.equal(calls.length, 1); assert.equal(queue.snapshot().draft.content, '');
  pending.resolve({ ...calls[0], revision: 1 });
  assert.equal(await done, true); assert.equal(calls.length, 2);
  assert.equal(calls[1].content, ''); assert.equal(calls[1].revision, 1);
  assert.equal(queue.snapshot().artifact.revision, 2); assert.equal(queue.snapshot().phase, 'saved');
  assert.equal(noteIsDirty(queue.snapshot()), false); queue.stop();
});

test('an unconfirmed save response does not guess a revision or send newer writing', async () => {
  const pending = gate(); let count = 0;
  const queue = createNoteAutosave(note, true, () => { count++; return pending.promise; }, 5);
  queue.start(); queue.update({ content: 'First' }); const done = queue.flush(); queue.update({ content: 'Still typing' });
  pending.resolve(undefined); await done; await pause();
  assert.equal(count, 1); assert.equal(queue.snapshot().phase, 'error'); assert.equal(queue.snapshot().draft.content, 'Still typing'); queue.stop();
});

test('typing saves automatically after the debounce and stopping cancels queued work', async () => {
  const calls = [];
  const queue = createNoteAutosave(note, true, async value => { calls.push(value); return { ...value, revision: value.revision + 1 }; }, 5);
  queue.start(); queue.update({ content: 'Automatic write' }); await pause(25);
  assert.equal(calls.length, 1); assert.equal(queue.snapshot().phase, 'saved');
  queue.update({ content: 'Do not write after unmount' }); queue.stop(); await pause(25);
  assert.equal(calls.length, 1);
});

test('a newer remote edit arriving during a save prevents the next queued overwrite', async () => {
  const pending = gate(); let count = 0;
  const queue = createNoteAutosave(note, true, () => { count++; return pending.promise; }, 5);
  queue.start(); queue.update({ content: 'Submitted' }); const done = queue.flush(); queue.update({ content: 'More writing' });
  queue.receive({ ...note, revision: 6, content: 'Remote edit after our save' });
  pending.resolve({ ...note, revision: 5, content: 'Submitted' }); await done; await pause();
  assert.equal(count, 1); assert.equal(queue.snapshot().phase, 'conflict'); assert.equal(queue.snapshot().draft.content, 'More writing'); queue.stop();
});

test('a new populated note tolerates its first saved props arriving before the response settles', async () => {
  const pending = gate();
  const fresh = { ...note, revision: undefined };
  const queue = createNoteAutosave(fresh, false, () => pending.promise, 5);
  queue.start(); const done = queue.flush();
  queue.receive({ ...fresh, revision: 1 }, true); pending.resolve({ ...fresh, revision: 1 });
  assert.equal(await done, true); assert.equal(queue.snapshot().phase, 'saved'); queue.stop();
});
