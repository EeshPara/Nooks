import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../server/store.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-revision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Identical timestamps cannot disambiguate commits; the revision must do so.
  const options = { seeded: false, clock: () => new Date('2026-10-01T00:00:00Z') };
  return { directory, options, store: new WorkspaceStore(directory, options) };
}

test('file revisions survive restart, normalize legacy reads and ignore mutation metadata', async t => {
  const { store, directory, options } = await fixture(t);
  const original = await store.read('alice');
  assert.equal(original.revision, 0);
  delete original.revision;
  await writeFile(store.file('alice'), JSON.stringify(original));
  assert.equal((await store.read('alice')).revision, 0);
  const first = await store.transact('alice', workspace => {
    workspace.revision = 9000;
    workspace.plan.tasks.push({ id: 'one', title: 'Review notes', done: false });
    return { workspace: { revision: -1 }, saved: true };
  });
  assert.equal(first.workspace.revision, 1);
  assert.equal(first.saved, true);
  assert.equal(first.workspace.plan.tasks.length, 1);
  const restarted = new WorkspaceStore(directory, options);
  assert.equal((await restarted.read('alice')).revision, 1);
  const second = await restarted.transact('alice', workspace => { workspace.revision = 0; return {}; });
  assert.equal(second.workspace.revision, 2);
  assert.equal(second.workspace.updatedAt, first.workspace.updatedAt);
  assert.equal((await restarted.read('bob')).revision, 0);
});

test('serialized concurrent commits get unique increasing revisions; failed mutations do not advance', async t => {
  const { store } = await fixture(t);
  const commits = await Promise.all(Array.from({ length: 8 }, (_, index) => store.transact('alice', workspace => {
    workspace.plan.tasks.push({ id: String(index), title: 'Review', done: false });
    return {};
  })));
  assert.deepEqual(commits.map(result => result.workspace.revision), [1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(store.transact('alice', workspace => { workspace.revision = 500; throw new Error('Rejected edit'); }), /Rejected edit/);
  const unchanged = await store.read('alice');
  assert.equal(unchanged.revision, 8);
  assert.equal(unchanged.plan.tasks.length, 8);
  assert.equal((await store.transact('alice', () => ({}))).workspace.revision, 9);
});

test('invalid persisted revisions fail closed instead of moving snapshots backwards', async t => {
  const { store } = await fixture(t);
  const value = await store.read('alice');
  for (const revision of [-1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
    await writeFile(store.file('alice'), JSON.stringify({ ...value, revision }));
    await assert.rejects(store.read('alice'), /corrupted workspace revision/);
  }
});
