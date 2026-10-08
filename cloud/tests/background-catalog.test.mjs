import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { ROOM_IDS } from '../server/space.mjs';
import { rewardCatalog } from '../server/room-progress.mjs';

const scenes = JSON.parse(await readFile(new URL('./fixtures/scenes.json', import.meta.url)));
const user = { id: 'catalog-student', scopes: ['notable.read', 'notable.write'] };

test('all 50 backgrounds can be selected, saved and reopened by the workspace engine', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const engine = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
  assert.equal(scenes.length, 50);
  for (const scene of scenes) {
    assert.ok(ROOM_IDS.includes(scene.id), scene.id);
    const selected = await engine.call('space_customize', { space: { room: scene.id, theme: scene.theme } }, user);
    assert.equal(selected.workspace.space.room, scene.id);
    const reopened = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
    assert.equal((await reopened.call('workspace_get', {}, user)).workspace.space.room, scene.id);
  }
});

test('new and retired nooks keep separate focus progress and rewards across restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nooks-progress-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.parse('2026-10-07T12:00:00Z');
  const clock = () => new Date(time);
  const engine = new StudyEngine(new WorkspaceStore(directory, { seeded: false, clock }), { clock });
  for (const room of ['night-campus', 'howls-moving-study', 'stardew-farmhouse']) {
    await engine.call('space_customize', { space: { room } }, user);
    const { focusSession } = await engine.call('focus_start', { minutes: 15 }, user);
    time += 900_000;
    await engine.call('focus_complete', { sessionId: focusSession.id }, user);
    await engine.call('room_reward_place', { roomId: room, rewardId: rewardCatalog.rooms[room].rewards[0].id, placed: true }, user);
  }
  const reopened = new StudyEngine(new WorkspaceStore(directory, { seeded: false, clock }), { clock });
  const { workspace } = await reopened.call('workspace_get', {}, user);
  for (const room of ['night-campus', 'howls-moving-study', 'stardew-farmhouse']) {
    assert.equal(workspace.roomProgress[room].focusSeconds, 900);
    assert.deepEqual(workspace.roomProgress[room].placed, [rewardCatalog.rooms[room].rewards[0].id]);
  }
  assert.equal(workspace.roomProgress['rainy-library'], undefined);
  await assert.rejects(reopened.call('room_reward_place', { roomId: 'howls-moving-study', rewardId: rewardCatalog.rooms['stardew-farmhouse'].rewards[0].id, placed: true }, user));
});
