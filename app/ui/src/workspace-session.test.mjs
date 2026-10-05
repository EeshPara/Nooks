import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const navigation = moduleUrl(await readFile(new URL('./workspace-navigation.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./workspace-session.ts', import.meta.url), 'utf8'))
  .replace(/^import .* from '(react|\.\/bridge|\.\/study\/readMaterial)';\n/gm, '')
  .replace("from './workspace-navigation'", `from '${navigation}'`);
const { createWorkspaceSessionController, loadPresentation } = await import(moduleUrl(source));
const id = '10000000-0000-4000-8000-000000000001';
const nextId = '10000000-0000-4000-8000-000000000002';
const artifact = (id, kind = 'note') => ({ id, kind, title: 'Study item', subject: '', content: 'Selected content' });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(t, configure = {}) {
  const h = { time: 0, hidden: false, editor: false, calls: [], contexts: [], presented: [], reads: [], timers: new Map(), nextTimer: 0, sequence: 0, command: null };
  h.reply = (sequence = h.sequence, command = h.command, sessionId = id) => ({ sessionId, sequence, expiresAt: new Date(h.time + 1_800_000).toISOString(), command });
  h.call = async (name, args) => name === 'workspace_session_open' ? h.reply(h.sequence, undefined, args.sessionId) : h.reply(h.sequence, h.sequence > args.afterSequence ? h.command : null, args.sessionId);
  h.read = async id => artifact(id);
  Object.assign(h, configure);
  h.controller = createWorkspaceSessionController({
    initialSessionId: id,
    call: async (name, args) => { h.calls.push({ name, args }); return h.call(name, args); },
    read: async id => { h.reads.push(id); return h.read(id); },
    ...(configure.refresh ? { refresh: configure.refresh } : {}),
    onPresent: data => { h.presented.push(data); return h.outcome ?? 'presented'; },
    setContext: value => h.contexts.push(value), onSessionIdChange: value => { h.rotated = value; },
    canPresent: () => !h.editor, hidden: () => h.hidden, now: () => h.time, uuid: () => nextId, random: () => 0,
    setTimer: (callback, delay) => { const token = ++h.nextTimer; h.timers.set(token, { callback, at: h.time + delay, delay }); return token; },
    clearTimer: token => h.timers.delete(token),
  });
  h.next = async () => { const [token, task] = [...h.timers].sort((a, b) => a[1].at - b[1].at)[0] ?? []; assert.ok(task, 'a next poll is scheduled'); h.time = task.at; h.timers.delete(token); task.callback(); await flush(); };
  h.delay = () => [...h.timers.values()][0]?.at - h.time;
  h.start = async () => { h.controller.start(); await flush(); };
  t.after(() => h.controller.stop());
  return h;
}

test('new view starts after old commands and consumes queued dirty-note navigation exactly once', async t => {
  const h = harness(t, { sequence: 7, command: { sequence: 7, view: 'library' }, outcome: 'queued' });
  await h.start();
  assert.equal(h.calls[1].args.afterSequence, 7);
  assert.equal(h.presented.length, 0);
  h.sequence = 8; h.command = { sequence: 8, view: 'plan' };
  await h.next(); await h.next();
  assert.deepEqual(h.presented, [{ navigation: { view: 'plan' } }]);
  assert.equal(h.calls.at(-1).args.afterSequence, 8);
  assert.equal(h.calls.filter(call => call.name === 'workspace_session_open').length, 1);
  assert.equal(h.reads.length, 0);
});

test('failed material reads retry the unconsumed command, then keep its successful cursor', async t => {
  const h = harness(t); await h.start();
  h.sequence = 1; h.command = { sequence: 1, artifactId: 'saved-note' };
  h.read = async itemId => { if (h.reads.length === 1) throw new Error('Temporary read failure'); return artifact(itemId); };
  await h.next();
  assert.equal(h.presented.length, 0); assert.equal(h.delay(), 6000);
  await h.next(); await h.next();
  assert.deepEqual(h.reads, ['saved-note', 'saved-note']);
  assert.equal(h.presented.length, 1);
  assert.equal(h.calls.at(-1).args.afterSequence, 1);
});

test('hidden views make no requests and wake cannot overlap an in-flight poll', async t => {
  const h = harness(t, { hidden: true }); await h.start();
  assert.equal(h.calls.length, 0); assert.equal(h.delay(), 30_000);
  const pending = deferred();
  h.hidden = false;
  h.call = async (name, args) => name === 'workspace_session_open' ? h.reply(0, null, args.sessionId) : pending.promise;
  h.controller.wake(); await flush();
  assert.equal(h.calls.length, 2);
  for (let i = 0; i < 4; i++) h.controller.wake();
  assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0);
  pending.resolve(h.reply()); await flush();
  assert.equal(h.timers.size, 1);
});

test('rate-limit delays survive visibility wake-ups and successful polls reset backoff', async t => {
  const h = harness(t); await h.start();
  let reject = true;
  h.call = async (_name, args) => { if (reject) throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED', retryAfter: 60 }); return h.reply(0, null, args.sessionId); };
  await h.next(); assert.equal(h.delay(), 60_000);
  const count = h.calls.length;
  h.controller.wake(); await flush();
  assert.equal(h.calls.length, count); assert.equal(h.delay(), 60_000);
  reject = false;
  await h.next(); assert.equal(h.delay(), 2500);
});

test('renewal retains a pending cursor; expired renewal rotates the UUID before registration', async t => {
  const h = harness(t); await h.start();
  h.sequence = 1; h.command = { sequence: 1, view: 'focus' }; h.time = 300_000;
  h.controller.wake(); await flush();
  assert.equal(h.calls.at(-1).args.afterSequence, 0);
  assert.equal(h.presented[0].navigation.view, 'focus');
  const previousCall = h.call;
  h.call = async (name, args) => { if (args.sessionId === id) throw Object.assign(new Error('Expired'), { code: 'SESSION_EXPIRED' }); return previousCall(name, args); };
  h.time += 1_900_000; h.controller.wake(); await flush();
  assert.equal(h.rotated, nextId); assert.equal(h.contexts.at(-1), null);
  await h.next();
  assert.equal(h.calls.at(-1).args.sessionId, nextId);
  assert.equal(h.contexts.at(-1), nextId);
  assert.equal(h.presented.length, 1, 'rotated registration does not replay the old command');
});

test('teardown discards late registration and late artifact responses without restarting polling', async t => {
  const registration = deferred();
  const h = harness(t, { call: () => registration.promise });
  await h.start(); h.controller.stop(); registration.resolve(h.reply()); await flush();
  assert.deepEqual(h.contexts, [null]); assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
  h.controller.start(); h.controller.wake(); await flush(); assert.equal(h.calls.length, 1);
  const g = harness(t); await g.start();
  const material = deferred(); g.read = () => material.promise;
  const pending = g.controller.present({ artifactId: 'note' });
  g.controller.stop(); material.resolve(artifact('note'));
  await assert.rejects(pending, error => error.code === 'APP_CLOSED');
  assert.equal(g.presented.length, 0); assert.equal(g.timers.size, 0);
});

test('new direct app commands win over earlier poll responses and slow presentations', async t => {
  const h = harness(t); await h.start();
  const poll = deferred(); h.call = () => poll.promise;
  await h.next();
  await h.controller.present({ view: 'music' });
  poll.resolve(h.reply(1, { sequence: 1, view: 'library' })); await flush();
  assert.deepEqual(h.presented, [{ navigation: { view: 'music' } }]);
  const material = deferred(); h.read = () => material.promise;
  const stale = h.controller.present({ artifactId: 'old-note' });
  await h.controller.present({ view: 'collection' });
  material.resolve(artifact('old-note'));
  await assert.rejects(stale, error => error.code === 'SUPERSEDED');
  assert.equal(h.presented.at(-1).navigation.view, 'collection');
});

test('study-set editing prevents navigation both before and after asynchronous material reads', async t => {
  const h = harness(t); await h.start(); h.editor = true;
  await assert.rejects(h.controller.present({ artifactId: 'quiz' }), error => error.code === 'EDITOR_BUSY');
  assert.equal(h.reads.length, 0);
  h.editor = false;
  const material = deferred(); h.read = () => material.promise;
  const pending = h.controller.present({ artifactId: 'quiz' });
  h.editor = true; material.resolve(artifact('quiz', 'quiz'));
  await assert.rejects(pending, error => error.code === 'EDITOR_BUSY');
  assert.equal(h.presented.length, 0);
});

test('mismatched sessions, incomplete commands and backwards cursors never change the view', async t => {
  const h = harness(t); await h.start();
  for (const response of [h.reply(1, { sequence: 1, view: 'library' }, nextId), h.reply(-1, null), h.reply(2, { sequence: 1, view: 'plan' }), h.reply(1, null)]) {
    h.call = async () => response;
    await h.next();
    assert.equal(h.presented.length, 0);
    assert.equal(h.calls.at(-1).args.afterSequence, 0);
  }
});

test('only selected owned IDs are hydrated and invalid references cannot replace current material', async () => {
  const reads = [];
  const read = async itemId => { reads.push(itemId); return artifact(itemId, itemId === 'quiz' ? 'quiz' : 'note'); };
  const result = await loadPresentation({ artifactId: 'quiz', alongsideArtifactId: 'note' }, read);
  assert.deepEqual(reads, ['quiz', 'note']); assert.equal(result.alongsideArtifact.kind, 'note');
  await assert.rejects(loadPresentation({ artifactId: 'expected' }, async () => artifact('other')), /could not be opened/);
  await assert.rejects(loadPresentation({ artifactId: 'note', alongsideArtifactId: 'second-note' }, read), /reference note/);
  await assert.rejects(loadPresentation({ artifactId: 'quiz', alongsideArtifactId: 'other-quiz' }, async itemId => artifact(itemId, 'quiz')), /reference note/);
});

test('explicit view commands refresh current tasks once while unchanged polls never read the workspace', async t => {
  let refreshes = 0;
  const latest = { artifacts: [], plan: { tasks: [{ id: 'new-task', title: 'Saved through chat' }] }, revision: 9 };
  const h = harness(t, { refresh: async () => { refreshes++; return { workspace: latest }; } });
  await h.start(); await h.next();
  assert.equal(refreshes, 0);
  h.sequence = 1; h.command = { sequence: 1, view: 'plan' };
  await h.next(); await h.next();
  assert.equal(refreshes, 1);
  assert.deepEqual(h.presented, [{ navigation: { view: 'plan' }, workspace: latest }]);
  await h.controller.present({ artifactId: 'note' });
  assert.equal(refreshes, 1, 'material presentation does not read unrelated workspace data');
});

test('a delayed view refresh cannot replace a newer direct selection or discard a newly opened editor', async t => {
  const refresh = deferred();
  const h = harness(t, { refresh: () => refresh.promise }); await h.start();
  const stale = h.controller.present({ view: 'plan' }); await flush();
  await h.controller.present({ artifactId: 'new-note' });
  refresh.resolve({ workspace: { artifacts: [], revision: 2 } });
  await assert.rejects(stale, error => error.code === 'SUPERSEDED');
  assert.equal(h.presented.length, 1); assert.equal(h.presented[0].artifact.id, 'new-note');
  const pending = deferred();
  const g = harness(t, { refresh: () => pending.promise }); await g.start();
  const blocked = g.controller.present({ view: 'focus' }); await flush();
  g.editor = true; pending.resolve({ workspace: { artifacts: [], revision: 3 } });
  await assert.rejects(blocked, error => error.code === 'EDITOR_BUSY');
  assert.equal(g.presented.length, 0);
});

test('quiet foreground polling halves steady request load while fallback navigation stays within five seconds', async t => {
  const h = harness(t); await h.start();
  while (h.time < 600_000) await h.next();
  assert.ok(h.calls.length <= 126, `ten idle minutes made ${h.calls.length} requests, including renewals`);
  assert.equal(h.delay(), 5000);
  h.sequence = 1; h.command = { sequence: 1, view: 'library' };
  const queuedAt = h.time; await h.next();
  assert.ok(h.time - queuedAt <= 5000);
  assert.equal(h.presented.at(-1).navigation.view, 'library'); assert.equal(h.delay(), 2500);
  const calls = h.calls.length;
  await h.controller.present({ view: 'music' });
  assert.equal(h.presented.at(-1).navigation.view, 'music'); assert.equal(h.calls.length, calls, 'direct app navigation never waits for or forces a poll');
});

test('a quiet hidden view performs no background requests and foreground wake checks immediately', async t => {
  const h = harness(t); await h.start(); await h.next(); await h.next();
  assert.equal(h.delay(), 5000);
  h.hidden = true; const count = h.calls.length;
  for (let i = 0; i < 20; i++) await h.next();
  assert.equal(h.calls.length, count);
  h.sequence = 1; h.command = { sequence: 1, view: 'focus' }; h.hidden = false;
  h.controller.wake(); await flush();
  assert.equal(h.presented.at(-1).navigation.view, 'focus');
  assert.equal(h.delay(), 2500);
});
