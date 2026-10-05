import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
import { listTools, WORKSPACE_VIEWS } from '../server/tools.mjs';
import { rewardCatalog } from '../server/room-progress.mjs';

const alice = { id: 'chat-first-alice', scopes: ['notable.read', 'notable.write'] };
const bob = { id: 'chat-first-bob', scopes: ['notable.read', 'notable.write'] };
const reader = { ...alice, scopes: ['notable.read'] };
const note = { kind: 'note', title: 'Private title', subject: 'Biology', content: 'Private material must stay out of operational status.' };
async function fixture(t) {
  let time = Date.parse('2026-10-03T18:00:00Z');
  const clock = () => new Date(time);
  const directory = await mkdtemp(join(tmpdir(), 'nooks-chat-tools-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false, clock });
  return { store, engine: new StudyEngine(store, { clock }), advance: seconds => { time += seconds * 1000; } };
}

test('explicit navigation survives the model envelope without mutating the study workspace', async t => {
  const { engine, store } = await fixture(t);
  const { artifact } = await engine.call('artifact_save', { artifact: note }, alice);
  const before = await store.read(alice.id);
  for (const view of WORKSPACE_VIEWS) {
    const result = await engine.call('workspace_render', { view }, reader);
    assert.deepEqual(result.navigation, { view });
    assert.deepEqual(modelSafeResult({ structuredContent: result }).structuredContent.navigation, { view });
    assert.equal(result.artifact, undefined);
  }
  assert.deepEqual(await store.read(alice.id), before);
  assert.equal((await engine.call('workspace_render', {}, reader)).navigation, undefined);
  assert.equal((await engine.call('workspace_render', { artifactId: artifact.id }, reader)).navigation, undefined);
  assert.equal((await engine.call('workspace_render', { artifact: note })).navigation, undefined);
  assert.equal((await engine.call('workspace_get', { view: 'music' }, reader)).navigation, undefined);
  assert.deepEqual((await engine.call('workspace_render', { view: 'study' })).navigation, { view: 'study' });
});

test('navigation rejects ambiguous, invalid, and unscoped private requests', async t => {
  const { engine } = await fixture(t);
  const { artifact } = await engine.call('artifact_save', { artifact: note }, alice);
  for (const args of [
    { view: 'study', artifactId: artifact.id }, { view: 'study', artifact: note },
    { view: 'study', artifact: note, artifactId: artifact.id }, { view: 'study', artifact: null },
    { view: '' }, { view: 'settings' }, { view: null }, { view: ['study'] },
  ]) await assert.rejects(engine.call('workspace_render', args, reader), { code: 'INVALID_INPUT' });
  await assert.rejects(engine.call('workspace_render', { view: 'plan' }, { ...alice, scopes: ['notable.write'] }), { code: 'INSUFFICIENT_SCOPE' });
  await assert.rejects(engine.call('workspace_render', { artifactId: artifact.id }, bob), { code: 'NOT_FOUND' });
});

test('plan_get lets chat add or complete tasks while preserving every unrelated task', async t => {
  const { engine, store } = await fixture(t);
  await engine.call('artifact_save', { artifact: note }, alice);
  const saved = await engine.call('plan_save', { expectedRevision: (await engine.call('plan_get', {}, reader)).workspaceRevision, plan: { tasks: [
    { id: 'read', title: 'Read chapter', done: true, dueDate: '2026-10-06', subject: 'Biology' },
    { id: 'quiz', title: 'Practice quiz', done: false },
  ] } }, alice);
  const before = await store.read(alice.id);
  const current = await engine.call('plan_get', {}, reader);
  assert.deepEqual(current.plan, saved.plan);
  assert.equal(current.workspaceRevision, before.revision);
  assert.equal(current.workspace, undefined);
  assert.equal(JSON.stringify(current).includes(note.content), false);
  assert.deepEqual(await store.read(alice.id), before);
  const changed = await engine.call('plan_save', {
    expectedRevision: current.workspaceRevision,
    plan: { tasks: [...current.plan.tasks.map(task => task.id === 'quiz' ? { ...task, done: true } : task), { title: 'Review flashcards' }] },
  }, alice);
  assert.deepEqual(changed.plan.tasks[0], saved.plan.tasks[0]);
  assert.deepEqual(changed.plan.tasks[1], { ...saved.plan.tasks[1], done: true });
  assert.equal(changed.plan.tasks[2].title, 'Review flashcards');
  assert.deepEqual((await engine.call('plan_get', {}, bob)).plan, { tasks: [] });
});

test('concurrent plan merges cannot silently replace the winning edit', async t => {
  const { engine, store } = await fixture(t);
  await engine.call('plan_save', { expectedRevision: (await engine.call('plan_get', {}, reader)).workspaceRevision, plan: { tasks: [{ id: 'original', title: 'Original task' }] } }, alice);
  const current = await engine.call('plan_get', {}, reader);
  const edits = await Promise.allSettled(['Chat task', 'Other tab task'].map(title => engine.call('plan_save', {
    expectedRevision: current.workspaceRevision, plan: { tasks: [...current.plan.tasks, { title }] },
  }, alice)));
  assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
  const conflict = edits.find(result => result.status === 'rejected');
  assert.equal(conflict.reason.code, 'REVISION_CONFLICT');
  const winner = edits.find(result => result.status === 'fulfilled').value;
  assert.deepEqual((await store.read(alice.id)).plan, winner.plan);
  const latest = await engine.call('plan_get', {}, reader);
  await engine.call('plan_save', { expectedRevision: latest.workspaceRevision, plan: { tasks: [...latest.plan.tasks, { title: 'Merged retry' }] } }, alice);
  const merged = await engine.call('plan_get', {}, reader);
  assert.equal(merged.plan.tasks.length, 3);
  assert.deepEqual(merged.plan.tasks.slice(0, 2), winner.plan.tasks);
  await assert.rejects(engine.call('plan_save', { expectedRevision: -1, plan: { tasks: [] } }, alice), { code: 'INVALID_INPUT' });
  await assert.rejects(engine.call('plan_save', { plan: { tasks: [] } }, alice), { code: 'INVALID_INPUT' });
  assert.deepEqual((await store.read(alice.id)).plan, merged.plan);
});

test('study status exposes current timers and earned rewards without private content or another nook history', async t => {
  const { engine, store, advance } = await fixture(t);
  const { artifact } = await engine.call('artifact_save', { artifact: note }, alice);
  const { focusSession: completed } = await engine.call('focus_start', { minutes: 15 }, alice);
  advance(900);
  await engine.call('focus_complete', { sessionId: completed.id }, alice);
  const reward = rewardCatalog.rooms['rainy-library'].rewards[0];
  await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: reward.id, placed: true }, alice);
  const { focusSession } = await engine.call('focus_start', { minutes: 25, artifactId: artifact.id }, alice);
  advance(60);
  const before = await store.read(alice.id);
  const result = await engine.call('study_status_get', {}, reader);
  const status = result.studyStatus;
  assert.equal(status.nook.roomId, 'rainy-library');
  assert.equal(status.focusSession.id, focusSession.id);
  assert.equal(status.focusSession.artifactId, artifact.id);
  assert.equal(status.focusSession.activeSeconds, 60);
  assert.equal(status.focusSession.remainingSeconds, 1440);
  assert.equal(status.focusSession.state, 'running');
  assert.equal(status.focusSession.readyToComplete, false);
  assert.equal(status.roomProgress.focusSeconds, 900);
  assert.deepEqual(status.roomProgress.unlockedRewards, [{ id: reward.id, name: reward.name, minutes: 15, placed: true }]);
  assert.equal(status.roomProgress.nextReward.remainingSeconds, 1800);
  const visible = JSON.stringify(modelSafeResult({ structuredContent: result }).structuredContent);
  for (const secret of [note.content, note.title, completed.id, alice.id]) assert.equal(visible.includes(secret), false);
  assert.equal(result.workspace, undefined);
  assert.deepEqual(await store.read(alice.id), before);
  await engine.call('focus_update', { sessionId: focusSession.id, action: 'pause' }, alice);
  advance(3600);
  assert.equal((await engine.call('study_status_get', {}, reader)).studyStatus.focusSession.activeSeconds, 60);
  assert.equal((await engine.call('study_status_get', {}, reader)).studyStatus.focusSession.state, 'paused');
  await engine.call('space_customize', { space: { room: 'sakura-garden' } }, alice);
  const changed = (await engine.call('study_status_get', {}, reader)).studyStatus;
  assert.equal(changed.nook.roomId, 'sakura-garden');
  assert.equal(changed.focusSession.roomId, 'rainy-library');
  assert.equal(changed.roomProgress.focusSeconds, 0);
  assert.deepEqual(changed.roomProgress.unlockedRewards, []);
  assert.equal(JSON.stringify(changed.roomProgress).includes(reward.id), false);
  const other = (await engine.call('study_status_get', {}, bob)).studyStatus;
  assert.equal(other.focusSession, null);
  assert.equal(other.roomProgress.focusSeconds, 0);
});

test('operational reads require connected read permission and reject client-chosen identity or time', async t => {
  const { engine } = await fixture(t);
  const tools = listTools({ oauthConfigured: true });
  for (const name of ['plan_get', 'study_status_get']) {
    const descriptor = tools.find(tool => tool.name === name);
    assert.equal(descriptor.annotations.readOnlyHint, true);
    assert.equal(descriptor.annotations.destructiveHint, false);
    await assert.rejects(engine.call(name), { code: 'AUTH_REQUIRED' });
    await assert.rejects(engine.call(name, {}, { id: alice.id }), { code: 'INSUFFICIENT_SCOPE' });
    await assert.rejects(engine.call(name, {}, { ...alice, scopes: ['notable.write'] }), { code: 'INSUFFICIENT_SCOPE' });
    await assert.rejects(engine.call(name, { userId: alice.id }, bob), { code: 'INVALID_INPUT' });
    await assert.rejects(engine.call(name, { now: '2099-01-01' }, reader), { code: 'INVALID_INPUT' });
  }
});

test('chat appearance patches preserve saved artwork and unrelated settings', async t => {
  const { engine } = await fixture(t);
  const appearance = { name: 'My drawing', tagline: 'A quiet desk', theme: 'moonlight', room: 'castle-study', accent: '#b1a0d8', companion: 'none', layout: 'focused', decorations: [], backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' };
  await engine.call('space_customize', { space: appearance }, alice);
  const renamed = await engine.call('space_customize', { space: { name: 'Renamed nook' } }, alice);
  assert.deepEqual(renamed.space, { ...appearance, name: 'Renamed nook' });
  const recolored = await engine.call('space_customize', { space: { theme: 'lavender', accent: '#d7a0b1' } }, alice);
  assert.deepEqual(recolored.space, { ...renamed.space, theme: 'lavender', accent: '#d7a0b1' });
  assert.equal((await engine.call('study_status_get', {}, reader)).studyStatus.nook.customArtwork, true);
  const other = (await engine.call('study_status_get', {}, bob)).studyStatus;
  assert.equal(other.nook.name, 'My study nook');
  assert.equal(other.nook.customArtwork, false);
});

test('catalog scene selection and explicit artwork removal keep other appearance settings', async t => {
  const { engine } = await fixture(t);
  const appearance = { name: 'My drawing', theme: 'moonlight', room: 'castle-study', companion: 'none', layout: 'focused', backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' };
  const first = await engine.call('space_customize', { space: appearance }, alice);
  const selected = await engine.call('space_customize', { space: { room: 'sakura-garden' } }, alice);
  const { backgroundImage, ...rest } = first.space;
  assert.deepEqual(selected.space, { ...rest, room: 'sakura-garden' });
  assert.equal((await engine.call('study_status_get', {}, reader)).studyStatus.nook.roomId, 'sakura-garden');
  await engine.call('space_customize', { space: { backgroundImage } }, alice);
  const removed = await engine.call('space_customize', { space: { backgroundImage: '' } }, alice);
  assert.deepEqual(removed.space, selected.space);
  // Full editor objects omit an undefined image during JSON transport. The
  // included catalog room still makes the existing Remove artwork action work.
  await engine.call('space_customize', { space: { backgroundImage } }, alice);
  const editorRemoval = await engine.call('space_customize', { space: JSON.parse(JSON.stringify({ ...selected.space, backgroundImage: undefined })) }, alice);
  assert.deepEqual(editorRemoval.space, selected.space);
  const uploaded = await engine.call('space_customize', { space: { room: 'rainy-library', backgroundImage } }, alice);
  assert.equal(uploaded.space.backgroundImage, backgroundImage);
  assert.equal((await engine.call('study_status_get', {}, reader)).studyStatus.nook.roomId, 'custom');
});

test('invalid appearance patches fail atomically without replacing saved settings', async t => {
  const { engine, store } = await fixture(t);
  await engine.call('space_customize', { space: { name: 'Keep my nook', theme: 'moonlight', backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' } }, alice);
  const before = await store.read(alice.id);
  for (const space of [
    null, [], { unknown: 'setting' }, { name: '' }, { room: 'invented-scene' },
    { theme: 'invented-theme' }, { decorations: ['invented-decoration'] },
    { backgroundImage: false }, { backgroundImage: null }, { backgroundImage: 0 },
    { backgroundImage: 'data:image/svg+xml;base64,PHN2Zz4=' }, { backgroundImage: 'data:image/png;base64,YmFk' },
    JSON.parse('{"__proto__":{"backgroundImage":"bad"}}'),
  ]) {
    await assert.rejects(engine.call('space_customize', { space }, alice), { code: 'INVALID_INPUT' });
    assert.deepEqual(await store.read(alice.id), before);
  }
});
