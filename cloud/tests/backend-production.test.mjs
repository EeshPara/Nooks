import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestLimiter } from '../server/request-limiter.mjs';
import { StudyEngine } from '../server/engine.mjs';
import { NookCreator } from '../server/nook-creator.mjs';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { validateCommunityAction } from '../server/community-tools.mjs';
import { createWorkspace } from '../server/seed.mjs';
import { sha256 } from '../server/supabase-auth.mjs';
import { defaultSpace } from '../server/space.mjs';
import { modelSafeResult } from '../server/model-result.mjs';

const account = '00000000-0000-4000-8000-000000000001';
const nookId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';

test('request guard bounds token churn without evicting live per-token limits', () => {
  const consume = createRequestLimiter({ limit: 2, maxKeys: 2, windowMs: 60000 });
  assert.equal(consume('alice', 0).allowed, true);
  assert.equal(consume('alice', 1000).allowed, true);
  assert.deepEqual(consume('alice', 2000), { allowed: false, retryAfter: 58 });
  assert.equal(consume('bob', 3000).allowed, true);
  for (let index = 0; index < 1000; index++) assert.equal(consume(`churn-${index}`, 4000).allowed, false);
  assert.equal(consume('alice', 5000).allowed, false);
  assert.equal(consume('bob', 5000).allowed, true);
  assert.equal(consume('new-token', 60000).allowed, true);
  assert.equal(consume('bob', 61000).allowed, false);
  assert.equal(consume('bob', 63000).allowed, true);
  assert.equal(consume('new-token', 64000).allowed, true);
  assert.equal(consume('new-token', 65000).allowed, false);
});

test('private reads and writes require explicit permission before touching storage', async () => {
  const store = { read() { assert.fail('unauthorized read'); }, transact() { assert.fail('unauthorized write'); } };
  const engine = new StudyEngine(store);
  for (const [name, args] of [
    ['practice_checkpoint_get', { artifactId: 'private' }], ['artifact_get', { artifactId: 'private' }],
    ['library_search', {}], ['space_share_get', { shareId: requestId }],
    ['artifact_save', { artifact: { kind: 'note', title: 'Note', content: 'Private' } }],
    ['focus_start', {}], ['room_reward_place', {}],
  ]) await assert.rejects(engine.call(name, args, { id: account }), { code: 'INSUFFICIENT_SCOPE' });
  const creator = new NookCreator(store);
  for (const name of ['nook_drafts_list', 'nook_draft_get', 'nook_draft_save', 'nook_publish_commit']) {
    await assert.rejects(creator.call(name, {}, { id: account }), { code: 'INSUFFICIENT_SCOPE' });
  }
});

test('community adapter rejects malformed or unsupported writes before service RPC', async () => {
  const url = 'https://nooks-test.supabase.co', serviceKey = 'sb_secret_test';
  const identity = await createSitesIdentityResolver({ url, serviceKey, namespace: 'sites:test', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => new Response(JSON.stringify({ id: account })) })({ subject: 'verified-user' });
  const calls = [];
  const store = new SupabaseStore({ url, serviceKey, identity, fetchImpl: async (url, options) => { calls.push(JSON.parse(options.body)); return new Response('{}'); } });
  const validNook = { requestId, title: 'Study together', roomId: 'rainy-library', visibility: 'private' };
  for (const [action, args] of [
    ['join_nook', { nookId: 'not-a-uuid' }], ['heartbeat', { nookId, count: 1000000 }],
    ['nook_snapshot', { nookId, offset: 1.5 }], ['list_nooks', { limit: 51 }],
    ['update_profile', { displayName: 'a'.repeat(29), avatar: 0 }], ['update_profile', { displayName: 'Name', avatar: 8 }],
    ['update_profile', { displayName: ' ', avatar: 0 }], ['update_profile', { displayName: 'Name', avatar: '0' }],
    ['create_nook', { ...validNook, title: 'a'.repeat(55) }], ['create_nook', { ...validNook, description: 'a'.repeat(221) }],
    ['create_nook', { ...validNook, roomId: 'custom' }], ['create_nook', { ...validNook, visibility: undefined }],
    ['create_invite', { nookId, maxUses: 26 }], ['create_invite', { nookId, expiresInHours: '2' }],
    ['accept_invite', { token: 'z'.repeat(64) }], ['accept_invite', { tokenHash: 'a'.repeat(64) }],
  ]) await assert.rejects(store.community(action, args), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 0);
  await store.community('create_nook', { ...validNook, actor: nookId, accountId: nookId });
  assert.equal(calls[0].p_actor, account);
  assert.deepEqual(calls[0].p_args, validNook);
  assert.deepEqual(validateCommunityAction('list_nooks', { offset: 50, limit: 25 }), { offset: 50, limit: 25 });
});

test('unavailable artwork preserves owned references while notes, renames, drafts, and explicit removal remain usable', async () => {
  const url = 'https://nooks-test.supabase.co', serviceKey = 'sb_secret_test';
  const identity = await createSitesIdentityResolver({ url, serviceKey, namespace: 'sites:test', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => new Response(JSON.stringify({ id: account })) })({ subject: 'verified-user' });
  const ref = { path: `${account}/${await sha256(Uint8Array.from(atob('iVBORw0KGgo='), x => x.charCodeAt(0)))}`, mime: 'image/png' };
  const draftId = '00000000-0000-4000-8000-000000000004';
  for (const outcome of ['missing', 'redirect', 'network', 'corrupt']) {
    let record = createWorkspace('2026-10-04T00:00:00Z'), revision = 1;
    record.artifacts = []; record.space = { ...defaultSpace(), _storedBackground: ref };
    record.nookCreator = { schemaVersion: 1, publicationIntents: [], drafts: [{ id: draftId, title: 'Private scene', description: '', revision: 1, style: 'illustration', artworkMode: 'upload', visibility: 'private', space: { ...record.space }, createdAt: record.updatedAt, updatedAt: record.updatedAt }] };
    const fetchImpl = async (url, options) => {
      if (url.includes('/storage/')) {
        assert.equal(options.redirect, 'manual');
        if (outcome === 'network') throw new Error('Unavailable');
        return new Response(outcome === 'corrupt' ? 'broken bytes' : '', { status: outcome === 'missing' ? 404 : outcome === 'redirect' ? 307 : 200 });
      }
      if (url.endsWith('nooks_workspace_read')) return Response.json({ revision, workspace: record });
      const body = JSON.parse(options.body); assert.equal(body.p_expected_revision, revision);
      record = body.p_workspace; return Response.json({ committed: true, revision: ++revision });
    };
    const store = new SupabaseStore({ url, serviceKey, identity, fetchImpl });
    const engine = new StudyEngine(store);
    const read = await engine.call('workspace_get', {}, identity);
    assert.equal(read.workspace.artworkWarnings.length, 2);
    assert.deepEqual(read.workspace.space._storedBackground, ref);
    const saved = await engine.call('artifact_save', { artifact: { kind: 'note', title: 'Keep studying', content: 'Saved despite image outage.' } }, identity);
    assert.equal(saved.artifact.content, 'Saved despite image outage.');
    assert.deepEqual(record.space._storedBackground, ref);
    assert.equal(record.artworkWarnings, undefined);
    await engine.call('space_customize', { space: { name: 'Renamed nook' } }, identity);
    assert.deepEqual(record.space._storedBackground, ref);
    const started = await engine.call('focus_start', { minutes: 1 }, identity);
    assert.equal(started.focusSession.roomId, 'custom');
    const creator = new NookCreator(store);
    await creator.call('nook_draft_save', { draft: { ...record.nookCreator.drafts[0], title: 'Renamed scene' }, expectedRevision: 1 }, identity);
    assert.deepEqual(record.nookCreator.drafts[0].space._storedBackground, ref);
    await creator.call('nook_draft_delete', { draftId, expectedRevision: 2 }, identity);
    assert.equal(record.nookCreator.drafts.length, 0);
    await engine.call('space_customize', { space: { backgroundImage: '' } }, identity);
    assert.equal(record.space._storedBackground, undefined);
    assert.equal((await engine.call('workspace_get', {}, identity)).workspace.artworkWarnings, undefined);
  }
});

test('artwork hydration starts distinct images together and deduplicates identical owned references', async () => {
  const url = 'https://nooks-test.supabase.co', serviceKey = 'sb_secret_test';
  const identity = await createSitesIdentityResolver({ url, serviceKey, namespace: 'sites:test', trustedBoundary: 'sites-dispatcher', fetchImpl: async () => Response.json({ id: account }) })({ subject: 'verified-user' });
  const refs = ['a', 'b', 'c', 'd'].map(character => ({ path: `${account}/${character.repeat(64)}`, mime: 'image/png' }));
  const started = [], pending = [];
  const store = new SupabaseStore({ url, serviceKey, identity, fetchImpl: (url, options) => { started.push(url); assert.equal(options.redirect, 'manual'); return new Promise(resolve => pending.push(resolve)); } });
  const unpacking = store.unpack({ space: { _storedBackground: refs[0] }, nookCreator: { drafts: [...refs, refs[0]].map(ref => ({ space: { _storedBackground: ref } })) } });
  assert.equal(started.length, 4);
  for (const resolve of pending) resolve(new Response('', { status: 503 }));
  const result = await unpacking;
  assert.equal(result.artworkWarnings.length, 6);
  assert.deepEqual(result.space._storedBackground, refs[0]);
  assert.deepEqual(result.nookCreator.drafts.map(item => item.space._storedBackground), [...refs, refs[0]]);
});

test('draft-only renames preserve hydrated and unavailable artwork, while explicit replacement removes it', async () => {
  const url='https://nooks-test.supabase.co',serviceKey='sb_secret_test';
  const identity=await createSitesIdentityResolver({url,serviceKey,namespace:'sites:test',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>Response.json({id:account})})({subject:'verified-user'});
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5mIAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  const ref={path:`${account}/${await sha256(bytes)}`,mime:'image/png'},draftId='00000000-0000-4000-8000-000000000004';
  for(const available of [true,false])for(const replacement of [{space:{backgroundImage:''}},{artworkMode:'curated',space:{room:'midnight-train'}}]){
    let record=createWorkspace('2026-10-04T00:00:00Z'),revision=1;const storageMethods=[];
    const appearance={...defaultSpace(),room:'sakura-garden',theme:'lavender',accent:'#b1a0d8',layout:'focused',decorations:['stickers'],_storedBackground:ref};
    record.artifacts=[];record.nookCreator={schemaVersion:1,publicationIntents:[],drafts:[{id:draftId,title:'Private scene',description:'Keep this description',scenePrompt:'Keep this prompt',revision:1,style:'anime',artworkMode:'upload',visibility:'public',space:appearance,createdAt:record.updatedAt,updatedAt:record.updatedAt}]};
    const store=new SupabaseStore({url,serviceKey,identity,fetchImpl:async(url,options)=>{
      if(url.includes('/storage/')){storageMethods.push(options.method??'GET');return available?new Response(bytes):new Response(null,{status:503});}
      if(url.endsWith('nooks_workspace_read'))return Response.json({revision,workspace:record});
      const body=JSON.parse(options.body);assert.equal(body.p_expected_revision,revision);record=body.p_workspace;return Response.json({committed:true,revision:++revision});
    }});
    const creator=new NookCreator(store);
    const renamed=await creator.call('nook_draft_save',{draft:{id:draftId,title:'Renamed scene'},expectedRevision:1},identity);
    const saved=record.nookCreator.drafts[0];
    assert.deepEqual(saved.space._storedBackground,ref);assert.equal(saved.description,'Keep this description');assert.equal(saved.scenePrompt,'Keep this prompt');assert.equal(saved.style,'anime');assert.equal(saved.visibility,'public');
    for(const key of ['room','theme','accent','layout','decorations'])assert.deepEqual(saved.space[key],appearance[key]);
    assert.ok(!renamed.readiness.blockers.some(item=>item.code==='IMAGE_NOT_RECEIVED'));assert.equal(storageMethods.includes('POST'),false,'unchanged owned artwork does not reupload');
    await creator.call('nook_draft_save',{draft:{id:draftId,title:'Renamed scene',...replacement},expectedRevision:2},identity);
    assert.equal(record.nookCreator.drafts[0].space._storedBackground,undefined);assert.equal(record.nookCreator.drafts[0].space.backgroundImage,undefined);
    assert.equal(record.nookCreator.drafts[0].space.layout,'focused');
    if(replacement.artworkMode==='curated')assert.equal(record.nookCreator.drafts[0].space.room,'midnight-train');
  }
});

test('native recovery scope is stable, owner-bound, verified, and delivered only in UI metadata', async () => {
  const identities = await Promise.all([account, nookId, account].map(id => createSitesIdentityResolver({
    url: 'https://nooks-test.supabase.co', serviceKey: 'sb_secret_test', namespace: 'sites:test', trustedBoundary: 'sites-dispatcher',
    fetchImpl: async () => Response.json({ id }),
  })({ subject: `verified-${id}` })));
  const engine = new StudyEngine({ read: async () => createWorkspace('2026-10-04T00:00:00Z') });
  const results = [];
  for (const identity of identities) {
    const data = await engine.call('workspace_render', { view: 'study', recoveryScope: 'account:forged' }, identity);
    assert.equal(data.recoveryScope, `account:${identity.id}`);
    const result = modelSafeResult({ structuredContent: data, content: [{ type: 'text', text: 'Ready.' }] });
    assert.equal(result._meta.notableData.authenticated, true);
    assert.equal(result._meta.notableData.recoveryScope, `account:${identity.id}`);
    assert.equal(result.structuredContent.recoveryScope, undefined);
    assert.equal(JSON.stringify(result.structuredContent).includes(identity.id), false);
    results.push(result);
  }
  assert.equal(results[0]._meta.notableData.recoveryScope, results[2]._meta.notableData.recoveryScope);
  assert.notEqual(results[0]._meta.notableData.recoveryScope, results[1]._meta.notableData.recoveryScope);
  for (const user of [null, { id: account, scopes: ['notable.read'] }, { id: account, demo: true, scopes: ['notable.read'] }]) {
    assert.equal((await engine.call('workspace_get', { recoveryScope: `account:${account}` }, user)).recoveryScope, undefined);
  }
});
