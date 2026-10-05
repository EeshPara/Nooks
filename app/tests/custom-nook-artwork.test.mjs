import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { NookCreator } from '../server/nook-creator.mjs';
import { createSitesIdentityResolver, sha256 } from '../server/supabase-auth.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
import { communityTools } from '../server/community-tools.mjs';

const OWNER = '00000000-0000-4000-8000-000000000001', MEMBER = '00000000-0000-4000-8000-000000000002';
const origin = 'https://nooks-test.supabase.co', serviceKey = 'sb_secret_custom_art_tests_only';
const bytes = Uint8Array.from(atob('iVBORw0KGgo='), char => char.charCodeAt(0));
const image = 'data:image/png;base64,iVBORw0KGgo=', hash = await sha256(bytes);
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);

/** Tests real creator/adapter/model-boundary code using the Storage/RPC wire
 * protocol. SQL authorization and lock semantics have independent real-PG tests. */
async function fixture() {
  const identity = async account => createSitesIdentityResolver({ url: origin, serviceKey, namespace: 'sites:custom-art-tests', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => Response.json({ id: account }) })({ subject: `synthetic-${account}` });
  const owner = await identity(OWNER), member = await identity(MEMBER), assets = new Map(), objects = new Map(), publications = new Map(), calls = [], faults = {};
  let workspace = null, revision = 0, created = 0;
  const failure = code => Response.json({ code }, { status: 400 });
  const transport = async (url, options) => {
    const address = new URL(url), route = address.pathname, body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    assert.equal(address.origin, origin); assert.equal(options.redirect, 'manual'); calls.push({ url: address, route, options, body });
    if (route.endsWith('/nooks_workspace_read')) { assert.equal(body.p_account, OWNER); return Response.json(workspace ? { workspace: structuredClone(workspace), revision } : null); }
    if (route.endsWith('/nooks_workspace_commit')) {
      assert.equal(body.p_account, OWNER);
      if (faults.failFinalization && body.p_workspace.nookCreator?.publicationIntents.some(intent => intent.status === 'published')) { faults.failFinalization = false; throw new Error('Synthetic finalization timeout'); }
      if (body.p_expected_revision !== revision) return Response.json({ committed: false, revision });
      workspace = structuredClone(body.p_workspace); revision++; return Response.json({ committed: true, revision });
    }
    if (route.endsWith('/nooks_artwork_reserve')) {
      assert.equal(body.p_account, OWNER);
      if (faults.quota) return failure('54000');
      let asset = [...assets.values()].find(asset => asset.requestId === body.p_request_id);
      if (!asset) { const generation = crypto.randomUUID(); asset = { account_id: OWNER, generation, content_hash: body.p_hash, mime: body.p_mime, path: `${OWNER}/${body.p_hash}/${generation}`, state: 'reserved', requestId: body.p_request_id, pinToken: crypto.randomUUID(), pinUntil: new Date(Date.now() + 900000).toISOString() }; assets.set(asset.path, asset); }
      return Response.json(asset);
    }
    if (route.endsWith('/nooks_artwork_complete')) {
      assert.equal(body.p_account, OWNER); const asset = assets.get(body.p_path); assert.equal(body.p_pin_token, asset.pinToken); assert.ok(objects.has(asset.path));
      asset.state = 'ready'; return Response.json({ accepted: true, state: 'ready' });
    }
    if (route === '/rest/v1/nooks_artwork_assets') {
      assert.equal(address.searchParams.get('account_id'), `eq.${OWNER}`); assert.equal(address.searchParams.get('limit'), '2');
      if (faults.assetRows) return Response.json(faults.assetRows);
      return Response.json([...assets.values()].filter(asset => `eq.${asset.generation}` === address.searchParams.get('generation')));
    }
    if (route.startsWith('/storage/v1/object/nooks-private/') && options.method === 'POST') {
      const path = route.slice('/storage/v1/object/nooks-private/'.length); assert.equal(options.headers['x-upsert'], 'false'); assert.equal(assets.get(path)?.state, 'reserved');
      if (faults.upload) throw new Error('Synthetic upload timeout');
      objects.set(path, new Uint8Array(options.body)); return Response.json({ Key: path });
    }
    if (route.startsWith('/storage/v1/object/authenticated/nooks-private/')) {
      if (faults.download) return faults.download();
      const path = route.slice('/storage/v1/object/authenticated/nooks-private/'.length);
      return new Response(objects.get(path) ?? null, { status: objects.has(path) ? 200 : 404 });
    }
    if (route.endsWith('/nooks_nook_publish_artwork')) {
      assert.equal(body.p_actor, OWNER); assert.deepEqual(Object.keys(body).sort(), ['p_actor', 'p_intent_id', 'p_snapshot_hash']);
      const intent = workspace.nookCreator.publicationIntents.find(intent => intent.id === body.p_intent_id); assert.ok(intent);
      assert.equal(intent.snapshotHash, body.p_snapshot_hash); assert.equal(await sha256(stable(intent.manifest)), intent.snapshotHash);
      if (faults.publishCode) return failure(faults.publishCode);
      let result = publications.get(intent.id);
      if (result?.archived) return failure('42501');
      const duplicate = !!result;
      if (!result) {
        const draft = workspace.nookCreator.drafts.find(draft => draft.id === intent.draftId);
        if (!draft || draft.revision !== intent.draftRevision) return failure('40001');
        const asset = assets.get(draft.space._storedBackground.path); assert.equal(asset.state, 'ready'); assert.equal(asset.generation, intent.manifest.scene.generation);
        const appearance = structuredClone(draft.space); delete appearance._storedBackground; delete appearance.backgroundImage;
        assert.deepEqual(intent.manifest.scene.appearance, appearance);
        const scene = { id: crypto.randomUUID(), snapshotHash: intent.snapshotHash, generation: asset.generation };
        result = { nook: { id: crypto.randomUUID(), title: intent.manifest.title, description: intent.manifest.description, roomId: 'custom', visibility: intent.manifest.visibility, scene: { id: scene.id, snapshotHash: scene.snapshotHash } }, scene, appearance, asset };
        publications.set(intent.id, result); created++;
        if (faults.timeoutAfterPublish) { faults.timeoutAfterPublish = false; throw new Error('Synthetic publication response timeout'); }
      }
      return Response.json({ nook: result.nook, scene: result.scene, duplicate });
    }
    if (route.endsWith('/nooks_nook_scene_read')) {
      if (faults.sceneCode) return failure(faults.sceneCode);
      if (faults.sceneResult) return Response.json(faults.sceneResult);
      const publication = [...publications.values()].find(value => value.nook.id === body.p_nook);
      if (!publication || publication.archived || publication.nook.visibility === 'private' && body.p_actor !== OWNER && !faults.memberJoined) return failure('42501');
      return Response.json({ nookId: body.p_nook, visibility: publication.nook.visibility, scene: { ...publication.scene, appearance: publication.appearance }, artwork: { accountId: OWNER, path: publication.asset.path, mime: publication.asset.mime, contentHash: publication.asset.content_hash } });
    }
    throw new Error(`Unexpected transport path: ${route}`);
  };
  const store = (user = owner) => new SupabaseStore({ url: origin, serviceKey, identity: user, fetchImpl: transport });
  const call = (name, args) => new NookCreator(store()).call(name, args, owner);
  const save = async () => (await call('nook_draft_save', { draft: { title: 'Rainy Bookshop', description: 'Study beside a rainy window.', artworkMode: 'upload', scenePrompt: 'Private original artwork prompt', space: { room: 'autumn-bookshop', theme: 'moonlight', backgroundImage: image } }, expectedRevision: 0 })).draft;
  const prepare = (draft, overrides = {}) => call('nook_publish_prepare', { draftId: draft.id, expectedRevision: draft.revision, requestId: crypto.randomUUID(), visibility: 'private', reviewed: true, ...overrides });
  const commit = publication => call('nook_publish_commit', { intentId: publication.id, confirmed: true });
  return { owner, member, store, call, save, prepare, commit, assets, objects, publications, calls, faults, workspace: () => workspace, created: () => created };
}

test('custom artwork review binds the exact owned ready generation and omits pixels/prompts/paths', async () => {
  const f = await fixture(), draft = await f.save(), uploads = f.objects.size, result = await f.prepare(draft, { visibility: 'public' });
  assert.equal(result.prepared, true); assert.equal(result.readiness.supportedAction, 'custom_publish');
  const manifest = result.publication.manifest, storedDraft = f.workspace().nookCreator.drafts[0];
  assert.equal(manifest.schemaVersion, 2); assert.equal(manifest.roomId, 'custom'); assert.equal(manifest.visibility, 'public');
  assert.equal(manifest.scene.generation, storedDraft.space._storedBackground.path.split('/')[2]);
  assert.equal(manifest.scene.appearance.name, draft.title); assert.equal(manifest.scene.appearance.tagline, draft.description);
  const serialized = JSON.stringify(manifest);
  for (const forbidden of ['data:image', 'scenePrompt', 'Private original artwork prompt', '_storedBackground', OWNER, '/storage/', 'communityArguments']) assert.equal(serialized.includes(forbidden), false);
  assert.equal(f.objects.size, uploads); assert.equal(f.created(), 0);
  const repeat = await f.prepare(draft, { visibility: 'public', requestId: result.publication.requestId });
  assert.equal(repeat.publication.id, result.publication.id); assert.equal(repeat.duplicate, true);
});

test('legacy artwork promotes through reserve/upload/complete and persists generation before publication', async () => {
  const f = await fixture(), draft = await f.save(), legacy = `${OWNER}/${hash}`;
  f.objects.set(legacy, bytes); f.workspace().nookCreator.drafts[0].space._storedBackground.path = legacy;
  const offset = f.calls.length, result = await f.prepare(draft);
  const path = f.workspace().nookCreator.drafts[0].space._storedBackground.path;
  assert.notEqual(path, legacy); assert.equal(path.split('/')[2], result.publication.manifest.scene.generation);
  assert.equal(f.assets.get(path).state, 'ready'); assert.equal(f.objects.has(legacy), true);
  assert.deepEqual(f.calls.slice(offset).filter(call => /nooks_artwork_(reserve|complete)$/.test(call.route)).map(call => call.route.split('/').at(-1)), ['nooks_artwork_reserve', 'nooks_artwork_complete']);
  assert.equal((await f.commit(result.publication)).nook.roomId, 'custom');
});

test('review fails closed for pending/deleting/foreign/missing generations without creating an intent', async () => {
  for (const kind of ['reserved', 'deleting', 'foreign', 'missing', 'mismatched-hash']) {
    const f = await fixture(), draft = await f.save(), asset = [...f.assets.values()][0];
    f.faults.assetRows = kind === 'missing' ? [] : [{ ...asset, ...(kind === 'foreign' ? { account_id: MEMBER } : kind === 'mismatched-hash' ? { content_hash: 'a'.repeat(64) } : { state: kind }) }];
    await assert.rejects(f.prepare(draft), { code: 'ARTWORK_CONFLICT' }); assert.equal(f.workspace().nookCreator.publicationIntents.length, 0);
  }
});

test('legacy promotion honors artwork quota and never discards original reference on failure', async () => {
  for (const fault of ['quota', 'upload']) {
    const f = await fixture(), draft = await f.save(), legacy = `${OWNER}/${hash}`;
    f.objects.set(legacy, bytes); f.workspace().nookCreator.drafts[0].space._storedBackground.path = legacy; f.faults[fault] = true;
    await assert.rejects(f.prepare(draft), fault === 'quota' ? { code: 'ARTWORK_LIMIT' } : /image could not be saved/);
    assert.equal(f.workspace().nookCreator.drafts[0].space._storedBackground.path, legacy); assert.equal(f.workspace().nookCreator.publicationIntents.length, 0);
  }
});

test('publication intent limit rejects legacy promotion before new reservations or uploads', async () => {
  const f = await fixture(), draft = await f.save(), legacy = `${OWNER}/${hash}`;
  f.objects.set(legacy, bytes); f.workspace().nookCreator.drafts[0].space._storedBackground.path = legacy;
  f.workspace().nookCreator.publicationIntents = Array.from({ length: 100 }, () => ({ id: crypto.randomUUID(), requestId: crypto.randomUUID(), status: 'published' }));
  const offset = f.calls.length;
  await assert.rejects(f.prepare(draft), { code: 'STORAGE_FULL' });
  assert.equal(f.calls.slice(offset).some(call => call.route.endsWith('/nooks_artwork_reserve') || call.options.method === 'POST' && call.route.includes('/storage/')), false);
});

test('custom publication creates one immutable community and repeats after draft editing/deletion', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft), first = await f.commit(prepared.publication);
  assert.equal(first.nook.roomId, 'custom'); assert.equal(first.nook.scene.snapshotHash, prepared.publication.snapshotHash);
  const changed = await f.call('nook_draft_save', { draft: { id: draft.id, title: 'Edited after publication' }, expectedRevision: draft.revision });
  await f.call('nook_draft_delete', { draftId: draft.id, expectedRevision: changed.draft.revision });
  const repeated = await f.commit(prepared.publication);
  assert.equal(repeated.nookId, first.nookId); assert.equal(repeated.nook.title, draft.title); assert.equal(repeated.duplicate, true); assert.equal(f.created(), 1);
});

test('ambiguous commit/finalization recovers authoritative receipt even after the source draft disappears', async () => {
  for (const fault of ['timeoutAfterPublish', 'failFinalization']) {
    const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft); f.faults[fault] = true;
    await assert.rejects(f.commit(prepared.publication), /timeout/);
    f.workspace().nookCreator.drafts = [];
    const recovered = await f.commit(prepared.publication);
    assert.equal(recovered.publication.status, 'published'); assert.equal(f.created(), 1);
    assert.equal(f.calls.filter(call => call.route.endsWith('nooks_nook_publish_artwork')).length, 2);
  }
});

test('stale drafts reject before publish and archived publication retries cannot revive a nook', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft);
  await f.call('nook_draft_save', { draft: { id: draft.id, title: 'New details' }, expectedRevision: draft.revision });
  await assert.rejects(f.commit(prepared.publication), { code: 'CONFLICT' }); assert.equal(f.created(), 0);
  const g = await fixture(), other = await g.save(), ready = await g.prepare(other); await g.commit(ready.publication);
  g.publications.get(ready.publication.id).archived = true;
  await assert.rejects(g.commit(ready.publication), { code: 'FORBIDDEN' }); assert.equal(g.created(), 1);
});

test('custom scene pixels are UI-only and include no Storage owner, path, hash locator or generation', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft, { visibility: 'public' }), published = await f.commit(prepared.publication);
  const result = await f.store(f.member).community('nook_scene_get', { nookId: published.nookId, accountId: OWNER });
  assert.equal(result.appearance.backgroundImage, image); assert.equal(result.recoveryScope, `account:${MEMBER}`); assert.deepEqual(result.scene, published.nook.scene);
  const safe = modelSafeResult({ structuredContent: result, content: [] });
  assert.deepEqual(safe.structuredContent, { nookId: published.nookId, scene: published.nook.scene }); assert.equal(safe._meta.notableData.appearance.backgroundImage, image);
  const serialized = JSON.stringify(result); for (const forbidden of [OWNER, hash, 'generation', 'storage/', '_storedBackground']) assert.equal(serialized.includes(forbidden), false);
  const publicationModel = modelSafeResult({ structuredContent: prepared, content: [] });
  assert.deepEqual(publicationModel.structuredContent.publication.manifest.scene, { customArtwork: true });
  assert.equal(JSON.stringify(publicationModel.structuredContent).includes('data:image'), false);
  assert.ok(f.calls.some(call => call.route.endsWith('nooks_nook_scene_read') && call.body.p_actor === MEMBER));
});

test('private scene reads reauthorize before cached pixels and reject former member/archive', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft), published = await f.commit(prepared.publication), store = f.store(f.member);
  const before = f.calls.filter(call => call.route.includes('/storage/')).length;
  await assert.rejects(store.community('nook_scene_get', { nookId: published.nookId }), { code: 'FORBIDDEN' });
  assert.equal(f.calls.filter(call => call.route.includes('/storage/')).length, before);
  f.faults.memberJoined = true; assert.equal((await store.community('nook_scene_get', { nookId: published.nookId })).appearance.backgroundImage, image);
  f.faults.memberJoined = false; await assert.rejects(store.community('nook_scene_get', { nookId: published.nookId }), { code: 'FORBIDDEN' });
  f.publications.get(prepared.publication.id).archived = true; await assert.rejects(f.store().community('nook_scene_get', { nookId: published.nookId }), { code: 'FORBIDDEN' });
});

test('scene read rejects URI/owner/hash/generation/appearance tampering before Storage access', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft), published = await f.commit(prepared.publication), value = f.publications.get(prepared.publication.id);
  const baseline = { nookId: published.nookId, scene: { ...value.scene, appearance: value.appearance }, artwork: { accountId: OWNER, path: value.asset.path, mime: value.asset.mime, contentHash: hash } };
  for (const mutate of [x => { x.nookId = crypto.randomUUID(); }, x => { x.artwork.path = 'https://attacker.invalid/image'; }, x => { x.artwork.accountId = MEMBER; }, x => { x.artwork.contentHash = 'a'.repeat(64); }, x => { x.scene.generation = crypto.randomUUID(); }, x => { x.scene.appearance.backgroundImage = image; }, x => { x.scene.appearance.room = 'https://attacker.invalid/'; }, x => { delete x.scene.appearance.theme; }]) {
    f.faults.sceneResult = structuredClone(baseline); mutate(f.faults.sceneResult); const offset = f.calls.length;
    await assert.rejects(f.store().community('nook_scene_get', { nookId: published.nookId }));
    assert.equal(f.calls.slice(offset).some(call => call.route.includes('/storage/')), false);
  }
});

test('scene download refuses redirects, incorrect hashes/MIME and oversized declared or streamed bytes', async () => {
  const f = await fixture(), draft = await f.save(), prepared = await f.prepare(draft), published = await f.commit(prepared.publication);
  let canceled = 0;
  for (const download of [() => new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }), () => new Response('wrong bytes'), () => new Response(bytes, { headers: { 'content-length': '1048577' } }), () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1048577)); }, cancel() { canceled++; } }))]) {
    f.faults.download = download; await assert.rejects(f.store().community('nook_scene_get', { nookId: published.nookId }));
  }
  assert.equal(canceled, 1);
  const value = f.publications.get(prepared.publication.id); value.asset.mime = 'image/jpeg'; f.faults.download = () => new Response(bytes);
  await assert.rejects(f.store().community('nook_scene_get', { nookId: published.nookId }), /bytes do not match/);
});

test('curated scene reads return a null appearance and scene tool is read-only with a UUID-only input', async () => {
  const f = await fixture(), nookId = crypto.randomUUID(); f.faults.sceneResult = { nookId, scene: null };
  assert.deepEqual(await f.store().community('nook_scene_get', { nookId }), { nookId, scene: null, appearance: null, recoveryScope: `account:${OWNER}` });
  for (const args of [{ nookId: '../../other' }, { nookId, path: `${OWNER}/${hash}` }, { nookId, generation: crypto.randomUUID() }]) await assert.rejects(f.store().community('nook_scene_get', args), { code: 'INVALID_INPUT' });
  const tool = communityTools.find(tool => tool.name === 'nook_scene_get'); assert.equal(tool.annotations.readOnlyHint, true); assert.deepEqual(Object.keys(tool.inputSchema.properties), ['nookId']);
  await assert.rejects(f.store().publishNookArtwork({ intentId: crypto.randomUUID(), snapshotHash: hash, actor: MEMBER }), { code: 'INVALID_INPUT' });
});

test('an unavailable saved image cannot be reviewed as a different fallback scene', async () => {
  const f = await fixture(), draft = await f.save(); f.faults.download = () => new Response(null, { status: 503 });
  const prepared = await f.prepare(draft); assert.equal(prepared.prepared, false); assert.ok(prepared.readiness.blockers.some(item => item.code === 'ARTWORK_UNAVAILABLE')); assert.equal(f.workspace().nookCreator.publicationIntents.length, 0);
});
