import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../server/store.mjs';
import { NookCreator } from '../server/nook-creator.mjs';
import { listNookCreatorTools } from '../server/nook-creator-tools.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
const alice = { id: 'creator-alice', scopes: ['notable.read', 'notable.write'] }, bob = { id: 'creator-bob', scopes: ['notable.read', 'notable.write'] };
const draft = (fields = {}) => ({ id: crypto.randomUUID(), title: 'The chapter club', description: 'One small chapter at a time.', space: { room: 'rainy-library', theme: 'botanical' }, ...fields });
async function fixture(t, { community = true, timeoutAfterCreate = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-creator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false }), records = new Map(); let created = 0, calls = 0;
  if (community) store.community = async (action, args) => {
    assert.equal(action, 'create_nook'); calls++;
    if (!records.has(args.requestId)) { created++; records.set(args.requestId, { id: crypto.randomUUID(), ...args }); }
    if (timeoutAfterCreate && calls === 1) throw new Error('The connection timed out after creating the nook.');
    return { nook: structuredClone(records.get(args.requestId)) };
  };
  return { store, creator: new NookCreator(store), directory, records, created: () => created, calls: () => calls };
}
async function saved(creator, fields = {}) { return (await creator.call('nook_draft_save', { draft: draft(fields), expectedRevision: 0 }, alice)).draft; }
async function prepare(creator, value, options = {}) { return creator.call('nook_publish_prepare', { draftId: value.id, expectedRevision: value.revision, requestId: crypto.randomUUID(), visibility: 'private', reviewed: true, ...options }, alice); }

test('drafts require trusted account identity and stay isolated across accounts', async t => {
  const { creator } = await fixture(t); const value = await saved(creator);
  await assert.rejects(creator.call('nook_drafts_list', {}), { code: 'AUTH_REQUIRED' });
  await assert.rejects(creator.call('nook_draft_get', { draftId: value.id, userId: alice.id }, bob), { code: 'NOT_FOUND' });
  assert.deepEqual((await creator.call('nook_drafts_list', {}, bob)).drafts, []);
  await assert.rejects(creator.call('nook_draft_save', { draft: draft(), expectedRevision: 0 }, { ...alice, scopes: ['notable.read'] }), { code: 'INSUFFICIENT_SCOPE' });
});
test('private draft survives restart and stale edits preserve the newer version', async t => {
  const { creator, directory } = await fixture(t); const value = await saved(creator);
  assert.equal(value.visibility, 'private'); assert.equal(value.revision, 1);
  const next = await creator.call('nook_draft_save', { draft: { ...value, title: 'A second chapter' }, expectedRevision: 1 }, alice);
  await assert.rejects(creator.call('nook_draft_save', { draft: { ...value, title: 'Stale chapter' }, expectedRevision: 1 }, alice), { code: 'CONFLICT' });
  const reopened = await new NookCreator(new WorkspaceStore(directory, { seeded: false })).call('nook_draft_get', { draftId: value.id }, alice);
  assert.equal(reopened.draft.title, 'A second chapter'); assert.equal(next.draft.revision, 2);
});
test('renaming a curated draft keeps omitted appearance and private authoring fields', async t => {
  const { creator } = await fixture(t);
  const value = await saved(creator, { style: 'watercolor', scenePrompt: 'Keep this scene idea', space: { room: 'midnight-train', theme: 'sky', accent: '#8cbad1', companion: 'cat', layout: 'focused', decorations: ['stickers'] } });
  const { draft: renamed } = await creator.call('nook_draft_save', { draft: { id: value.id, title: 'New title' }, expectedRevision: value.revision }, alice);
  assert.deepEqual(renamed.space, { ...value.space, name: 'New title' });
  assert.equal(renamed.description, value.description); assert.equal(renamed.style, value.style); assert.equal(renamed.scenePrompt, value.scenePrompt); assert.equal(renamed.artworkMode, 'curated');
  await assert.rejects(creator.call('nook_draft_save', { draft: { id: value.id, title: 'Invalid partial edit', description: null }, expectedRevision: renamed.revision }, alice), { code: 'INVALID_INPUT' });
});
test('omitting artwork mode never discards a newly supplied image or an existing mixed-mode draft', async t => {
  const { creator } = await fixture(t), value = await saved(creator);
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const uploaded = await creator.call('nook_draft_save', { draft: { id: value.id, title: value.title, space: { backgroundImage: image } }, expectedRevision: value.revision }, alice);
  assert.equal(uploaded.draft.space.backgroundImage, image);
  const renamed = await creator.call('nook_draft_save', { draft: { id: value.id, title: 'Keep the selected image' }, expectedRevision: uploaded.draft.revision }, alice);
  assert.equal(renamed.draft.space.backgroundImage, image);
  const cleared = await creator.call('nook_draft_save', { draft: { id: value.id, title: value.title, artworkMode: 'curated' }, expectedRevision: renamed.draft.revision }, alice);
  assert.equal(cleared.draft.space.backgroundImage, undefined);
});
test('draft appearance, prompt, identifiers and unsupported reward paths validate before writing', async t => {
  const { creator } = await fixture(t);
  for (const fields of [{ space: [] }, { space: { theme: 'made-up' } }, { space: { backgroundImage: 'data:image/svg+xml;base64,abcd' } }, { space: { backgroundImage: 'data:image/png;base64,YmFk' } }, { scenePrompt: 'x'.repeat(2001) }, { id: '__proto__' }, { pathTemplate: 'unlimited-xp' }]) {
    await assert.rejects(creator.call('nook_draft_save', { draft: draft(fields), expectedRevision: 0 }, alice), { code: 'INVALID_INPUT' });
  }
  assert.equal((await creator.call('nook_drafts_list', {}, alice)).drafts.length, 0);
});
test('ChatGPT request without received image and uploaded custom image honestly block publication', async t => {
  const { creator, calls } = await fixture(t);
  const requested = await saved(creator, { artworkMode: 'chatgpt', scenePrompt: 'A moonlit reading room' });
  const preview = await creator.call('nook_draft_preview', { draftId: requested.id }, alice);
  assert.ok(preview.readiness.blockers.some(item => item.code === 'IMAGE_NOT_RECEIVED'));
  assert.equal((await prepare(creator, requested)).prepared, false);
  const uploaded = await saved(creator, { space: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' }, artworkMode: 'upload' });
  const result = await prepare(creator, uploaded);
  assert.equal(result.prepared, false); assert.equal(result.readiness.supportedAction, null); assert.equal(calls(), 0);
});
test('three-image draft budget prevents unbounded private blobs atomically', async t => {
  const { creator } = await fixture(t);
  for (let index = 0; index < 3; index++) await saved(creator, { space: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' } });
  await assert.rejects(saved(creator, { space: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' } }), { code: 'STORAGE_FULL' });
  assert.equal((await creator.call('nook_drafts_list', {}, alice)).drafts.length, 3);
});
test('prepare requires explicit review and audience and never creates a community', async t => {
  const { creator, calls } = await fixture(t); const value = await saved(creator);
  await assert.rejects(prepare(creator, value, { reviewed: false }), /Review/);
  await assert.rejects(prepare(creator, value, { visibility: undefined }), /choose private or public/);
  const result = await prepare(creator, value, { visibility: 'public' });
  assert.equal(result.publication.manifest.visibility, 'public'); assert.equal(result.publication.manifest.roomId, 'rainy-library');
  assert.equal(result.publication.status, 'prepared'); assert.equal(calls(), 0);
  assert.equal(result.publication.manifest.scenePrompt, undefined); assert.equal(result.publication.manifest.backgroundImage, undefined);
});
test('publication idempotency key cannot be reused with different reviewed details', async t => {
  const { creator } = await fixture(t); const value = await saved(creator), requestId = crypto.randomUUID();
  const first = await prepare(creator, value, { requestId });
  const same = await prepare(creator, value, { requestId });
  assert.equal(same.publication.id, first.publication.id); assert.equal(same.duplicate, true);
  await assert.rejects(prepare(creator, value, { requestId, visibility: 'public' }), { code: 'CONFLICT' });
});
test('draft changes after review prevent publishing a stale snapshot', async t => {
  const { creator, calls } = await fixture(t); const value = await saved(creator), prepared = await prepare(creator, value);
  await creator.call('nook_draft_save', { draft: { ...value, title: 'New chapter' }, expectedRevision: 1 }, alice);
  await assert.rejects(creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice), { code: 'CONFLICT' });
  assert.equal(calls(), 0);
});
test('explicit curated commit creates once and repeated commit returns saved publication', async t => {
  const { creator, created, calls } = await fixture(t), value = await saved(creator), prepared = await prepare(creator, value);
  await assert.rejects(creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: false }, alice), /explicitly confirms/);
  const first = await creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice);
  const repeated = await creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice);
  assert.equal(first.publication.status, 'published'); assert.equal(repeated.publication.nookId, first.nook.id); assert.equal(repeated.duplicate, true);
  assert.equal(repeated.nookId,first.nook.id);
  assert.equal(created(), 1); assert.equal(calls(), 1);
});
test('timeout after creation recovers SAME publication without creating a second nook', async t => {
  const { creator, created } = await fixture(t, { timeoutAfterCreate: true }), value = await saved(creator), prepared = await prepare(creator, value);
  await assert.rejects(creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice), /timed out/);
  await assert.rejects(creator.call('nook_draft_save', { draft: value, expectedRevision: value.revision }, alice), { code: 'CONFLICT' });
  const recovered = await creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice);
  assert.equal(recovered.publication.status, 'published'); assert.equal(created(), 1);
});
test('request collision cannot falsely mark unrelated community as published', async t => {
  const { creator, store } = await fixture(t), value = await saved(creator), prepared = await prepare(creator, value);
  store.community = async () => ({ nook: { id: crypto.randomUUID(), ...prepared.publication.manifest, title: 'Different community' } });
  await assert.rejects(creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice), { code: 'CONFLICT' });
  const publications = (await creator.call('nook_drafts_list', {}, alice)).publications;
  assert.equal(publications[0].status, 'failed'); assert.equal(publications[0].nookId, undefined);
  await assert.rejects(prepare(creator,value,{requestId:prepared.publication.requestId}),{code:'CONFLICT'});
});
test('local-only backend reports unavailable publication without discarding the private draft', async t => {
  const { creator } = await fixture(t, { community: false }), value = await saved(creator), prepared = await prepare(creator, value);
  await assert.rejects(creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice), { code: 'FEATURE_UNAVAILABLE' });
  assert.equal((await creator.call('nook_draft_get', { draftId: value.id }, alice)).draft.revision, 1);
});
test('discarding a draft never removes a previously published immutable record', async t => {
  const { creator } = await fixture(t), value = await saved(creator), prepared = await prepare(creator, value);
  const published = await creator.call('nook_publish_commit', { intentId: prepared.publication.id, confirmed: true }, alice);
  await creator.call('nook_draft_delete', { draftId: value.id, expectedRevision: 1 }, alice);
  const records = await creator.call('nook_drafts_list', {}, alice);
  assert.equal(records.drafts.length, 0); assert.equal(records.publications[0].nookId, published.nook.id);
});
test('tool metadata separates private drafting, review and open-world publication', () => {
  const tools = listNookCreatorTools({ oauthConfigured: true });
  assert.equal(tools.find(item => item.name === 'nook_publish_prepare').annotations.openWorldHint, false);
  assert.equal(tools.find(item => item.name === 'nook_publish_commit').annotations.openWorldHint, true);
  assert.equal(tools.find(item => item.name === 'nook_publish_commit').annotations.idempotentHint, true);
  assert.deepEqual(tools.find(item => item.name === 'nook_drafts_list').securitySchemes, [{ type: 'oauth2', scopes: ['notable.read'] }]);
});

test('simultaneous publish commits create one community and preserve the reviewed snapshot', async t=>{
 const {creator,created}=await fixture(t),value=await saved(creator),prepared=await prepare(creator,value);
 const [first,second]=await Promise.all([creator.call('nook_publish_commit',{intentId:prepared.publication.id,confirmed:true},alice),creator.call('nook_publish_commit',{intentId:prepared.publication.id,confirmed:true},alice)]);
 assert.equal(created(),1);assert.equal(first.publication.nookId,second.publication.nookId);assert.equal(first.publication.snapshotHash,prepared.publication.snapshotHash);assert.deepEqual(second.publication.manifest,prepared.publication.manifest);
});

test('failed finalization after successful community creation recovers through the same request',async t=>{
 const {creator,store,created}=await fixture(t),value=await saved(creator),prepared=await prepare(creator,value);
 const transact=store.transact.bind(store);let attempts=0;
 store.transact=async(...args)=>{attempts++;if(attempts===2)throw new Error('Storage temporarily unavailable during finalization.');return transact(...args);};
 await assert.rejects(creator.call('nook_publish_commit',{intentId:prepared.publication.id,confirmed:true},alice),/finalization/);
 store.transact=transact;
 const result=await creator.call('nook_publish_commit',{intentId:prepared.publication.id,confirmed:true},alice);
 assert.equal(result.publication.status,'published');assert.equal(created(),1);
});

test('draft artwork and scene prompts are UI-only metadata, not accumulated model context',async t=>{
 const {creator}=await fixture(t);const saved=await creator.call('nook_draft_save',{draft:draft({scenePrompt:'My private creative brief',space:{backgroundImage:'data:image/png;base64,iVBORw0KGgo='}}),expectedRevision:0},alice);
 const result=modelSafeResult({structuredContent:saved,content:[]});
 assert.equal(result.structuredContent.draft.scenePrompt,undefined);assert.equal(result.structuredContent.draft.space.backgroundImage,undefined);assert.equal(result.structuredContent.workspace.nookCreator,undefined);
 assert.equal(result._meta.notableData.draft.scenePrompt,'My private creative brief');assert.ok(result._meta.notableData.draft.space.backgroundImage.startsWith('data:image/png;'));
});
