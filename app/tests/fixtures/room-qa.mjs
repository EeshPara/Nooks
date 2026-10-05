/** ISOLATED VISUAL TEST FIXTURE. Never reads or writes the real .notable-data directory. */
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { WorkspaceStore } from '../../server/store.mjs';
import { StudyEngine } from '../../server/engine.mjs';
import { createNotableServer } from '../../server/index.mjs';

const existing = process.env.NOOK_QA_DATA_DIRECTORY;
const directory = existing ? await realpath(existing) : await mkdtemp(join(tmpdir(), 'nook-isolated-room-qa-'));
// Resuming a fixture may never target the student's normal storage, even accidentally.
if (dirname(await realpath(directory)) !== await realpath(tmpdir()) || !/^nook-isolated-room-qa-[A-Za-z0-9]+$/.test(basename(directory))) throw new Error('QA data must be a dedicated temporary fixture directory.');
let controlledTime = Date.now();
const clock = () => new Date(controlledTime);
const user = { id: 'notable-local-demo', demo: true, scopes: ['notable.read', 'notable.write'] };
const store = new WorkspaceStore(directory, { seeded: true, clock });
const engine = new StudyEngine(store, { clock, shareBaseUrl: 'http://127.0.0.1:8788' });
const originalSpace = (await engine.call('workspace_get', {}, user)).workspace.space;
for (const [roomId, requiredSeconds] of [['castle-study', 10800], ['brooklyn-loft', 900]]) {
  const state = (await engine.call('workspace_get', {}, user)).workspace;
  const missing = Math.max(0, requiredSeconds - (state.roomProgress[roomId]?.focusSeconds ?? 0));
  if (!missing) continue;
  const active = state.focusSessions.find(session => !session.completedAt && !session.cancelledAt);
  if (active) await engine.call('focus_update', { sessionId: active.id, action: 'cancel' }, user);
  await engine.call('space_customize', { space: { ...originalSpace, name: 'QA fixture · test earned room', room: roomId, theme: 'moonlight', tagline: 'Isolated visual test data, not a student’s earned progress.' } }, user);
  controlledTime = Date.now() - missing * 1000;
  const focus = await engine.call('focus_start', { minutes: Math.ceil(missing / 60), subject: 'Controlled-clock test' }, user);
  controlledTime += missing * 1000;
  await engine.call('focus_complete', { sessionId: focus.focusSession.id }, user);
}
for (let index = 0; index < 30; index++) {
  await engine.call('progress_record', { artifactRevision: 1, artifactId: 'quiz-cell-energy', kind: 'quiz', roomId: 'castle-study', sessionId: `qa-practice-${index}`, answers: { q1: 1, q2: 2, q3: 1, q4: 'ATP', q5: 0 } }, user);
}
await engine.call('space_customize', { space: { ...originalSpace, name: 'QA fixture · test earned room', room: 'castle-study', theme: 'moonlight', tagline: 'Isolated visual test data, not a student’s earned progress.' } }, user);
const { server } = createNotableServer({ demo: true, port: 8788, store, dataDirectory: directory });
server.listen(8788, '127.0.0.1', () => process.stdout.write(`ISOLATED TEST FIXTURE: http://127.0.0.1:8788\nTemporary data: ${directory}\nCastle study has 10,800 test-earned seconds and 30 practices; Brooklyn has 900 test-earned seconds. Existing placed rewards are preserved. No real student data was touched.\n`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
