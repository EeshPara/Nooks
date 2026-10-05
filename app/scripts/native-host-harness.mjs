/** Local-only fault harness. No hosted identities, credentials, or user data. */
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkspaceStore } from '../server/store.mjs';
import { StudyEngine } from '../server/engine.mjs';
import { NookCreator, creatorToolNames } from '../server/nook-creator.mjs';
import { isCommunityTool, invokeCommunity, validateCommunityAction } from '../server/community-tools.mjs';
import { ROOM_IDS } from '../server/space.mjs';
import { InputError } from '../server/errors.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { modelSafeResult, widgetHtml } from '../server/index.mjs';

const directory = await mkdtemp(join(tmpdir(), 'nooks-host-fixture-'));
const store = new WorkspaceStore(directory, { seeded: false });
const engine = new StudyEngine(store);
const owners = {};
for (const [label, suffix] of [['A', '1'], ['B', '2']]) {
  // An injected transport issues the same verified-identity marker as the real
  // adapter. It never contacts Supabase and cannot accept a supplied identity.
  owners[label] = await createSitesIdentityResolver({
    url: 'https://fixture.invalid', serviceKey: 'sb_secret_local_fixture_only',
    namespace: 'sites:local-fault-harness', trustedBoundary: 'sites-dispatcher',
    fetchImpl: async () => Response.json({ id: `00000000-0000-4000-8000-00000000000${suffix}` }),
  })({ subject: `synthetic-owner-${label}` });
  for (const artifact of [
    { id: 'fixture-note', kind: 'note', title: `Account ${label} recovery note`, content: `Only account ${label} owns this synthetic note.` },
    { id: 'fixture-quiz', kind: 'quiz', title: `Account ${label} recovery quiz`, questions: [
      { id: 'q1', prompt: `Account ${label}: which number is even?`, options: ['Two', 'Three', 'Five'], correctIndex: 0, explanation: 'Two is divisible by two.' },
      { id: 'q2', prompt: 'Which number comes after two?', options: ['One', 'Three', 'Four'], correctIndex: 1, explanation: 'Three follows two.' },
      { id: 'q3', prompt: 'Which is the smallest?', options: ['Eight', 'One', 'Nine'], correctIndex: 1, explanation: 'One is smallest.' },
    ] },
  ]) await engine.call('artifact_save', { artifact }, owners[label]);
}

/** Deliberately simulated community storage, never a Supabase/SQL acceptance test.
 * Seeds enough rows for actual widget pagination and owner management controls.
 * No fixture names, members, invitation codes, or activity represent real people.
 */
function createCommunityFixture() {
  const rooms = new Map(), profiles = new Map(), invitations = new Map();
  const startedAt = Date.now(), seedEpoch = Date.parse('2026-10-01T12:00:00Z');
  const uuid = (group, index) => `${group}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const ownerRoomId = uuid('1', 1), privateRoomId = uuid('1', 55);
  let nextRoom = 56, nextInvite = 1000;
  for (const [label, owner] of Object.entries(owners)) profiles.set(owner.id, { id: owner.id, displayName: `Simulated account ${label}`, avatar: label === 'A' ? 0 : 1 });
  function addMember(room, actor, role = 'member') {
    const previous = room.members.get(actor);
    room.members.set(actor, { id: actor, role, joinedAt: previous?.joinedAt ?? new Date().toISOString(), lastSeen: Date.now() });
  }
  for (let index = 1; index <= 55; index++) {
    const owner = index === 1 || index === 55 ? owners.A.id : uuid('3', index);
    if (!profiles.has(owner)) profiles.set(owner, { id: owner, displayName: `Simulated host ${String(index).padStart(2, '0')}`, avatar: index % 8 });
    const room = { id: uuid('1', index), owner, requestId: uuid('4', index), title: index === 55 ? 'Simulated older private nook' : `Simulated ${index === 1 ? 'owner ' : ''}nook ${String(index).padStart(2, '0')}`, description: 'Disposable local community fixture. No real members or hosted activity.', roomId: ROOM_IDS[(index - 1) % ROOM_IDS.length], visibility: index === 55 ? 'private' : 'public', createdAt: new Date(seedEpoch - index * 60_000).toISOString(), archivedAt: null, members: new Map() };
    addMember(room, owner, 'owner');
    if (index === 1) addMember(room, owners.B.id);
    if (index === 2) addMember(room, owners.A.id);
    rooms.set(room.id, room);
  }
  // Metadata covers all invitation statuses and a second page. Seeded codes are
  // unavailable; only a newly created fixture invitation returns its test token.
  for (const nookId of [ownerRoomId, privateRoomId]) for (let index = 1; index <= 55; index++) {
    const serial = (nookId === ownerRoomId ? 0 : 100) + index;
    const id = uuid('2', serial);
    invitations.set(id, { id, nookId, expiresAt: new Date(startedAt + (index % 4 === 0 ? -1 : 24) * 3_600_000).toISOString(), uses: index % 4 === 1 ? 1 : 0, maxUses: 1, revokedAt: index % 4 === 2 ? new Date(seedEpoch).toISOString() : null, createdAt: new Date(seedEpoch - index * 60_000).toISOString(), usedBy: new Set() });
  }
  const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const online = member => member.lastSeen > Date.now() - 90_000;
  function summary(room, actor) {
    return { id: room.id, title: room.title, description: room.description, roomId: room.roomId, visibility: room.visibility, createdAt: room.createdAt, joined: room.members.has(actor), role: room.members.get(actor)?.role ?? null, memberCount: room.members.size, onlineCount: [...room.members.values()].filter(online).length };
  }
  function page(items, args, key) {
    const offset = args.offset ?? 0, limit = args.limit ?? 50, hasMore = items.length > offset + limit;
    return { [key]: items.slice(offset, offset + limit), offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null };
  }
  function inviteStatus(invite) {
    const { id, nookId, expiresAt, uses, maxUses, revokedAt } = invite;
    return { id, nookId, expiresAt, uses, maxUses, revokedAt };
  }
  const denied = message => { throw new InputError(message, 'FORBIDDEN'); };
  async function cancelFocus(nookId, actor) {
    for (const owner of Object.values(owners).filter(owner => !actor || owner.id === actor)) {
      const workspace = await store.read(owner.id);
      if (!workspace.focusSessions.some(session => session.nookId === nookId && !session.completedAt && !session.cancelledAt)) continue;
      await store.transact(owner.id, current => {
        for (const session of current.focusSessions) if (session.nookId === nookId && !session.completedAt && !session.cancelledAt) session.cancelledAt = new Date().toISOString();
        return {};
      });
    }
  }
  async function community(actor, action, input) {
    const args = validateCommunityAction(action, input), now = new Date().toISOString();
    const result = await (async () => {
      if (action === 'list_nooks') return page([...rooms.values()].filter(room => !room.archivedAt && (room.visibility === 'public' || room.members.has(actor)) && (!args.joinedOnly || room.members.has(actor))).sort(newestFirst).map(room => summary(room, actor)), args, 'nooks');
      if (action === 'update_profile') { const profile = { id: actor, displayName: args.displayName, avatar: args.avatar }; profiles.set(actor, profile); return { profile }; }
      if (action === 'create_nook') {
        const previous = [...rooms.values()].find(room => room.owner === actor && room.requestId === args.requestId);
        if (previous) return { nook: summary(previous, actor), duplicate: true };
        if ([...rooms.values()].filter(room => room.owner === actor && !room.archivedAt).length >= 50) throw new InputError('Nook limit reached.', 'STORAGE_FULL');
        const room = { ...args, id: uuid('1', nextRoom++), description: args.description ?? '', owner: actor, createdAt: now, archivedAt: null, members: new Map() };
        addMember(room, actor, 'owner'); rooms.set(room.id, room); return { nook: summary(room, actor) };
      }
      if (action === 'accept_invite') {
        const invite = [...invitations.values()].find(invite => invite.token === args.token);
        if (!invite || invite.revokedAt || Date.parse(invite.expiresAt) <= Date.now()) denied('Invite is expired or unavailable.');
        const room = rooms.get(invite.nookId);
        if (!room || room.archivedAt) denied('Nook unavailable.');
        if (invite.usedBy.has(actor) && room.members.has(actor)) return { nookId: room.id, joined: true, duplicate: true };
        if (invite.uses >= invite.maxUses) denied('Invite has reached its limit.');
        if (!room.members.has(actor)) { addMember(room, actor); invite.uses++; invite.usedBy.add(actor); }
        return { nookId: room.id, joined: true };
      }
      const room = rooms.get(args.nookId);
      if (!room) denied('Nook unavailable.');
      if (room.archivedAt) {
        if (action === 'archive_nook' && room.owner === actor) return { nookId: room.id, archived: true, duplicate: true };
        denied('Nook unavailable.');
      }
      if (action === 'join_nook') {
        if (!room.members.has(actor) && room.visibility !== 'public') denied('An invite is required for this nook.');
        addMember(room, actor, room.owner === actor ? 'owner' : 'member'); return { nookId: room.id, joined: true };
      }
      if (!room.members.has(actor)) denied('Join this nook before accessing its members.');
      if (action === 'leave_nook') {
        if (room.owner === actor) denied('The owner must archive the nook instead of leaving.');
        room.members.delete(actor); await cancelFocus(room.id, actor); return { nookId: room.id, joined: false };
      }
      if (action === 'heartbeat') { room.members.get(actor).lastSeen = Date.now(); return { nookId: room.id, onlineCount: summary(room, actor).onlineCount, observedAt: now }; }
      if (action === 'nook_snapshot') {
        const members = [...room.members.values()].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)).map(member => ({ ...profiles.get(member.id), role: member.role, online: online(member), focusMinutes: 0 }));
        const workspace = await store.read(actor);
        return { nook: summary(room, actor), members: page(members, args, 'members').members, memberCount: members.length, onlineCount: members.filter(member => member.online).length, offset: args.offset ?? 0, limit: args.limit ?? 50, leaderboard: members.slice(0, 50).map(({ id, displayName, avatar, focusMinutes }, index) => ({ id, displayName, avatar, focusMinutes, rank: index + 1 })), focusSession: workspace.focusSessions.find(session => session.nookId === room.id && !session.completedAt && !session.cancelledAt) ?? null };
      }
      if (room.owner !== actor) denied('Only the nook owner can manage this nook.');
      if (action === 'list_invites') return page([...invitations.values()].filter(invite => invite.nookId === room.id).sort(newestFirst).map(inviteStatus), args, 'invites');
      if (action === 'create_invite') {
        const serial = nextInvite++, id = uuid('2', serial), token = serial.toString(16).padStart(64, '0');
        const invite = { id, nookId: room.id, expiresAt: new Date(Date.now() + (args.expiresInHours ?? 24) * 3_600_000).toISOString(), maxUses: args.maxUses ?? 1, uses: 0, revokedAt: null, createdAt: now, token, usedBy: new Set() };
        invitations.set(id, invite); return { invite: { id, nookId: room.id, expiresAt: invite.expiresAt, token } };
      }
      if (action === 'revoke_invite') { const invite = invitations.get(args.inviteId); if (invite?.nookId !== room.id) return { revoked: false }; invite.revokedAt = now; return { revoked: true }; }
      if (action === 'archive_nook') { room.archivedAt = now; room.members.clear(); await cancelFocus(room.id); return { nookId: room.id, archived: true }; }
      throw new InputError('Unsupported simulated community action.');
    })();
    return { simulated: true, authenticated: true, ...result };
  }
  return { community, ownerRoomId, privateRoomId, inspect: actor => ({ simulated: true, ownerRoomId, privateRoomId, visibleNooks: [...rooms.values()].filter(room => !room.archivedAt && (room.visibility === 'public' || room.members.has(actor))).map(room => summary(room, actor)), archived: [...rooms.values()].filter(room => room.archivedAt).map(room => ({ id: room.id, memberCount: room.members.size })) }) };
}
const communityFixture = createCommunityFixture();
const adapters = Object.fromEntries(Object.entries(owners).map(([label, owner]) => [label, { read: store.read.bind(store), transact: store.transact.bind(store), community: (action, args) => communityFixture.community(owner.id, action, args) }]));
const creators = Object.fromEntries(Object.entries(adapters).map(([label, adapter]) => [label, new NookCreator(adapter)]));

if (process.argv.includes('--self-test')) {
  const { default: assert } = await import('node:assert/strict');
  try {
  const call = (owner, name, args = {}) => invokeCommunity(adapters[owner], name, args);
  const first = await call('A', 'nooks_list');
  assert.equal(first.nooks.length, 50); assert.equal(first.hasMore, true); assert.equal(first.nextOffset, 50);
  const second = await call('A', 'nooks_list', { offset: 50 });
  assert.equal(second.nooks.length, 5); assert.equal(second.hasMore, false); assert.equal(second.nooks.at(-1).id, communityFixture.privateRoomId);
  assert.equal((await call('A', 'nooks_list', { joinedOnly: true })).nooks.length, 3);
  assert.equal((await call('B', 'nooks_list', { offset: 50 })).nooks.length, 4);
  await assert.rejects(call('B', 'nook_join', { nookId: communityFixture.privateRoomId }), /invite is required/);
  await assert.rejects(call('B', 'nook_invites_list', { nookId: communityFixture.ownerRoomId }), /Only the nook owner/);
  const invites = await call('A', 'nook_invites_list', { nookId: communityFixture.privateRoomId });
  assert.equal(invites.invites.length, 50); assert.equal(invites.hasMore, true); assert.ok(invites.invites.every(invite => !Object.hasOwn(invite, 'token')));
  assert.equal((await call('A', 'nook_invites_list', { nookId: communityFixture.privateRoomId, offset: 50 })).invites.length, 5);
  const created = await call('A', 'nook_invite_create', { nookId: communityFixture.privateRoomId });
  assert.match(created.invite.token, /^[a-f0-9]{64}$/);
  assert.equal((await call('B', 'nook_invite_accept', { token: created.invite.token })).joined, true);
  assert.equal((await call('B', 'nook_invite_accept', { token: created.invite.token })).duplicate, true);
  await call('A', 'nook_invite_revoke', { nookId: communityFixture.privateRoomId, inviteId: created.invite.id });
  assert.equal((await call('B', 'nook_snapshot', { nookId: communityFixture.privateRoomId })).nook.role, 'member');
  assert.equal((await call('A', 'nook_snapshot', { nookId: communityFixture.privateRoomId })).nook.role, 'owner');
  await call('A', 'nook_presence', { nookId: communityFixture.privateRoomId });
  await engine.call('focus_start', { minutes: 1, nookId: communityFixture.privateRoomId }, owners.B);
  await call('A', 'nook_archive', { nookId: communityFixture.privateRoomId });
  assert.equal((await call('A', 'nook_archive', { nookId: communityFixture.privateRoomId })).duplicate, true);
  assert.equal(communityFixture.inspect(owners.A.id).archived[0].memberCount, 0);
  assert.ok((await store.read(owners.B.id)).focusSessions[0].cancelledAt);
  await assert.rejects(call('B', 'nook_snapshot', { nookId: communityFixture.privateRoomId }), /unavailable/);
  await assert.rejects(call('A', 'nooks_list', { limit: 51 }), /limit must be/);
  const request = { requestId: '90000000-0000-4000-8000-000000000001', title: 'Simulated new nook', roomId: ROOM_IDS[0], visibility: 'private' };
  const made = await call('A', 'nook_create', request);
  assert.equal((await call('A', 'nook_create', request)).nook.id, made.nook.id);
  assert.equal((await call('A', 'nook_snapshot', { nookId: made.nook.id })).nook.role, 'owner');
  const publicId = first.nooks[2].id;
  await call('B', 'nook_join', { nookId: publicId });
  await call('B', 'profile_update', { displayName: 'Simulated chosen name', avatar: 7 });
  assert.equal((await call('B', 'nook_snapshot', { nookId: publicId })).members.find(member => member.id === owners.B.id).displayName, 'Simulated chosen name');
  await call('B', 'nook_leave', { nookId: publicId });
  await assert.rejects(call('B', 'nook_snapshot', { nookId: publicId }), /Join this nook/);
  const saved = await creators.A.call('nook_draft_save', { draft: { title: 'Simulated curated publication', space: { room: ROOM_IDS[0] }, artworkMode: 'curated' }, expectedRevision: 0 }, owners.A);
  await assert.rejects(creators.B.call('nook_draft_get', { draftId: saved.draft.id }, owners.B), /not found/);
  const reviewed = await creators.A.call('nook_publish_prepare', { draftId: saved.draft.id, expectedRevision: saved.draft.revision, requestId: '90000000-0000-4000-8000-000000000002', visibility: 'private', reviewed: true }, owners.A);
  const published = await creators.A.call('nook_publish_commit', { intentId: reviewed.publication.id, confirmed: true }, owners.A);
  assert.equal((await call('A', 'nook_snapshot', { nookId: published.nookId })).nook.title, 'Simulated curated publication');
  assert.equal((await creators.A.call('nook_publish_commit', { intentId: reviewed.publication.id, confirmed: true }, owners.A)).nookId, published.nookId);
  process.stdout.write('PASS: simulated directory, private membership, owner authorization, invitation pagination/create/accept/revoke, archive cleanup, profile/join/leave, validation, idempotent create and real creator dispatch. No hosted backend tested.\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
  process.exit(0);
}
const faults = { checkpoints: false, notes: false, workspace: false };
const counts = {};
const widgetFile = process.argv[2];
const html = widgetFile ? await readFile(resolve(widgetFile), 'utf8') : await widgetHtml(resolve('dist'), { assetOrigin: 'https://nooks-study-space.vercel.app' });
const hostHtml = await readFile(new URL('./native-host-harness.html', import.meta.url), 'utf8');
const server = createServer(async (request, response) => {
  const expectedHost = `127.0.0.1:${server.address().port}`;
  const send = (status, value, type = 'application/json') => {
    response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(type === 'application/json' ? JSON.stringify(value) : value);
  };
  if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== `http://${expectedHost}`)) return send(403, { error: 'Local harness origin required.' });
  const url = new URL(request.url, `http://${expectedHost}`);
  const path = url.pathname;
  if (request.method === 'GET' && path === '/') return send(200, hostHtml, 'text/html');
  if (request.method === 'GET' && path === '/widget') {
    if (url.searchParams.get('staleA') === '1') {
      const data = await engine.call('workspace_render', { artifactId: 'fixture-note' }, owners.A);
      data.workspace.backend = 'supabase'; data.workspace.revision = 999;
      const result = modelSafeResult({ structuredContent: data });
      const initial = JSON.stringify({ toolOutput: result.structuredContent, toolResponseMetadata: result._meta }).replace(/</g, '\\u003c');
      return send(200, html.replace('<head>', `<head><script>window.openai=${initial}</script>`), 'text/html');
    }
    return send(200, html, 'text/html');
  }
  if (request.method !== 'POST' || !['/rpc', '/control', '/state'].includes(path)) return send(404, { error: 'Not found.' });
  try {
    let body = '';
    for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 1048576) return send(413, { error: 'Fixture request too large.' }); }
    const input = JSON.parse(body);
    if (path === '/control') {
      if (!Object.hasOwn(faults, input.fault) || typeof input.enabled !== 'boolean') return send(400, { error: 'Unknown fault.' });
      faults[input.fault] = input.enabled;
      return send(200, { faults });
    }
    if (!Object.hasOwn(owners, input.owner)) return send(400, { error: 'Choose synthetic owner A or B.' });
    if (path === '/state') {
      const workspace = await store.read(owners[input.owner].id);
      return send(200, { owner: input.owner, faults, counts, workspace, community: communityFixture.inspect(owners[input.owner].id) });
    }
    const { name, args = {} } = input;
    if (typeof name !== 'string' || name.length > 100) return send(400, { error: 'Invalid fixture tool.' });
    counts[name] = (counts[name] || 0) + 1;
    if ((faults.checkpoints && name === 'practice_checkpoint_save') || (faults.notes && name === 'artifact_save') || (faults.workspace && name === 'workspace_get')) {
      return send(200, { isError: true, structuredContent: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Simulated connection failure. Your server fixture is unchanged.' } }, content: [{ type: 'text', text: 'Simulated connection failure.' }] });
    }
    const data = isCommunityTool(name) ? await invokeCommunity(adapters[input.owner], name, args)
      : creatorToolNames.has(name) ? await creators[input.owner].call(name, args, owners[input.owner])
      : await engine.call(name, args, owners[input.owner]);
    // Exercise the account-backed UI path using local fixtures. This marker is
    // explicitly simulated, not evidence of an actual Supabase connection.
    if (data.workspace) data.workspace.backend = 'supabase';
    return send(200, modelSafeResult({ structuredContent: data, content: [{ type: 'text', text: 'Synthetic fixture response.' }] }));
  } catch (error) {
    return send(200, { isError: true, structuredContent: { error: { code: error.code || 'HARNESS_ERROR', message: error.message } }, content: [{ type: 'text', text: error.message }] });
  }
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`SIMULATED HOST: http://127.0.0.1:${server.address().port}/\nOnly disposable synthetic fixtures. 55 local community fixtures for A; owner nook ${communityFixture.ownerRoomId}; older private nook ${communityFixture.privateRoomId}. No hosted backend or native-host verification.\n`));
let closing = false;
async function close() {
  if (closing) return; closing = true;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', close); process.on('SIGTERM', close);
