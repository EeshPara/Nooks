import test from 'node:test';
import assert from 'node:assert/strict';
import { createSitesIdentityResolver, createSupabaseIdentityVerifier, sha256 } from '../server/supabase-auth.mjs';
import { SupabaseStore, createSupabaseOutbox } from '../server/supabase-store.mjs';

const origin = 'https://nooks-test.supabase.co';
const serviceKey = 'sb_secret_redirect_test_only';
const accountId = '00000000-0000-4000-8000-000000000001';
const options = { url: origin, serviceKey };
const redirectTarget = 'https://untrusted.invalid/collect';
const sitesOptions = { ...options, namespace: 'sites:redirect-test', trustedBoundary: 'sites-dispatcher' };
function artworkRpc(url, init) {
  if (url.endsWith('/nooks_artwork_reserve')) { const args = JSON.parse(init.body); return Response.json({ path: `${args.p_account}/${args.p_hash}/${args.p_request_id}`, mime: args.p_mime, generation: args.p_request_id, pinToken: accountId, pinUntil: new Date(Date.now() + 900000).toISOString(), state: 'reserved' }); }
  if (url.endsWith('/nooks_artwork_complete')) return Response.json({ accepted: true, state: 'ready' });
}

test('Supabase calls never bind injected fetch to the account store', async () => {
  const receivers = [], paths = [];
  const bytes = Uint8Array.from(atob('iVBORw0KGgo='), value => value.charCodeAt(0));
  async function strictFetch(url, init) {
    receivers.push(this);
    assert.equal(this, undefined, 'native Worker fetch must be called without an arbitrary receiver');
    assert.equal(init.redirect, 'manual');
    paths.push(new URL(url).pathname);
    if (url.endsWith('/nooks_resolve_identity') || url.endsWith('/auth/v1/user')) return Response.json({ id: accountId });
    if (url.includes('/storage/v1/object/authenticated/')) return new Response(bytes);
    if (url.endsWith('/nooks_workspace_read')) return Response.json(null);
    if (url.includes('/nooks_artwork_')) return artworkRpc(url, init);
    return Response.json({ ok: true });
  }
  const resolve = createSitesIdentityResolver({ ...sitesOptions, fetchImpl: strictFetch });
  const identity = await resolve({ subject: 'verified-test-user' });
  const verify = createSupabaseIdentityVerifier({ ...options, publishableKey: 'sb_publishable_test', fetchImpl: strictFetch });
  await verify('test-access-token');
  const store = new SupabaseStore({ ...options, identity, fetchImpl: strictFetch });
  await store.read(accountId);
  await store.pack({ space: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' } });
  // A fresh store forces a real download rather than reusing the upload cache.
  const reader = new SupabaseStore({ ...options, identity, fetchImpl: strictFetch });
  await reader.unpack({ space: { _storedBackground: { path: `${accountId}/${await sha256(bytes)}`, mime: 'image/png' } } });
  const outbox = createSupabaseOutbox({ ...options, fetchImpl: strictFetch });
  await outbox.claim();
  await outbox.acknowledge({ id: accountId, leaseToken: 'test', success: true });
  await outbox.ingest({ source: 'test', eventId: 'test', payloadHash: 'a'.repeat(64), eventType: 'test' });
  assert.equal(receivers.length, 11);
  assert.ok(paths.some(path => path.includes('/storage/v1/object/authenticated/')));
});

function redirectFetch(status = 302) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      assert.equal(new URL(url).origin, origin, 'credentials must stay at the configured Supabase origin');
      assert.equal(init.redirect, 'manual', 'Workers must not follow credential-bearing redirects');
      return new Response(null, { status, headers: { Location: redirectTarget } });
    },
  };
}

async function issuedIdentity() {
  const resolve = createSitesIdentityResolver({
    ...sitesOptions,
    fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, 'manual');
      return Response.json({ id: accountId });
    },
  });
  return resolve({ subject: 'verified-test-user' });
}

test('Sites identity refuses redirects without following or issuing an account', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const mock = redirectFetch(status);
    const resolve = createSitesIdentityResolver({ ...sitesOptions, fetchImpl: mock.fetchImpl });
    await assert.rejects(resolve({ subject: 'verified-test-user' }), /account connection is temporarily unavailable/);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].init.headers.apikey, serviceKey);
  }
});

test('bearer verification refuses redirects before account lookup', async () => {
  const mock = redirectFetch();
  const verify = createSupabaseIdentityVerifier({ ...options, publishableKey: 'sb_publishable_test', fetchImpl: mock.fetchImpl });
  await assert.rejects(verify('test-access-token'), /authentication is temporarily unavailable/);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${origin}/auth/v1/user`);
  assert.equal(mock.calls[0].init.headers.Authorization, 'Bearer test-access-token');
});

test('verified bearer identity still refuses a redirect from account resolution', async () => {
  const mock = redirectFetch();
  let verificationCalls = 0;
  const verify = createSupabaseIdentityVerifier({ ...options, publishableKey: 'sb_publishable_test', fetchImpl: async (url, init) => {
    assert.equal(init.redirect, 'manual');
    if (url.endsWith('/auth/v1/user')) {
      verificationCalls++;
      return Response.json({ id: accountId });
    }
    return mock.fetchImpl(url, init);
  } });
  await assert.rejects(verify('test-access-token'), /account connection is temporarily unavailable/);
  assert.equal(verificationCalls, 1);
  assert.equal(mock.calls.length, 1);
});

test('workspace RPC rejects a redirect before returning or modifying workspace data', async () => {
  const mock = redirectFetch();
  const store = new SupabaseStore({ ...options, identity: await issuedIdentity(), fetchImpl: mock.fetchImpl });
  let mutated = false;
  await assert.rejects(store.transact(accountId, () => { mutated = true; return {}; }), /storage is temporarily unavailable/);
  assert.equal(mutated, false);
  assert.equal(mock.calls.length, 1);
});

test('navigation session and target reads reject redirects without forwarding credentials', async () => {
  const identity = await issuedIdentity();
  for (const status of [301, 302, 303, 307, 308]) {
    for (const target of ['sessions', 'artifacts']) {
      const mock = redirectFetch(status);
      const calls = [];
      const store = new SupabaseStore({ ...options, identity, fetchImpl: async (url, init) => {
        calls.push(url);
        assert.equal(init.redirect, 'manual');
        if (target === 'artifacts' && new URL(url).pathname === '/rest/v1/nooks_workspaces') return Response.json([{ sessions: [] }]);
        return mock.fetchImpl(url, init);
      } });
      await assert.rejects(store.readNavigationState(accountId, { includeArtifacts: target === 'artifacts' }), /tab connection is temporarily unavailable/);
      assert.equal(mock.calls.length, 1, 'no request may follow a redirect');
      assert.equal(calls.length, target === 'artifacts' ? 2 : 1);
      assert.equal(mock.calls[0].init.headers.apikey, serviceKey);
      assert.equal(new URL(mock.calls[0].url).searchParams.get('account_id'), `eq.${accountId}`);
      assert.ok(calls.every(url => new URL(url).origin === origin));
    }
  }
});

test('private artwork upload and download reject redirects without caching success', async () => {
  const identity = await issuedIdentity();
  for (const action of ['upload', 'download']) {
    const mock = redirectFetch();
    const store = new SupabaseStore({ ...options, identity, fetchImpl: async (url, init) => artworkRpc(url, init) ?? mock.fetchImpl(url, init) });
    const execute = action === 'upload'
      ? () => store.pack({ space: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' } })
      : () => store.unpack({ space: { _storedBackground: { path: `${accountId}/${'a'.repeat(64)}`, mime: 'image/png' } } });
    for (let attempt = 0; attempt < 2; attempt++) {
      if (action === 'upload') await assert.rejects(execute(), /image could not be saved/);
      else {
        const result = await execute();
        assert.equal(result.artworkWarnings[0].code, 'ARTWORK_UNAVAILABLE');
        assert.equal(result.space.backgroundImage, undefined);
        assert.equal(result.space._storedBackground.path, `${accountId}/${'a'.repeat(64)}`);
      }
    }
    assert.equal(mock.calls.length, 2, 'a failed redirect must not mark an image saved or downloaded');
    assert.ok(mock.calls.every(call => call.url.includes('/storage/v1/object/')));
  }
});

test('outbox claim, acknowledge, and webhook ingestion refuse redirects', async () => {
  const mock = redirectFetch();
  const outbox = createSupabaseOutbox({ ...options, fetchImpl: mock.fetchImpl });
  await assert.rejects(outbox.claim(), /event delivery is temporarily unavailable/);
  await assert.rejects(outbox.acknowledge({ id: accountId, leaseToken: 'test-lease', success: true }), /event delivery is temporarily unavailable/);
  await assert.rejects(outbox.ingest({ source: 'test', eventId: 'test-event', payloadHash: 'a'.repeat(64), eventType: 'test' }), /event delivery is temporarily unavailable/);
  assert.equal(mock.calls.length, 3);
});
