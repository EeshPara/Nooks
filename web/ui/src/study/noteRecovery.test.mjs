import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(name) {
 const source = await readFile(new URL(name, import.meta.url), 'utf8');
 return import(`data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`);
}
const { createNoteRecovery: createRecovery } = await load('./noteRecovery.ts');
const createNoteRecovery = (scope, storage, retained = storage?.retained ?? new Map()) => createRecovery(scope, storage, retained);
const { createNoteAutosave } = await load('./noteAutosave.ts');
const note = (patch = {}) => ({ id: 'note-one', kind: 'note', title: 'Biology', content: 'Saved sentence.', subject: 'Biology', color: 'mint', revision: 1, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', ...patch });
const memory = () => { const values = new Map(); return { values, retained: new Map(), getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const save = value => Promise.resolve({ ...value, revision: (value.revision ?? 0) + 1 });

test('an out-of-band account change and reload recover only the original account draft', async () => {
 const storage = memory();
 const recovery = createNoteRecovery('account:alice', storage);
 const before = createNoteAutosave(note(), true, save, 50000);
 before.start(); before.update({ content: 'Unfinished thought before account switch.' });
 recovery.retain(before.snapshot()); before.stop();
 assert.equal(createNoteRecovery('account:bob', storage).get('note-one'), null);
 assert.equal(createNoteRecovery('device', storage).get('note-one'), null);
 const prior = createNoteRecovery('account:alice', storage).get('note-one');
 let saved;
 const after = createNoteAutosave(note(), true, value => { saved = value; return save(value); }, 50000);
 assert.equal(after.recover(prior.draft, prior.baseline, prior.persisted), true);
 assert.equal(after.snapshot().draft.content, 'Unfinished thought before account switch.');
 after.start(); assert.equal(await after.flush(), true); recovery.retain(after.snapshot()); after.stop();
 assert.equal(saved.content, prior.draft.content);
 assert.equal(saved.revision, 1);
 assert.equal(recovery.get('note-one'), null);
});
test('a newer server body blocks recovered writing until an explicit comparison decision', async () => {
 const original = note(); const recovery = createNoteRecovery('account:alice', memory());
 const before = createNoteAutosave(original, true, save); before.update({ content: 'Local unsaved edit' }); recovery.retain(before.snapshot());
 const prior = recovery.get(original.id); let calls = 0;
 const remote = note({ content: 'A different server edit', revision: 2 });
 const after = createNoteAutosave(remote, true, value => { calls++; return save(value); });
 after.recover(prior.draft, prior.baseline, prior.persisted); after.start();
 assert.equal(after.snapshot().phase, 'conflict'); assert.equal(await after.flush(), false); assert.equal(calls, 0);
 assert.equal(after.snapshot().draft.content, 'Local unsaved edit');
 after.resolve(remote, false); recovery.remove(original.id, prior.draft); assert.equal(after.snapshot().draft.content, 'A different server edit');
 recovery.retain(after.snapshot()); assert.equal(recovery.get(original.id), null); after.stop();
});
test('a clean newer server revision wins when it already contains the recovered writing', () => {
 const before = createNoteAutosave(note(), true, save); before.update({ content: 'Already committed' });
 const recovery = createNoteRecovery('device', memory()); recovery.retain(before.snapshot());
 const prior = recovery.get('note-one'); const after = createNoteAutosave(note({ content: 'Already committed', revision: 2 }), true, save);
 assert.equal(after.recover(prior.draft, prior.baseline, true), false); recovery.remove('note-one');
 assert.equal(after.snapshot().phase, 'saved'); assert.equal(after.snapshot().artifact.revision, 2); assert.equal(recovery.get('note-one'), null);
});
test('never-saved notes are discoverable without mixing account or device libraries', () => {
 const recovery = createNoteRecovery('device', memory());
 const draft = createNoteAutosave(note({ content: '', title: 'Untitled note', revision: undefined }), false, save);
 draft.update({ content: 'A new note that has never reached the library.' }); recovery.retain(draft.snapshot());
 const [entry] = recovery.list(); assert.equal(entry.persisted, false); assert.equal(entry.artifact.content, '');
 const reopened = createNoteAutosave(entry.artifact, false, save); const prior = recovery.get(entry.artifact.id);
 reopened.recover(prior.draft, prior.baseline, prior.persisted); assert.equal(reopened.snapshot().draft.content, 'A new note that has never reached the library.');
});
test('native/unknown scopes never persist private writing and oversized drafts are refused', () => {
 const storage = memory(); const draft = createNoteAutosave(note(), true, save); draft.update({ content: 'Private writing' });
 assert.equal(createNoteRecovery(undefined, storage).retain(draft.snapshot()), true); assert.equal(storage.values.size, 0);
 assert.equal(createNoteRecovery('host', storage).retain(draft.snapshot()), true); assert.equal(storage.values.size, 0);
 draft.update({ content: 'x'.repeat(300001) }); assert.equal(createNoteRecovery('device', storage).retain(draft.snapshot()), false); assert.equal(storage.values.size, 0);
});
test('quota failure retains the previous recovery and never deletes another unsaved note', () => {
 const storage = memory(); const recovery = createNoteRecovery('device', storage); const draft = createNoteAutosave(note(), true, save);
 draft.update({ content: 'Previous recovery' }); recovery.retain(draft.snapshot());
 storage.setItem = () => { throw new Error('Quota'); };
 draft.update({ content: 'Latest unsaved words' }); assert.equal(recovery.retain(draft.snapshot()), false);
 assert.equal(recovery.get('note-one').draft.content, 'Latest unsaved words');
 assert.match([...storage.values.values()][0], /Previous recovery/);
});
test('a failed save survives an interrupted editor remount when browser storage is blocked', async () => {
 const retained = new Map(); const recovery = createNoteRecovery('account:alice', undefined, retained);
 const before = createNoteAutosave(note(), true, async () => { throw new Error('Offline'); });
 before.start(); before.update({ content: 'My latest sentence in a blocked-storage browser.' });
 assert.equal(await before.flush(), false); assert.equal(recovery.retain(before.snapshot()), false); before.stop();
 assert.equal(createNoteRecovery('account:bob', undefined, retained).get('note-one'), null);
 const prior = createNoteRecovery('account:alice', undefined, retained).get('note-one');
 const after = createNoteAutosave(note(), true, save); after.recover(prior.draft, prior.baseline, prior.persisted);
 assert.equal(after.snapshot().draft.content, prior.draft.content); after.start(); assert.equal(await after.flush(), true);
 recovery.retain(after.snapshot()); assert.equal(recovery.get('note-one'), null); after.stop();
});
test('a late save acknowledgment cannot remove newer writing retained after reopening', async () => {
 const storage = memory(), oldRecovery = createNoteRecovery('account:alice', storage);
 let finish; const old = createNoteAutosave(note(), true, value => new Promise(resolve => { finish = () => resolve({ ...value, revision: 2 }); }));
 old.start(); old.update({ content: 'Older submission' }); const saving = old.flush(); oldRecovery.retain(old.snapshot());
 const nextRecovery = createNoteRecovery('account:alice', storage), newer = createNoteAutosave(note(), true, save);
 newer.update({ content: 'Newer writing while the old submission finishes' }); nextRecovery.retain(newer.snapshot());
 finish(); await saving; oldRecovery.retain(old.snapshot()); old.stop(); newer.stop();
 assert.equal(nextRecovery.get('note-one').draft.content, 'Newer writing while the old submission finishes');
});
