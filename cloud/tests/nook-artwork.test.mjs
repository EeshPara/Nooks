import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../server/store.mjs';
import { NookCreator } from '../server/nook-creator.mjs';
import { artworkFingerprint, ARTWORK_REQUEST_TTL_MS, ARTWORK_RECEIPT_LIMIT } from '../server/nook-artwork.mjs';
import { listNookCreatorTools } from '../server/nook-creator-tools.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';

const alice = { id: 'artwork-alice', scopes: ['notable.read', 'notable.write'] };
const bob = { id: 'artwork-bob', scopes: ['notable.read', 'notable.write'] };
const png = 'data:image/png;base64,iVBORw0KGgo=';
const otherPng = 'data:image/png;base64,iVBORw0KGgoA';
const hostFile = (fields = {}) => ({ file_id: 'file-private-artwork-1', download_url: 'https://sdmntprwestus.oaiusercontent.com/files/image?sig=private-signed-token', mime_type: 'image/png', file_name: 'private-artwork.png', ...fields });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-artwork-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-04T12:00:00Z');
  const clock = () => new Date(now), store = new WorkspaceStore(directory, { seeded: false, clock });
  const creator = new NookCreator(store, { clock });
  const save = async (fields = {}, user = alice) => (await creator.call('nook_draft_save', { draft: { id: crypto.randomUUID(), title: 'Quiet reading room', scenePrompt: 'A moonlit bookshop with a sleeping cat', artworkMode: 'chatgpt', ...fields }, expectedRevision: 0 }, user)).draft;
  const request = (draft, requestId = crypto.randomUUID(), user = alice) => creator.call('nook_artwork_request', { draftId: draft.id, expectedRevision: draft.revision, requestId }, user);
  const receive = (draft, requestId, image = hostFile(), user = alice) => creator.call('nook_artwork_receive', { draftId: draft.id, requestId, image }, user);
  const complete = (draft, requestId, fields = {}, user = alice) => creator.call('nook_artwork_complete', { draftId: draft.id, requestId, fileId: hostFile().file_id, backgroundImage: png, ...fields }, user);
  const cancel = (draft, requestId, user = alice) => creator.call('nook_artwork_cancel', { draftId: draft.id, requestId }, user);
  const get = (draft, user = alice) => creator.call('nook_draft_get', { draftId: draft.id }, user);
  return { directory, clock, store, creator, save, request, receive, complete, cancel, get, advance: ms => { now += ms; } };
}

test('artwork requests issue fresh server IDs and recover a lost request response without changing draft revision', async t => {
  const f = await fixture(t), draft = await f.save(), key = crypto.randomUUID();
  const first = await f.request(draft, key), retry = await f.request(draft, key);
  assert.notEqual(first.requestId, key); assert.equal(first.requestId, first.artworkRequest.requestId);
  assert.equal(retry.requestId, first.requestId); assert.equal(retry.duplicate, true);
  assert.equal(first.draft.revision, draft.revision); assert.equal(first.draft.space.backgroundImage, undefined);
  assert.equal(Date.parse(first.artworkRequest.expiresAt) - Date.parse(first.artworkRequest.createdAt), ARTWORK_REQUEST_TTL_MS);
  assert.equal((await f.store.read(alice.id)).nookCreator.artworkReceipts.length, 1);
  await assert.rejects(f.receive(draft, key), { code: 'CONFLICT' });
  await assert.rejects(f.creator.call('nook_artwork_request', { draftId: draft.id, expectedRevision: 2, requestId: key }, alice), { code: 'CONFLICT' });
});

test('request requires a saved ChatGPT scene and does not accept a stale revision', async t => {
  const f = await fixture(t);
  for (const fields of [{ artworkMode: 'curated' }, { scenePrompt: '' }]) await assert.rejects(f.request(await f.save(fields)), { code: 'INVALID_INPUT' });
  const draft = await f.save();
  await f.creator.call('nook_draft_save', { draft: { id: draft.id, title: 'Renamed' }, expectedRevision: 1 }, alice);
  await assert.rejects(f.request(draft), { code: 'CONFLICT' });
});

test('all artwork operations require authenticated read and write scopes and exact owner/draft binding', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  const actions = [
    ['nook_artwork_request', { draftId: draft.id, expectedRevision: 1, requestId: crypto.randomUUID() }],
    ['nook_artwork_receive', { draftId: draft.id, requestId, image: hostFile() }],
    ['nook_artwork_complete', { draftId: draft.id, requestId, fileId: hostFile().file_id, backgroundImage: png }],
    ['nook_artwork_cancel', { draftId: draft.id, requestId }],
  ];
  for (const [name, args] of actions) {
    await assert.rejects(f.creator.call(name, args, null), { code: 'AUTH_REQUIRED' });
    for (const scopes of [[], ['notable.read'], ['notable.write']]) await assert.rejects(f.creator.call(name, args, { ...alice, scopes }), { code: 'INSUFFICIENT_SCOPE' });
    await assert.rejects(f.creator.call(name, args, bob), { code: 'NOT_FOUND' });
    await assert.rejects(f.creator.call(name, { ...args, ownerId: alice.id }, bob), { code: 'INVALID_INPUT' });
  }
  const ownBob = await f.save({ id: draft.id }, bob);
  await f.request(ownBob, crypto.randomUUID(), bob);
  await assert.rejects(f.receive(draft, requestId, hostFile(), bob), { code: 'CONFLICT' });
  assert.equal((await f.get(draft)).draft.artworkRequest.status, 'pending');
});

test('host file fields and complete inputs validate strictly before any storage transaction', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  let writes = 0; const transact = f.store.transact.bind(f.store);
  f.store.transact = (...args) => { writes++; return transact(...args); };
  for (const fields of [{ download_url: 'http://example.com/a' }, { download_url: 'javascript:alert(1)' }, { download_url: 'https://user:secret@example.com/a' }, { download_url: 'https://example.com/a#fragment' }, { download_url: 'https://example.com/' + 'a'.repeat(8192) }, { download_url: 'https://files.oaiusercontent.com:9443/image' }, { file_id: 'bad id' }, { file_id: '' }, { file_name: 'x'.repeat(256) }, { file_name: 'bad\nname' }, { mime_type: 'image/svg+xml' }, { owner: alice.id }]) await assert.rejects(f.receive(draft, requestId, hostFile(fields)), { code: 'INVALID_INPUT' });
  for (const hostname of ['sdmntprcentralus.oaiusercontent.com.attacker.example', 'files.oaiusercontent.com.attacker.example', 'unsupported.oaiusercontent.com', 'oaiusercontent.com', '127.0.0.1']) await assert.rejects(f.receive(draft, requestId, hostFile({ download_url: `https://${hostname}/image` })), { code: 'UNSUPPORTED_FILE_ORIGIN' });
  for (const image of [null, [], {}, { file_id: 'file-only' }]) await assert.rejects(f.receive(draft, requestId, image), { code: 'INVALID_INPUT' });
  for (const backgroundImage of ['', 'data:image/svg+xml;base64,abcd', 'data:image/png;base64,YmFk', png + 'A'.repeat(1048576)]) await assert.rejects(f.complete(draft, requestId, { backgroundImage }), { code: 'INVALID_INPUT' });
  await assert.rejects(f.creator.call('nook_artwork_cancel', { draftId: draft.id, requestId, reset: true }, alice), { code: 'INVALID_INPUT' });
  assert.equal(writes, 0);
});

test('unsupported artwork origins report only bounded host diagnostics and never retain private file data', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  const before = await f.store.read(alice.id);
  let writes = 0; const transact = f.store.transact.bind(f.store);
  f.store.transact = (...args) => { writes++; return transact(...args); };
  const secrets = { path: 'private-file-path', signature: 'private-download-signature', id: 'file-private-diagnostic', name: 'private-note-artwork.png' };
  for (const [hostname, expectedHost] of [['new-service.oaiusercontent.com', 'new-service.oaiusercontent.com'], ['[::1]', null], [`${'a'.repeat(64)}.${'b'.repeat(64)}.${'c'.repeat(64)}.${'d'.repeat(64)}.example`, null]]) {
    await assert.rejects(f.receive(draft, requestId, hostFile({ download_url: `https://${hostname}/${secrets.path}?sig=${secrets.signature}`, file_id: secrets.id, file_name: secrets.name })), error => {
      assert.equal(error.code, 'UNSUPPORTED_FILE_ORIGIN');
      assert.equal(error.message, `This host file download address is not supported yet${expectedHost ? ` (${expectedHost})` : ''}. The image has not been imported.`);
      for (const secret of Object.values(secrets)) assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
  await assert.rejects(f.receive(draft, requestId, hostFile({ download_url: `https://private-user:private-password@new-service.oaiusercontent.com/${secrets.path}?sig=${secrets.signature}` })), error => {
    assert.equal(error.code, 'INVALID_INPUT');
    for (const secret of ['private-user', 'private-password', ...Object.values(secrets), 'new-service.oaiusercontent.com']) assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(writes, 0);
  assert.deepEqual(await f.store.read(alice.id), before);
});

test('actual native central-US file origin receives without exposing the download capability', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  const result = await f.receive(draft, requestId, hostFile({ download_url: 'https://sdmntprcentralus.oaiusercontent.com/files/image?sig=private-central-token' }));
  assert.equal(result.artworkRequest.status, 'received');
  assert.equal(result.artworkRequest.file, undefined);
  assert.match((await f.get(draft)).draft.artworkRequest.file.downloadUrl, /^https:\/\/sdmntprcentralus\.oaiusercontent\.com\//);
});

test('receive stores only private bounded file metadata, refreshes the same file and rejects a different file', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  const first = await f.receive(draft, requestId);
  assert.equal(first.draft.revision, 1); assert.equal(first.draft.space.backgroundImage, undefined);
  assert.equal(first.draft.artworkRequest.file.fileId, hostFile().file_id);
  assert.equal(first.artworkRequest.file, undefined);
  const refreshed = await f.receive(draft, requestId, hostFile({ download_url: 'https://files.oaiusercontent.com/files/image?sig=refreshed' }));
  assert.equal(refreshed.duplicate, true); assert.equal(refreshed.artworkRequest.receivedAt, first.artworkRequest.receivedAt);
  assert.match(refreshed.draft.artworkRequest.file.downloadUrl, /refreshed$/);
  await assert.rejects(f.receive(draft, requestId, hostFile({ file_id: 'file-other' })), { code: 'CONFLICT' });
  const list = await f.creator.call('nook_drafts_list', {}, alice);
  assert.equal(list.drafts[0].artworkRequest.status, 'received'); assert.equal(list.drafts[0].artworkRequest.file, undefined);
  assert.equal((await new NookCreator(new WorkspaceStore(f.directory, { seeded: false }), { clock: f.clock }).call('nook_draft_get', { draftId: draft.id }, alice)).draft.artworkRequest.file.fileId, hostFile().file_id);
});

test('completion patches only artwork and preserves text edited while the image was generating', async t => {
  const f = await fixture(t), draft = await f.save(), before = await f.store.read(alice.id), { requestId } = await f.request(draft);
  await f.receive(draft, requestId);
  await f.creator.call('nook_draft_save', { draft: { id: draft.id, title: 'A newer title', description: 'My new description', space: { companion: 'cat' } }, expectedRevision: 1 }, alice);
  const result = await f.complete(draft, requestId);
  assert.equal(result.draft.revision, 3); assert.equal(result.draft.title, 'A newer title'); assert.equal(result.draft.description, 'My new description');
  assert.equal(result.draft.space.name, 'A newer title'); assert.equal(result.draft.space.companion, 'cat'); assert.equal(result.draft.space.backgroundImage, png);
  assert.equal(result.artworkRequest.status, 'completed'); assert.equal(result.draft.artworkRequest.file, undefined);
  const after = await f.store.read(alice.id);
  assert.deepEqual(after.space, before.space); assert.deepEqual(after.plan, before.plan); assert.deepEqual(after.nookCreator.publicationIntents, []);
  assert.equal(after.nookCreator.drafts[0].artworkRequest.file.downloadUrl, undefined);
  assert.equal(result.readiness.readyToPublish, false);
});

test('completion and cancellation have safe lost-response retries without repeated draft revisions', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  await f.receive(draft, requestId);
  const first = await f.complete(draft, requestId), retry = await f.complete(draft, requestId);
  assert.equal(retry.duplicate, true); assert.equal(retry.draft.revision, first.draft.revision);
  await assert.rejects(f.complete(draft, requestId, { backgroundImage: otherPng }), { code: 'CONFLICT' });
  await assert.rejects(f.complete(draft, requestId, { fileId: 'file-other' }), { code: 'CONFLICT' });
  await assert.rejects(f.receive(draft, requestId), { code: 'CONFLICT' });
  await assert.rejects(f.cancel(draft, requestId), { code: 'CONFLICT' });
  const next = await f.request(first.draft); await f.cancel(draft, next.requestId);
  assert.equal((await f.cancel(draft, next.requestId)).duplicate, true);
  await assert.rejects(f.receive(draft, next.requestId), { code: 'CONFLICT' });
  await assert.rejects(f.complete(draft, next.requestId), { code: 'CONFLICT' });
  assert.equal((await f.get(draft)).draft.space.backgroundImage, png);
});

test('superseded requests and deleted drafts reject late results', async t => {
  const f = await fixture(t), draft = await f.save(), key = crypto.randomUUID(), old = await f.request(draft, key), next = await f.request(draft);
  assert.notEqual(old.requestId, next.requestId);
  await assert.rejects(f.receive(draft, old.requestId), { code: 'CONFLICT' });
  await assert.rejects(f.request(draft, key), { code: 'CONFLICT' });
  await f.creator.call('nook_draft_delete', { draftId: draft.id, expectedRevision: 1 }, alice);
  await assert.rejects(f.receive(draft, next.requestId), { code: 'NOT_FOUND' });
  const recreated = await f.save({ id: draft.id });
  await assert.rejects(f.request(recreated, key), { code: 'CONFLICT' });
  assert.equal((await f.store.read(alice.id)).nookCreator.artworkReceipts.length, 2);
});

test('expiry hides signed metadata immediately and prunes it on the next successful creator write', async t => {
  const f = await fixture(t), draft = await f.save(), key = crypto.randomUUID(), { requestId } = await f.request(draft, key);
  await f.receive(draft, requestId); f.advance(ARTWORK_REQUEST_TTL_MS);
  const read = await f.get(draft);
  assert.equal(read.draft.artworkRequest.status, 'expired'); assert.equal(read.draft.artworkRequest.file, undefined);
  await assert.rejects(f.receive(draft, requestId), { code: 'ARTWORK_REQUEST_EXPIRED' });
  await assert.rejects(f.complete(draft, requestId), { code: 'ARTWORK_REQUEST_EXPIRED' });
  await f.save();
  const state = (await f.store.read(alice.id)).nookCreator;
  assert.equal(state.drafts[0].artworkRequest.file, undefined); assert.equal(state.artworkReceipts.length, 0);
  const next = await f.request(draft, key); assert.notEqual(next.requestId, requestId);
  await assert.rejects(f.receive(draft, requestId), { code: 'CONFLICT' });
});

test('artwork intent changes cancel active requests while unchanged echoed artwork and text edits preserve them', async t => {
  const f = await fixture(t);
  for (const change of [{ scenePrompt: 'A different room' }, { style: 'anime' }, { artworkMode: 'upload' }, { space: { room: 'midnight-train' } }, { space: { backgroundImage: otherPng } }, { space: { backgroundImage: '' } }]) {
    const draft = await f.save({ space: { backgroundImage: png } }), { requestId } = await f.request(draft);
    await f.receive(draft, requestId);
    const saved = await f.creator.call('nook_draft_save', { draft: { id: draft.id, title: draft.title, ...change }, expectedRevision: 1 }, alice);
    assert.equal(saved.draft.artworkRequest.status, 'canceled');
    await assert.rejects(f.complete(draft, requestId), { code: 'CONFLICT' });
    await f.creator.call('nook_draft_delete', { draftId: draft.id, expectedRevision: 2 }, alice);
  }
  const draft = await f.save({ space: { backgroundImage: png } }), { requestId } = await f.request(draft);
  const renamed = await f.creator.call('nook_draft_save', { draft: { ...draft, title: 'Same image', space: { ...draft.space, backgroundImage: png } }, expectedRevision: 1 }, alice);
  assert.equal(renamed.draft.artworkRequest.requestId, requestId); assert.equal(renamed.draft.artworkRequest.status, 'pending');
  await f.receive(draft, requestId); assert.equal((await f.complete(draft, requestId)).draft.revision, 3);
});

test('artwork fingerprint remains stable when private storage hydration replaces the same image bytes', async () => {
  const bytes = Buffer.from(png.split(',')[1], 'base64'), digest = createHash('sha256').update(bytes).digest('hex');
  const base = { artworkMode: 'chatgpt', style: 'illustration', scenePrompt: 'A room', space: { room: 'rainy-library', backgroundImage: png } };
  const stored = { ...base, title: 'A different title', space: { room: 'rainy-library', _storedBackground: { path: `owner/${digest}/${crypto.randomUUID()}`, mime: 'image/png' } } };
  assert.equal(await artworkFingerprint(base), await artworkFingerprint(stored));
});

test('simultaneous completion retries serialize and only increment the draft once', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft);
  await f.receive(draft, requestId);
  const results = await Promise.all([f.complete(draft, requestId), f.complete(draft, requestId)]);
  assert.deepEqual(results.map(value => value.draft.revision), [2, 2]); assert.equal(results.filter(value => value.duplicate).length, 1);
});

test('Supabase CAS retry merges newer text, fences changed artwork intent, and persists only normal private Storage refs', async () => {
  for (const concurrentChange of ['title', 'scenePrompt']) {
    const account = '00000000-0000-4000-8000-000000000001', origin = 'https://artwork-test.supabase.co';
    const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    const issued = await createSitesIdentityResolver({ url: origin, serviceKey: 'sb_secret_test_only', namespace: 'sites:test', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => response({ id: account }) })({ subject: 'verified-artwork-test' });
    let record = null, revision = 0, injectConflict = false, uploads = 0, conflicts = 0;
    const objects = new Map();
    const fetchImpl = async (url, options) => {
      assert.ok(url.startsWith(origin + '/'), 'the server never fetches the received host URL');
      if (url.includes('/storage/v1/object/')) {
        const path = url.split('/nooks-private/')[1];
        if (options.method === 'POST') { uploads++; objects.set(path, options.body); return response({}); }
        assert.ok(objects.has(path)); return new Response(objects.get(path));
      }
      const args = JSON.parse(options.body);
      if (url.endsWith('nooks_workspace_read')) return response(record ? { workspace: structuredClone(record), revision } : null);
      if (url.endsWith('nooks_artwork_reserve')) return response({ path: `${account}/${args.p_hash}/${args.p_request_id}`, mime: args.p_mime, generation: args.p_request_id, pinToken: account, pinUntil: new Date(Date.now() + 900000).toISOString(), state: 'reserved' });
      if (url.endsWith('nooks_artwork_complete')) return response({ accepted: true, state: 'ready' });
      assert.ok(url.endsWith('nooks_workspace_commit'));
      if (injectConflict) {
        injectConflict = false; conflicts++; record.nookCreator.drafts[0][concurrentChange] = 'Concurrent edit';
        record.nookCreator.drafts[0].revision++; revision++; return response({ committed: false, revision });
      }
      assert.equal(args.p_expected_revision, revision); record = structuredClone(args.p_workspace);
      return response({ committed: true, revision: ++revision });
    };
    const creator = () => new NookCreator(new SupabaseStore({ url: origin, serviceKey: 'sb_secret_test_only', identity: issued, fetchImpl }));
    const draft = (await creator().call('nook_draft_save', { draft: { title: 'Original', artworkMode: 'chatgpt', scenePrompt: 'Original room' }, expectedRevision: 0 }, issued)).draft;
    const requested = await creator().call('nook_artwork_request', { draftId: draft.id, expectedRevision: 1, requestId: crypto.randomUUID() }, issued);
    const { requestId } = requested;
    assert.equal(requested.recoveryScope, `account:${account}`);
    assert.equal(modelSafeResult({ structuredContent: requested }).structuredContent.recoveryScope, undefined);
    assert.equal((await creator().call('nook_draft_get', { draftId: draft.id }, issued)).recoveryScope, `account:${account}`);
    await creator().call('nook_artwork_receive', { draftId: draft.id, requestId, image: hostFile() }, issued);
    injectConflict = true;
    const args = { draftId: draft.id, requestId, fileId: hostFile().file_id, backgroundImage: png };
    if (concurrentChange === 'title') {
      const completed = await creator().call('nook_artwork_complete', args, issued);
      assert.equal(completed.draft.title, 'Concurrent edit'); assert.equal(completed.draft.revision, 3);
      assert.equal(record.nookCreator.drafts[0].space.backgroundImage, undefined);
      assert.ok(record.nookCreator.drafts[0].space._storedBackground.path.startsWith(account + '/'));
      const repeated = await creator().call('nook_artwork_complete', args, issued);
      assert.equal(repeated.duplicate, true); assert.equal(repeated.draft.revision, 3);
    } else {
      await assert.rejects(creator().call('nook_artwork_complete', args, issued), { code: 'CONFLICT' });
      assert.equal(record.nookCreator.drafts[0].revision, 2); assert.equal(record.nookCreator.drafts[0].artworkRequest.status, 'received');
      assert.equal(record.nookCreator.drafts[0].space._storedBackground, undefined);
    }
    assert.equal(conflicts, 1); assert.equal(uploads, 1);
  }
});

test('completion honors the existing image budget atomically and retains a recoverable request after rejection', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 3; index++) await f.save({ space: { backgroundImage: png } });
  const draft = await f.save(), { requestId } = await f.request(draft); await f.receive(draft, requestId);
  await assert.rejects(f.complete(draft, requestId), { code: 'STORAGE_FULL' });
  const read = await f.get(draft); assert.equal(read.draft.revision, 1); assert.equal(read.draft.space.backgroundImage, undefined); assert.equal(read.draft.artworkRequest.status, 'received');
});

test('recent receipt bound limits new requests, permits retries, and recovers after 12 hours', async t => {
  const f = await fixture(t), draft = await f.save(), key = crypto.randomUUID(), current = await f.request(draft, key);
  await f.store.transact(alice.id, workspace => {
    const receipts = workspace.nookCreator.artworkReceipts;
    while (receipts.length < ARTWORK_RECEIPT_LIMIT) receipts.unshift({ ...receipts.at(-1), clientRequestId: crypto.randomUUID(), requestId: crypto.randomUUID() });
    return {};
  });
  assert.equal((await f.request(draft, key)).requestId, current.requestId);
  await assert.rejects(f.request(draft), error => error.code === 'RATE_LIMITED' && /12 hours/.test(error.message));
  assert.equal((await f.store.read(alice.id)).nookCreator.artworkReceipts.length, ARTWORK_RECEIPT_LIMIT);
  f.advance(ARTWORK_REQUEST_TTL_MS + 1);
  const next = await f.request(draft, key); assert.notEqual(next.requestId, current.requestId);
  assert.equal((await f.store.read(alice.id)).nookCreator.artworkReceipts.length, 1);
  await assert.rejects(f.receive(draft, current.requestId), { code: 'CONFLICT' });
});

test('model results strip signed URLs, file identity, names and fingerprints while retaining routing status', async t => {
  const f = await fixture(t), draft = await f.save(), { requestId } = await f.request(draft), received = await f.receive(draft, requestId);
  const result = modelSafeResult({ structuredContent: received, content: [] }), serialized = JSON.stringify(result.structuredContent);
  for (const value of ['private-signed-token', hostFile().file_name, hostFile().file_id, 'fingerprint', 'clientRequestId', 'downloadUrl']) assert.equal(serialized.includes(value), false, value);
  assert.equal(result.structuredContent.requestId, requestId); assert.equal(result.structuredContent.draft.artworkRequest.status, 'received');
  assert.equal(result._meta.notableData.draft.artworkRequest.file.downloadUrl, hostFile().download_url);
});

test('artwork tools advertise the official file schema and app-only completion/cancellation without a new render entrypoint', () => {
  const tools = listNookCreatorTools({ oauthConfigured: true }), receive = tools.find(tool => tool.name === 'nook_artwork_receive');
  assert.deepEqual(receive._meta['openai/fileParams'], ['image']);
  assert.deepEqual(Object.keys(receive.inputSchema.properties.image.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']);
  assert.deepEqual(receive.inputSchema.properties.image.required, ['download_url', 'file_id']);
  for (const tool of tools.filter(tool => tool.name.startsWith('nook_artwork_'))) {
    assert.equal(tool.annotations.readOnlyHint, false); assert.equal(tool.annotations.idempotentHint, true);
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: ['notable.read', 'notable.write'] }]);
    assert.equal(tool._meta['openai/outputTemplate'], undefined);
    if (['nook_artwork_complete', 'nook_artwork_cancel'].includes(tool.name)) assert.deepEqual(tool._meta.ui.visibility, ['app']);
    else assert.equal(tool._meta.ui, undefined);
  }
});
