import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createArtworkCleanup, parseArtworkReference } from '../server/artwork-lifecycle.mjs';
import { createSitesIdentityResolver, sha256 } from '../server/supabase-auth.mjs';

const account = '00000000-0000-4000-8000-000000000001', foreign = '00000000-0000-4000-8000-000000000002';
const origin = 'https://nooks-test.supabase.co', serviceKey = 'sb_secret_artwork_tests_only';
const bytes = Uint8Array.from(atob('iVBORw0KGgo='), char => char.charCodeAt(0));
const image = 'data:image/png;base64,iVBORw0KGgo=', hash = await sha256(bytes);
const uuid = serial => `10000000-0000-4000-8000-${String(serial).padStart(12, '0')}`;
const references = value => [value?.space, ...(value?.nookCreator?.drafts ?? []).map(draft => draft.space)].flatMap(space => space?._storedBackground ? [space._storedBackground.path] : []);

/** Transport/protocol model only. SQL lock and reference-scan semantics have
 * separate PostgreSQL acceptance tests; this does not claim to execute SQL. */
async function fixture() {
  const identity = await createSitesIdentityResolver({ url: origin, serviceKey, namespace: 'sites:artwork-tests', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => Response.json({ id: account }) })({ subject: 'synthetic-owner' });
  let now = Date.parse('2026-10-04T00:00:00Z'), serial = 0, revision = 0, workspace = null;
  const assets = new Map(), objects = new Map(), shares = new Map(), calls = [], faults = {};
  const clock = () => new Date(now);
  const allReferences = () => new Set([...references(workspace), ...[...shares.values()].flatMap(references)]);
  const fetchImpl = async function (url, options) {
    assert.equal(this, undefined); assert.equal(new URL(url).origin, origin); assert.equal(options.redirect, 'manual');
    const route = new URL(url).pathname, body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    calls.push({ route, options, body });
    if (route.endsWith('/nooks_workspace_read')) return Response.json(workspace ? { revision, workspace } : null);
    if (route.endsWith('/nooks_artwork_reserve')) {
      if (faults.reserveQuota) return Response.json({ code: '54000' }, { status: 400 });
      if (faults.reserveResponse) return Response.json(faults.reserveResponse);
      const previous = [...assets.values()].find(asset => asset.requestId === body.p_request_id);
      if (previous) return Response.json(previous);
      const generation = uuid(++serial), path = `${body.p_account}/${body.p_hash}/${generation}`;
      const asset = { path, mime: body.p_mime, generation, requestId: body.p_request_id, pinToken: uuid(++serial), pinUntil: new Date(now + 900000).toISOString(), state: 'reserved' };
      assets.set(path, asset); return Response.json(asset);
    }
    if (route.endsWith('/nooks_artwork_complete')) {
      const asset = assets.get(body.p_path); assert.equal(body.p_pin_token, asset.pinToken);
      if (faults.completeTimeout) throw new Error('Synthetic lost completion response');
      if (faults.completeExpired) return Response.json({ accepted: false, reason: 'unavailable' });
      assert.ok(objects.has(body.p_path)); asset.state = 'ready'; return Response.json({ accepted: true, state: 'ready' });
    }
    if (route.endsWith('/nooks_workspace_commit')) {
      if (faults.casFailures) { faults.casFailures--; return Response.json({ committed: false, revision }); }
      const proposed = [...references(body.p_workspace), ...body.p_share_operations.filter(op => op.kind === 'publish').flatMap(op => references(op.snapshot))];
      if (proposed.some(path => path.split('/').length === 3 && assets.get(path)?.state !== 'ready')) return Response.json({ code: '40001' }, { status: 409 });
      workspace = structuredClone(body.p_workspace); revision++;
      for (const op of body.p_share_operations) if (op.kind === 'publish') shares.set(op.id, structuredClone(op.snapshot)); else shares.delete(op.id);
      if (faults.commitTimeout) throw new Error('Synthetic lost commit response');
      return Response.json({ committed: true, revision });
    }
    if (route.endsWith('/nooks_artwork_cleanup_claim')) {
      if (faults.claimResponse) return Response.json(faults.claimResponse);
      const refs = allReferences();
      const candidates = [...assets.values()].filter(asset => !refs.has(asset.path) && Date.parse(asset.pinUntil) <= now).slice(0, body.p_limit).map(asset => {
        if (!body.p_dry_run) { if (asset.state !== 'deleted') asset.state = 'deleting'; asset.claimToken = uuid(++serial); asset.leaseUntil = new Date(now + body.p_lease_seconds * 1000).toISOString(); }
        return { path: asset.path, generation: asset.generation, state: asset.state, ...(!body.p_dry_run ? { claimToken: asset.claimToken, leaseUntil: asset.leaseUntil } : {}) };
      });
      return Response.json({ bucket: 'nooks-private', dryRun: body.p_dry_run, quarantined: false, candidates, hasMore: false });
    }
    if (route.endsWith('/nooks_artwork_cleanup_ack')) {
      const asset = assets.get(body.p_path);
      if (faults.ackTimeout) throw new Error('Synthetic lost acknowledgment response');
      if (asset.claimToken !== body.p_claim_token) return Response.json({ acknowledged: false, state: asset.state });
      if (body.p_success) { assert.equal(objects.has(body.p_path), false); asset.state = 'deleted'; }
      return Response.json({ acknowledged: true, state: asset.state });
    }
    if (route === '/storage/v1/object/nooks-private' && options.method === 'DELETE') {
      assert.equal(body.prefixes.length, 1); const path = body.prefixes[0];
      assert.ok(assets.get(path)?.claimToken, 'physical deletion requires a claim');
      assert.ok(['deleting', 'deleted'].includes(assets.get(path).state));
      if (faults.deleteBefore) await faults.deleteBefore(path);
      if (faults.deleteTimeout === 'before') throw new Error('Synthetic unknown deletion');
      objects.delete(path);
      if (faults.deleteTimeout === 'after') throw new Error('Synthetic lost deletion response');
      return Response.json([{ name: path }]);
    }
    if (route.startsWith('/storage/v1/object/nooks-private/') && options.method === 'POST') {
      const path = route.slice('/storage/v1/object/nooks-private/'.length);
      assert.equal(assets.get(path)?.state, 'reserved'); assert.equal(options.headers['x-upsert'], 'false');
      if (faults.uploadStatus) return new Response(null, { status: faults.uploadStatus });
      if (faults.uploadTimeout) throw new Error('Synthetic upload timeout');
      objects.set(path, new Uint8Array(options.body)); return Response.json({ Key: `nooks-private/${path}` });
    }
    if (route.startsWith('/storage/v1/object/authenticated/nooks-private/')) {
      if (faults.readResponse) return faults.readResponse();
      const path = route.slice('/storage/v1/object/authenticated/nooks-private/'.length);
      return objects.has(path) ? new Response(objects.get(path)) : Response.json({ code: 'NoSuchKey', message: 'Object not found' }, { status: 404 });
    }
    throw new Error(`Unexpected fixture route: ${route}`);
  };
  const store = options => new SupabaseStore({ url: origin, serviceKey, identity, fetchImpl, clock, ...options });
  const cleanup = () => createArtworkCleanup({ url: origin, serviceKey, accountId: account, fetchImpl, clock });
  return { identity, store, cleanup, calls, faults, assets, objects, shares, clock, expire: () => { now += 31 * 86400000; }, workspace: () => workspace, reference: path => ({ path, mime: 'image/png' }) };
}

test('new artwork reserves one immutable generation, completes, and commits identical workspace/draft/share refs', async () => {
  const f = await fixture(), store = f.store();
  await store.transact(account, async workspace => {
    workspace.space = { ...workspace.space, backgroundImage: image }; workspace.nookCreator = { drafts: [{ space: { backgroundImage: image } }] };
    await store.publishShare(account, { id: uuid(900), space: { backgroundImage: image } }); return {};
  });
  const path = f.workspace().space._storedBackground.path;
  assert.match(path, new RegExp(`^${account}/${hash}/[a-f0-9-]{36}$`));
  assert.equal(f.workspace().nookCreator.drafts[0].space._storedBackground.path, path);
  assert.equal(f.shares.get(uuid(900)).space._storedBackground.path, path);
  assert.equal(f.assets.size, 1); assert.equal(f.objects.size, 1);
  assert.deepEqual(f.calls.filter(call => call.route.includes('/nooks_artwork_')).map(call => call.route.split('/').at(-1)), ['nooks_artwork_reserve', 'nooks_artwork_complete']);
  assert.equal(JSON.stringify(f.workspace()).includes('pinToken'), false);
});

test('hydration preserves full generation and legacy refs; ordinary normalized autosave does not upload', async () => {
  const f = await fixture();
  await f.store().transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; });
  const path = f.workspace().space._storedBackground.path, count = f.calls.length;
  await f.store().transact(account, workspace => { assert.equal(workspace.space._storedBackground.path, path); delete workspace.space._storedBackground; workspace.plan.tasks.push({ title: 'Keep notes' }); return {}; });
  assert.equal(f.workspace().space._storedBackground.path, path);
  assert.equal(f.calls.slice(count).some(call => call.route.endsWith('nooks_artwork_reserve') || call.options.method === 'POST' && call.route.includes('/storage/')), false);
  const legacy = `${account}/${hash}`; f.objects.set(legacy, bytes);
  const legacyStore = f.store(), loaded = await legacyStore.unpack({ space: { _storedBackground: f.reference(legacy) } });
  assert.deepEqual((await legacyStore.pack(loaded)).space._storedBackground, f.reference(legacy));
});

test('CAS failure retries reuse the pinned uploaded generation and share attachment', async () => {
  const f = await fixture(), store = f.store(); f.faults.casFailures = 2;
  await store.transact(account, async workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; await store.publishShare(account, { id: uuid(901), space: { backgroundImage: image } }); return {}; });
  assert.equal(f.assets.size, 1); assert.equal(f.calls.filter(call => call.route.endsWith('nooks_workspace_commit')).length, 3);
  assert.equal(f.shares.get(uuid(901)).space._storedBackground.path, f.workspace().space._storedBackground.path);
});

test('save before cleanup claim preserves references from current space, private draft and published share', async () => {
  for (const location of ['space', 'draft', 'share']) {
    const f = await fixture(), store = f.store();
    await store.transact(account, async workspace => {
      if (location === 'space') workspace.space = { ...workspace.space, backgroundImage: image };
      if (location === 'draft') workspace.nookCreator = { drafts: [{ space: { backgroundImage: image } }] };
      if (location === 'share') await store.publishShare(account, { id: uuid(902), space: { backgroundImage: image } });
      return {};
    });
    f.expire(); const result = await f.cleanup().run({ dryRun: false });
    assert.deepEqual(result.outcomes, []); assert.equal(f.objects.size, 1);
  }
});

test('claim before save fences the stale generation and never erases the previous workspace', async () => {
  const f = await fixture(), packed = await f.store().pack({ space: { backgroundImage: image } });
  f.expire(); await f.cleanup().run({ dryRun: false });
  await assert.rejects(f.store().transact(account, workspace => { workspace.space = packed.space; return {}; }), { code: 'ARTWORK_CONFLICT' });
  assert.equal(f.workspace(), null);
});

test('failed and ambiguous upload outcomes never complete or attach; fresh retries get a different generation', async () => {
  for (const fault of ['timeout', 409, 503]) {
    const f = await fixture(), store = f.store();
    if (fault === 'timeout') f.faults.uploadTimeout = true; else f.faults.uploadStatus = fault;
    await assert.rejects(store.transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; }), /image could not be saved/);
    const [oldPath] = f.assets.keys(); assert.equal(f.assets.get(oldPath).state, 'reserved'); assert.equal(f.workspace(), null);
    assert.equal(f.calls.some(call => call.route.endsWith('nooks_artwork_complete')), false);
    delete f.faults.uploadTimeout; delete f.faults.uploadStatus;
    await store.transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; });
    assert.notEqual(f.workspace().space._storedBackground.path, oldPath); assert.equal(f.assets.size, 2);
  }
});

test('expired or unknown completion blocks attachment and retains the reservation for later cleanup', async () => {
  for (const fault of ['completeExpired', 'completeTimeout']) {
    const f = await fixture(); f.faults[fault] = true;
    await assert.rejects(f.store().transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; }), /image could not be saved/);
    assert.equal(f.workspace(), null); assert.equal(f.objects.size, 1); assert.equal([...f.assets.values()][0].state, 'reserved');
  }
});

test('ambiguous commit preserves upload pin and a committed reference prevents later cleanup', async () => {
  const f = await fixture(); f.faults.commitTimeout = true;
  await assert.rejects(f.store().transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; }), /lost commit/);
  assert.equal(f.objects.size, 1); assert.ok(f.workspace().space._storedBackground);
  f.expire(); assert.deepEqual((await f.cleanup().run({ dryRun: false })).outcomes, []);
});

test('oversize payload and malformed later artwork cause no reservation or upload', async () => {
  const f = await fixture();
  await assert.rejects(f.store({ maxWorkspaceBytes: 50 }).transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; }), { code: 'STORAGE_FULL' });
  await assert.rejects(f.store().pack({ space: { backgroundImage: image }, nookCreator: { drafts: [{ space: { backgroundImage: 'data:image/png;base64,YmFk' } }] } }), /do not match/);
  assert.equal(f.assets.size, 0); assert.equal(f.objects.size, 0);
});

test('foreign reservation response cannot redirect upload or attach another owner generation', async () => {
  const f = await fixture(); f.faults.reserveResponse = { path: `${foreign}/${hash}/${uuid(1)}`, mime: 'image/png', generation: uuid(1), pinToken: uuid(2), pinUntil: new Date(f.clock().valueOf() + 900000).toISOString(), state: 'reserved' };
  await assert.rejects(f.store().pack({ space: { backgroundImage: image } }), /image could not be saved/);
  assert.equal(f.calls.some(call => call.route.includes('/storage/')), false);
  assert.throws(() => parseArtworkReference({ path: `${account}/${hash}/${uuid(1)}/extra`, mime: 'image/png' }, account), /Invalid private artwork/);
});

test('a retried ready reservation verifies its exact bytes and never overwrites that generation', async () => {
  for (const valid of [true, false]) {
    const f = await fixture(), path = `${account}/${hash}/${uuid(1)}`;
    f.faults.reserveResponse = { path, mime: 'image/png', generation: uuid(1), pinToken: uuid(2), pinUntil: new Date(f.clock().valueOf() + 900000).toISOString(), state: 'ready' };
    f.objects.set(path, valid ? bytes : new Uint8Array([1, 2, 3]));
    if (valid) assert.equal((await f.store().pack({ space: { backgroundImage: image } })).space._storedBackground.path, path);
    else await assert.rejects(f.store().pack({ space: { backgroundImage: image } }), /image could not be saved/);
    assert.equal(f.calls.some(call => call.route.includes('/storage/') && call.options.method === 'POST'), false);
    assert.equal(f.calls.some(call => call.route.endsWith('nooks_artwork_complete')), false);
  }
});

test('operator defaults to bounded dry run; no claim mutation or Storage delete', async () => {
  const f = await fixture(); await f.store().pack({ space: { backgroundImage: image } }); f.expire();
  const result = await f.cleanup().run(); assert.equal(result.dryRun, true); assert.equal(result.candidates.length, 1);
  assert.equal([...f.assets.values()][0].state, 'ready'); assert.equal(f.objects.size, 1);
  const request = f.calls.at(-1).body; assert.equal(request.p_dry_run, true); assert.equal(request.p_limit, 25); assert.equal(request.p_min_age_seconds, 2592000);
  for (const options of [{ limit: 51 }, { minAgeSeconds: 86399 }, { leaseSeconds: 301 }, { dryRun: 'false' }]) await assert.rejects(f.cleanup().run(options), /Invalid artwork cleanup/);
});

test('unknown deletion and acknowledgment outcomes remain retryable; retries target only exact claimed path', async () => {
  for (const fault of ['before', 'after', 'ack']) {
    const f = await fixture(); await f.store().pack({ space: { backgroundImage: image } }); f.expire();
    if (fault === 'ack') f.faults.ackTimeout = true; else f.faults.deleteTimeout = fault;
    const result = await f.cleanup().run({ dryRun: false }); assert.notEqual(result.outcomes[0].status, 'deleted');
    assert.equal([...f.assets.values()][0].state, 'deleting');
    delete f.faults.deleteTimeout; delete f.faults.ackTimeout;
    const retried = await f.cleanup().run({ dryRun: false }); assert.equal(retried.outcomes[0].status, 'deleted'); assert.equal(f.objects.size, 0);
    assert.equal([...f.assets.values()][0].state, 'deleted');
  }
});

test('old tombstone re-deletion catches late upload and cannot delete fresh generation with same bytes', async () => {
  const f = await fixture(), old = await f.store().pack({ space: { backgroundImage: image } }), oldPath = old.space._storedBackground.path;
  f.expire(); await f.cleanup().run({ dryRun: false });
  f.objects.set(oldPath, bytes); // A timed-out upload completes after successful deletion.
  await f.store().transact(account, workspace => { workspace.space = { ...workspace.space, backgroundImage: image }; return {}; });
  const freshPath = f.workspace().space._storedBackground.path; assert.notEqual(freshPath, oldPath);
  const result = await f.cleanup().run({ dryRun: false }); assert.deepEqual(result.outcomes.map(item => item.path), [oldPath]);
  assert.equal(f.objects.has(oldPath), false); assert.equal(f.objects.has(freshPath), true);
});

test('cleanup refuses foreign, legacy, malformed, expired, duplicate and mixed-bucket claims before any delete', async () => {
  for (const change of [candidate => ({ ...candidate, path: `${foreign}/${hash}/${uuid(1)}` }), candidate => ({ ...candidate, path: `${account}/${hash}` }), candidate => ({ ...candidate, generation: uuid(99) }), candidate => ({ ...candidate, claimToken: 'bad' }), candidate => ({ ...candidate, leaseUntil: '2000-01-01T00:00:00Z' }), candidate => ({ ...candidate, state: 'ready' }), candidate => ({ ...candidate, state: 'reserved' })]) {
    const f = await fixture();
    const candidate = { path: `${account}/${hash}/${uuid(1)}`, generation: uuid(1), state: 'deleting', claimToken: uuid(2), leaseUntil: new Date(f.clock().valueOf() + 60000).toISOString() };
    const second = { ...candidate, path: `${account}/${hash}/${uuid(3)}`, generation: uuid(3), claimToken: uuid(4) };
    f.faults.claimResponse = { bucket: 'nooks-private', dryRun: false, quarantined: false, hasMore: false, candidates: [candidate, change(second)] };
    await assert.rejects(f.cleanup().run({ dryRun: false }), /Invalid/); assert.equal(f.calls.some(call => call.options.method === 'DELETE'), false);
  }
  for (const mode of ['duplicate', 'bucket', 'quarantined']) {
    const f = await fixture(), candidate = { path: `${account}/${hash}/${uuid(1)}`, generation: uuid(1), state: 'deleting', claimToken: uuid(2), leaseUntil: new Date(f.clock().valueOf() + 60000).toISOString() };
    f.faults.claimResponse = { bucket: mode === 'bucket' ? 'foreign-bucket' : 'nooks-private', dryRun: false, quarantined: mode === 'quarantined', hasMore: false, candidates: mode === 'duplicate' ? [candidate, candidate] : [candidate] };
    await assert.rejects(f.cleanup().run({ dryRun: false }), /Invalid/); assert.equal(f.calls.some(call => call.options.method === 'DELETE'), false);
  }
});

test('reservation quota gives actionable image-specific guidance before Storage writes', async () => {
  const f = await fixture(); f.faults.reserveQuota = true;
  await assert.rejects(f.store().pack({ space: { backgroundImage: image } }), error => error.code === 'ARTWORK_LIMIT' && /100 new images per day and 128 pending or retained/.test(error.message) && /retention cleanup/.test(error.message));
  assert.equal(f.calls.some(call => call.route.includes('/storage/')), false);
});

test('only explicit object-not-found confirms deletion; bucket, tenant, auth, generic and oversized errors do not', async () => {
  for (const [status, error, expected] of [[404, { code: 'NoSuchKey' }, true], [400, { statusCode: '404', error: 'not_found', message: 'Object not found' }, true], [404, { code: 'NoSuchBucket' }, false], [404, { code: 'TenantNotFound' }, false], [404, {}, false], [403, { code: 'NoSuchKey' }, false], [400, { error: 'not_found' }, false], [404, { code: 'NoSuchKey', padding: 'x'.repeat(5000) }, false]]) {
    const f = await fixture(); await f.store().pack({ space: { backgroundImage: image } }); f.expire(); f.faults.readResponse = () => Response.json(error, { status });
    const result = await f.cleanup().run({ dryRun: false }); assert.equal(result.outcomes[0].status === 'deleted', expected, JSON.stringify(error));
  }
});

test('artwork degradation hook receives one bounded count without private values and cannot break reading', async () => {
  const f = await fixture(), events = [];
  const ref = { path: `${account}/${hash}`, mime: 'image/png' };
  const result = await f.store({ onArtworkUnavailable: event => { events.push(event); throw new Error('Synthetic monitor failure'); } }).unpack({ space: { _storedBackground: ref }, nookCreator: { drafts: [{ space: { _storedBackground: ref } }] } });
  assert.deepEqual(events, [{ count: 2 }]); assert.equal(result.artworkWarnings.length, 2); assert.deepEqual(result.space._storedBackground, ref);
  const asyncResult = await f.store({ onArtworkUnavailable: async () => { throw new Error('Synthetic asynchronous observer failure'); } }).unpack({ space: { _storedBackground: ref } });
  assert.equal(asyncResult.artworkWarnings.length, 1);
});
