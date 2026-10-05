import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { WorkspaceStore } from '../server/store.mjs';
import { createNotableServer } from '../server/index.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-community-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const identities = {
    reader: { id: 'verified-reader', scopes: ['notable.read'] },
    writer: { id: 'verified-writer', scopes: ['notable.read', 'notable.write'] },
    writeOnly: { id: 'verified-write-only', scopes: ['notable.write'] },
  };
  const bindings = [];
  const calls = [];
  const { server } = createNotableServer({
    dataDirectory: join(directory, 'anonymous'),
    publicUrl: 'https://nooks.test/mcp',
    issuer: 'https://login.nooks.test',
    verifyToken: async token => identities[token] ?? null,
    storeForIdentity: async identity => {
      bindings.push(identity.id);
      const store = new WorkspaceStore(join(directory, 'authenticated'), { seeded: false });
      store.community = async (action, args) => {
        calls.push({ actor: identity.id, action, args });
        if (action === 'nook_scene_get') return { nookId: args.nookId, scene: { id: '00000000-0000-4000-8000-000000000002', snapshotHash: 'a'.repeat(64) }, appearance: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' }, recoveryScope: `account:${identity.id}` };
        return { nooks: [], actor: identity.id };
      };
      return store;
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const rpc = (method, params = {}, token) => new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const request = httpRequest({
      hostname: '127.0.0.1', port: server.address().port, path: '/mcp', method: 'POST',
      headers: { Host: 'nooks.test', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { assert.equal(response.statusCode, 200, body); resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
  const call = async (name, args = {}, token) => (await rpc('tools/call', { name, arguments: args }, token)).result;
  return { rpc, call, calls, bindings };
}

test('anonymous community reads and writes fail before account storage is resolved', async t => {
  const { call, calls, bindings } = await fixture(t);
  for (const name of ['nooks_list', 'nook_snapshot', 'nook_scene_get', 'nook_create', 'profile_update', 'nook_archive', 'nook_invites_list', 'nook_invite_revoke']) {
    const result = await call(name, { userId: 'verified-writer', actor: 'verified-writer' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'AUTH_REQUIRED');
    assert.match(result._meta['mcp/www_authenticate'][0], /invalid_token/);
  }
  const invalid = await call('nooks_list', {}, 'invalid-token');
  assert.equal(invalid.structuredContent.error.code, 'AUTH_REQUIRED');
  assert.deepEqual(bindings, []);
  assert.deepEqual(calls, []);
});

test('read-only community access permits discovery but denies every write before dispatch', async t => {
  const { call, calls, bindings } = await fixture(t);
  const read = await call('nooks_list', {}, 'reader');
  assert.equal(read.isError, undefined);
  assert.deepEqual(read.structuredContent.nooks, []);
  assert.deepEqual(calls, [{ actor: 'verified-reader', action: 'list_nooks', args: {} }]);
  for (const name of ['nook_join', 'nook_leave', 'nook_presence', 'profile_update', 'nook_create', 'nook_invite_create', 'nook_invite_accept', 'nook_archive', 'nook_invite_revoke']) {
    const result = await call(name, {}, 'reader');
    assert.equal(result.structuredContent.error.code, 'INSUFFICIENT_SCOPE', name);
    assert.match(result._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  }
  assert.deepEqual(bindings, ['verified-reader']);
  assert.equal(calls.length, 1);
  await call('profile_update', { displayName: 'Chosen name', avatar: 2 }, 'writer');
  assert.deepEqual(calls[1], { actor: 'verified-writer', action: 'update_profile', args: { displayName: 'Chosen name', avatar: 2 } });
});

test('backend markers and advertised community scopes match actual authenticated storage', async t => {
  const { rpc, call, bindings } = await fixture(t);
  const initialized = (await rpc('initialize', { protocolVersion: '2025-11-25' })).result;
  assert.match(initialized.instructions, /Authenticated community tools return accessible nooks, actual members/);
  assert.doesNotMatch(initialized.instructions, /community lobby, members, and rankings are design-preview samples/);
  const preview = await call('workspace_get', { userId: 'verified-writer' });
  assert.equal(preview.structuredContent.authenticated, false);
  assert.equal(preview.structuredContent.workspace.backend, 'local');
  assert.equal(preview._meta.notableData.workspace.backend, 'local');
  assert.deepEqual(bindings, []);
  const signed = await call('workspace_get', {}, 'reader');
  assert.equal(signed.structuredContent.authenticated, true);
  assert.equal(signed.structuredContent.workspace.backend, 'supabase');
  assert.equal(signed._meta.notableData.workspace.backend, 'supabase');
  assert.deepEqual(signed._meta.notableData.workspace.artifacts, []);
  const tools = (await rpc('tools/list')).result.tools;
  for (const name of ['nooks_list', 'nook_snapshot', 'nook_scene_get', 'nook_join', 'nook_presence', 'profile_update', 'nook_create', 'nook_invite_create', 'nook_archive', 'nook_invites_list', 'nook_invite_revoke']) {
    const tool = tools.find(item => item.name === name);
    assert.ok(tool, name);
    const scopes = tool.annotations.readOnlyHint ? ['notable.read'] : ['notable.read', 'notable.write'];
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes }], name);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes, name);
  }
});

test('scene HTTP tool requires read permission and keeps hydrated pixels only in UI metadata', async t => {
  const { call, calls, bindings } = await fixture(t), nookId = '00000000-0000-4000-8000-000000000001';
  const denied = await call('nook_scene_get', { nookId }, 'writeOnly');
  assert.equal(denied.structuredContent.error.code, 'AUTH_REQUIRED'); assert.deepEqual(bindings, []); assert.deepEqual(calls, []);
  const loaded = await call('nook_scene_get', { nookId }, 'reader');
  assert.equal(loaded.structuredContent.nookId, nookId); assert.equal(loaded.structuredContent.appearance, undefined); assert.equal(loaded.structuredContent.recoveryScope, undefined);
  assert.equal(loaded._meta.notableData.appearance.backgroundImage, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(JSON.stringify(loaded.content).includes('data:image'), false);
});


test('owner management tools route under the verified account and require explicit bounded inputs', async t => {
  const { call, calls } = await fixture(t);
  const nookId = '00000000-0000-4000-8000-000000000001';
  const inviteId = '00000000-0000-4000-8000-000000000002';
  for (const [name, action, args, token] of [
    ['nooks_list', 'list_nooks', { offset: 50, limit: 50, joinedOnly: true }, 'reader'],
    ['nook_invites_list', 'list_invites', { nookId, offset: 50 }, 'reader'],
    ['nook_invite_revoke', 'revoke_invite', { nookId, inviteId }, 'writer'],
    ['nook_archive', 'archive_nook', { nookId }, 'writer'],
  ]) {
    const result = await call(name, args, token);
    assert.notEqual(result.isError, true);
    assert.deepEqual(calls.at(-1), { actor: `verified-${token}`, action, args });
  }
  const { validateCommunityAction, communityTools } = await import('../server/community-tools.mjs');
  assert.deepEqual(validateCommunityAction('list_nooks', { joinedOnly: false, offset: 50 }), { joinedOnly: false, offset: 50 });
  for (const joinedOnly of ['true', 1, null, {}, []]) assert.throws(() => validateCommunityAction('list_nooks', { joinedOnly }));
  assert.throws(() => validateCommunityAction('list_invites', { nookId, limit: 51 }));
  assert.throws(() => validateCommunityAction('revoke_invite', { nookId }));
  for (const name of ['nook_archive','nook_invite_revoke']) {
    const tool = communityTools.find(tool => tool.name === name);
    assert.equal(tool.annotations.destructiveHint, true);
    assert.equal(tool.annotations.idempotentHint, true);
  }
});
