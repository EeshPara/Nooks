import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { activeRoomId, rewardCatalog, PROGRESS_ROOM_IDS } from '../server/room-progress.mjs';
import { ROOM_IDS } from '../server/space.mjs';

const alice = { id: 'room-alice', scopes: ['notable.read', 'notable.write'] };
const bob = { id: 'room-bob', scopes: ['notable.read', 'notable.write'] };
async function fixture(t) {
  let time = Date.parse('2026-10-01T12:00:00Z');
  const clock = () => new Date(time);
  const directory = await mkdtemp(join(tmpdir(), 'nook-room-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false, clock });
  return { store, directory, engine: new StudyEngine(store, { clock }), clock, advance: seconds => { time += seconds * 1000; } };
}
const firstReward = room => rewardCatalog.rooms[room].rewards[0].id;

async function complete(engine, advance, minutes, seconds = minutes * 60, user = alice) {
  const started = await engine.call('focus_start', { minutes }, user);
  advance(seconds);
  return engine.call('focus_complete', { sessionId: started.focusSession.id }, user);
}

test('room catalog covers every curated room and custom artwork with unique milestones', () => {
  assert.equal(ROOM_IDS.length, 31);
  assert.equal(PROGRESS_ROOM_IDS.length, 32);
  const rewards = Object.values(rewardCatalog.rooms).flatMap(room => room.rewards);
  assert.equal(rewards.length, 128);
  assert.equal(new Set(rewards.map(reward => reward.id)).size, 128);
  for (const room of PROGRESS_ROOM_IDS) assert.deepEqual(rewardCatalog.rooms[room].rewards.map(reward => reward.minutes), [15, 45, 90, 180]);
  assert.equal(activeRoomId({ theme: 'sky' }), 'midnight-train');
  assert.equal(activeRoomId({ theme: 'lavender' }), 'sakura-garden');
  assert.equal(activeRoomId({ room: 'castle-study', backgroundImage: 'data:image/png;base64,image' }), 'custom');
});

test('focus credits only active seconds to its captured room; overrun and retries cannot inflate it', async t => {
  const { engine, advance } = await fixture(t);
  const started = await engine.call('focus_start', { minutes: 15 }, alice);
  assert.equal(started.focusSession.roomId, 'rainy-library');
  advance(400);
  await engine.call('focus_update', { sessionId: started.focusSession.id, action: 'pause' }, alice);
  advance(3600);
  await engine.call('space_customize', { space: { room: 'mosslight-dungeon' } }, alice);
  await engine.call('focus_update', { sessionId: started.focusSession.id, action: 'resume' }, alice);
  advance(501);
  const calls = await Promise.all([1, 2, 3].map(() => engine.call('focus_complete', { sessionId: started.focusSession.id, roomId: 'mosslight-dungeon', focusSeconds: 999999 }, alice)));
  for (const result of calls) {
    assert.deepEqual(result.workspace.roomProgress['rainy-library'], { focusSeconds: 900, sessions: 1, practices: 0, placed: [] });
    assert.equal(result.workspace.roomProgress['mosslight-dungeon'], undefined);
  }
  assert.equal(calls.filter(result => result.duplicate).length, 2);
  assert.equal((await engine.call('workspace_get', {}, bob)).workspace.roomProgress['rainy-library'], undefined);
  await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: firstReward('rainy-library'), placed: true }, alice);
});

test('unlock boundary uses real seconds; cancelled focus and client counters cannot unlock rewards', async t => {
  const { engine, advance } = await fixture(t);
  const early = await complete(engine, advance, 15, 899);
  assert.equal(early.focusSession.xp, 0);
  assert.equal(early.workspace.roomProgress['rainy-library'].focusSeconds, 899);
  const args = { roomId: 'rainy-library', rewardId: firstReward('rainy-library'), placed: true, focusSeconds: 900 };
  await assert.rejects(engine.call('room_reward_place', args, alice), { code: 'REWARD_LOCKED' });
  const start = await engine.call('focus_start', { minutes: 1 }, alice);
  advance(500);
  await engine.call('focus_update', { sessionId: start.focusSession.id, action: 'cancel' }, alice);
  await assert.rejects(engine.call('focus_complete', { sessionId: start.focusSession.id }, alice), { code: 'NOT_FOUND' });
  assert.equal((await engine.call('workspace_get', {}, alice)).workspace.roomProgress['rainy-library'].focusSeconds, 899);
  await complete(engine, advance, 1, 1);
  const unlocked = await engine.call('room_reward_place', args, alice);
  assert.deepEqual(unlocked.workspace.roomProgress['rainy-library'].placed, [args.rewardId]);
  assert.equal(unlocked.workspace.stats.focusMinutes, 15); // Partial completed minutes accumulate honestly.
});

test('placed rewards obey ownership, catalog pairing and the three-item limit across restart', async t => {
  const { engine, advance, directory, clock } = await fixture(t);
  await complete(engine, advance, 180);
  const rewards = rewardCatalog.rooms['rainy-library'].rewards;
  for (const reward of rewards.slice(0, 3)) await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: reward.id, placed: true }, alice);
  await assert.rejects(engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[3].id, placed: true }, alice), { code: 'ROOM_FULL' });
  // Retrying an already-equipped item at capacity is harmless.
  await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[0].id, placed: true }, alice);
  await assert.rejects(engine.call('room_reward_place', { roomId: 'mosslight-dungeon', rewardId: rewards[0].id, placed: true }, alice), /does not belong/);
  await assert.rejects(engine.call('room_reward_place', { roomId: 'moonstone-annex', rewardId: rewards[0].id, placed: true }, alice), /Invalid study nook/);
  await assert.rejects(engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[0].id, placed: true }, bob), { code: 'REWARD_LOCKED' });
  await assert.rejects(engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[0].id, placed: false }, { id: alice.id, scopes: ['notable.read'] }), { code: 'INSUFFICIENT_SCOPE' });
  await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[0].id, placed: false }, alice);
  const saved = await engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[3].id, placed: true }, alice);
  const restarted = new StudyEngine(new WorkspaceStore(directory, { seeded: false, clock }), { clock });
  assert.deepEqual((await restarted.call('workspace_get', {}, alice)).workspace.roomProgress, saved.workspace.roomProgress);
  const shared = await engine.call('space_share', { includeProgress: true }, alice);
  assert.equal(shared.share.roomProgress, undefined); // No private per-room history is automatically published.
  assert.deepEqual(shared.share.roomDisplay, { roomId: 'rainy-library', placed: [rewards[1].id, rewards[2].id, rewards[3].id] });
  assert.equal(shared.share.roomDisplay.focusSeconds, undefined);
  const copied = await engine.call('space_customize', { space: shared.share.space }, bob);
  assert.deepEqual(copied.workspace.roomProgress, {}); // A shared appearance template grants no rewards.
  await assert.rejects(engine.call('room_reward_place', { roomId: 'rainy-library', rewardId: rewards[3].id, placed: true }, bob), { code: 'REWARD_LOCKED' });
});

test('practice evidence credits the originating room once per session without inflating focus time', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: { id: 'quiz', kind: 'quiz', title: 'Practice', subject: 'Study', questions: [{ id: 'q', prompt: 'One plus one?', answer: '2' }] } }, alice);
  await engine.call('space_customize', { space: { room: 'mosslight-dungeon' } }, alice);
  const args = { artifactRevision: 1, artifactId: 'quiz', sessionId: 'practice-1', roomId: 'castle-study', answers: { q: '2' }, durationSeconds: 9999, xp: 99999 };
  const initial = await engine.call('progress_record', args, alice);
  assert.equal(initial.progressEvent.roomId, 'castle-study');
  assert.deepEqual(initial.workspace.roomProgress['castle-study'], { focusSeconds: 0, sessions: 0, practices: 1, placed: [] });
  const retry = await engine.call('progress_record', { ...args, roomId: 'mosslight-dungeon' }, alice);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.workspace.roomProgress['castle-study'].practices, 1);
  const second = await engine.call('progress_record', { ...args, sessionId: 'practice-2' }, alice);
  assert.equal(second.progressEvent.xp, 0);
  assert.equal(second.workspace.roomProgress['castle-study'].practices, 2);
  const empty = await engine.call('progress_record', { ...args, kind: 'exam', sessionId: 'empty', answers: {} }, alice);
  assert.equal(empty.progressEvent.score, 0);
  assert.equal(empty.progressEvent.xp, 0);
  assert.equal(empty.workspace.roomProgress['castle-study'].practices, 2);
  await assert.rejects(engine.call('progress_record', { ...args, kind: 'sprint', sessionId: 'empty-sprint', answers: {} }, alice), /at least one/);
  await assert.rejects(engine.call('progress_record', { ...args, sessionId: 'invalid', roomId: 'fake' }, alice), /Invalid study nook/);
});

test('legacy active sessions bind once during hydration and receive no retroactive room credit', async t => {
  const { store, engine, advance } = await fixture(t);
  await store.transact(alice.id, workspace => {
    delete workspace.roomProgress;
    workspace.space = { theme: 'sky' };
    workspace.focusSessions.push({ id: 'old-complete', startedAt: '2026-09-30T12:00:00Z', completedAt: '2026-09-30T12:25:00Z', targetMinutes: 25, minutes: 25, xp: 50 });
    workspace.focusSessions.push({ id: 'old-active', startedAt: '2026-10-01T11:50:00Z', targetMinutes: 25, pausedMilliseconds: 0 });
    return {};
  });
  const hydrated = await engine.call('workspace_get', {}, { id: alice.id, scopes: ['notable.read'] });
  assert.equal(hydrated.workspace.focusSessions[1].roomId, 'midnight-train');
  assert.equal(hydrated.workspace.focusSessions[1].roomCreditOffsetMilliseconds, 600000);
  assert.deepEqual(hydrated.workspace.roomProgress, {});
  assert.equal((await store.read(alice.id)).focusSessions[1].roomId, 'midnight-train');
  await engine.call('space_customize', { space: { room: 'castle-study' } }, alice);
  advance(15 * 60);
  const finished = await engine.call('focus_complete', { sessionId: 'old-active' }, alice);
  assert.deepEqual(finished.workspace.roomProgress['midnight-train'], { focusSeconds: 900, sessions: 1, practices: 0, placed: [] });
  assert.equal(finished.workspace.roomProgress['castle-study'], undefined);
  assert.equal(finished.workspace.stats.focusMinutes, 50);
});
