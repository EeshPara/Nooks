import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./localWorkspaceState.ts', import.meta.url), 'utf8');
const { readLocalWorkspaceState: read, writeLocalWorkspaceState: write } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 })).toString('base64'));
test('unresolved native and separate accounts never read or migrate old device preferences', () => {
  const values = new Map([['nooks:profile:v1', 'PRIVATE_DEVICE_PROFILE'], ['nooks:drafts:v1', 'PRIVATE_DEVICE_DRAFT'], ['nooks:active-draft:v1', 'DEVICE_ID'], ['notable-last-opened', 'DEVICE_NOTE']]);
  const reads = [], writes = [];
  const storage = { getItem: key => { reads.push(key); return values.get(key) ?? null; }, setItem: (key, value) => { writes.push(key); values.set(key, value); } };
  for (const field of ['profile', 'drafts', 'active-draft', 'last-opened']) {
    assert.equal(read(undefined, field, storage), null); write(undefined, field, 'UNVERIFIED', storage);
    assert.equal(read('account:alice', field, storage), null);
    write('account:alice', field, `ALICE_${field}`, storage);
    assert.equal(read('account:bob', field, storage), null);
    assert.equal(read('account:alice', field, storage), `ALICE_${field}`);
  }
  assert.ok(reads.every(key => key.includes(':account:'))); assert.equal(writes.length, 4);
  assert.equal(read('device', 'profile', storage), 'PRIVATE_DEVICE_PROFILE');
  assert.equal(read('device', 'drafts', storage), 'PRIVATE_DEVICE_DRAFT');
});
test('unavailable preference storage cannot crash recovery', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(read('account:alice', 'profile', blocked), null);
  assert.doesNotThrow(() => write('account:alice', 'profile', 'Alice', blocked));
});
