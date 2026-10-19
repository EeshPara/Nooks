import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const autosaveUrl = url(compile('./noteAutosave.ts'));
const { protectDeferredNote, leaveDeferredNote } = await import(url(compile('./deferredNoteProtection.ts').replace("'./noteAutosave'", JSON.stringify(autosaveUrl))));
const { createNoteRecovery } = await import(url(compile('./noteRecovery.ts')));
const { createNoteAutosave } = await import(autosaveUrl);
const note = { id: 'manual-note', kind: 'note', title: 'Biology', subject: 'Biology', color: 'mint', content: 'Pasted source before the editor downloads.', createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z' };
function store() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('nonempty manual note is protected and recoverable before a pending or failed editor mounts', () => {
  const storage = store(), recovery = createNoteRecovery('device', storage, new Map());
  const protectedNote = protectDeferredNote(note, false, recovery);
  assert.deepEqual(protectedNote, { dirty: true, retained: true });
  let leaves = 0, confirmations = 0;
  leaveDeferredNote(protectedNote.dirty, () => { confirmations++; return false; }, () => leaves++);
  assert.equal(confirmations, 1); assert.equal(leaves, 0);
  assert.equal(createNoteRecovery('device', storage, new Map()).get(note.id).draft.content, note.content, 'reload can recover source even though the editor never mounted');
  leaveDeferredNote(protectedNote.dirty, () => true, () => leaves++);
  assert.equal(leaves, 1); assert.equal(recovery.get(note.id).draft.content, note.content);
});

test('existing recovered writing wins over an incoming saved baseline and remains owner-scoped', () => {
  const storage = store(), memory = new Map();
  const alice = createNoteRecovery('account:alice', storage, memory);
  const queue = createNoteAutosave(note, true, async () => {});
  queue.update({ content: 'Alice latest unsaved writing.' }); alice.retain(queue.snapshot());
  assert.deepEqual(protectDeferredNote(note, true, alice), { dirty: true, retained: true });
  assert.equal(alice.get(note.id).draft.content, 'Alice latest unsaved writing.');
  const bob = createNoteRecovery('account:bob', storage, memory);
  assert.deepEqual(protectDeferredNote(note, true, bob), { dirty: false, retained: true });
  assert.equal(bob.get(note.id), null);
});

test('blocked storage still guards navigation and reports that reload recovery could not be stored', () => {
  const recovery = createNoteRecovery('device', { getItem: () => null, setItem() { throw new Error('blocked'); }, removeItem() {} }, new Map());
  assert.deepEqual(protectDeferredNote(note, false, recovery), { dirty: true, retained: false });
  assert.equal(recovery.get(note.id).draft.content, note.content, 'in-document recovery still retains the material');
  assert.deepEqual(protectDeferredNote({ ...note, content: 'Older baseline' }, false, recovery), { dirty: true, retained: false }, 'an in-memory recovery entry does not falsely imply durable storage on remount');
  assert.equal(recovery.get(note.id).draft.content, note.content);
});

test('an empty untouched note and a saved note can leave without a discard confirmation', () => {
  for (const [artifact, saved] of [[{ ...note, content: '' }, false], [note, true]]) {
    const protection = protectDeferredNote(artifact, saved, createNoteRecovery('device', store(), new Map()));
    assert.equal(protection.dirty, false); let leaves = 0;
    leaveDeferredNote(protection.dirty, () => { throw new Error('Unexpected confirmation'); }, () => leaves++);
    assert.equal(leaves, 1);
  }
});
