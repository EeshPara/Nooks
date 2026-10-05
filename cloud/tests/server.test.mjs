import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../server/store.mjs';
import { StudyEngine, validateArtifact } from '../server/engine.mjs';
import { createNotableServer, modelSafeResult, widgetHtml } from '../server/index.mjs';
import { createIntrospectionVerifier } from '../server/auth.mjs';
import { UI_URI, LEGACY_UI_URI } from '../server/tools.mjs';
import { validateSpace } from '../server/space.mjs';
import { runInNewContext } from 'node:vm';
import { request as httpRequest } from 'node:http';

const alice = { id: 'verified-alice', scopes: ['notable.read', 'notable.write'] };
const bob = { id: 'verified-bob', scopes: ['notable.read', 'notable.write'] };
const quiz = { id: 'quiz-private', kind: 'quiz', title: 'Recall', subject: 'Biology', color: 'mint', questions: [{ id: 'q1', prompt: 'What is the cell’s main energy currency?', answer: 'ATP' }, { id: 'q2', prompt: 'Glycolysis happens in the?', options: ['Cytoplasm', 'Nucleus'], correctIndex: 0 }] };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'notable-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(directory, { seeded: false, ...options });
  return { store, engine: new StudyEngine(store, options), directory };
}

test('anonymous writes are denied and private student data never enters preview', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: quiz }, alice);
  await assert.rejects(engine.call('artifact_save', { artifact: quiz }), { code: 'AUTH_REQUIRED' });
  const preview = await engine.call('workspace_get', { userId: alice.id });
  assert.equal(preview.authenticated, false);
  assert.equal(preview.workspace.artifacts.some(item => item.id === quiz.id), false);
  assert.deepEqual((await engine.call('workspace_get', {}, bob)).workspace.artifacts, []);
  await assert.rejects(engine.call('artifact_delete', { artifactId: quiz.id }, bob), { code: 'NOT_FOUND' });
  assert.equal((await engine.call('workspace_get', {}, alice)).workspace.artifacts.length, 1);
});

test('workspace rendering opens the owned saved revision without writing or duplicating material', async t => {
  const { engine, store } = await fixture(t);
  const saved = await engine.call('artifact_save', { artifact: quiz }, alice);
  const before = await store.read(alice.id);
  const rendered = await engine.call('workspace_render', { artifactId: saved.artifact.id }, { ...alice, scopes: ['notable.read'] });
  assert.equal(rendered.authenticated, true);
  assert.equal(rendered.unsaved, false);
  assert.deepEqual(rendered.artifact, saved.artifact);
  assert.equal(rendered.workspace.artifacts.length, 1);
  assert.deepEqual(await store.read(alice.id), before);
  const updated = await engine.call('artifact_save', { artifact: { ...saved.artifact, title: 'Updated recall' } }, alice);
  const reopened = await engine.call('workspace_render', { artifactId: saved.artifact.id }, alice);
  assert.equal(reopened.artifact.revision, updated.artifact.revision);
  assert.equal(reopened.artifact.title, 'Updated recall');
});

test('workspace rendering denies anonymous IDs, foreign IDs, and missing read scope', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: quiz }, alice);
  await assert.rejects(engine.call('workspace_render', { artifactId: quiz.id, userId: alice.id }), { code: 'AUTH_REQUIRED' });
  await assert.rejects(engine.call('workspace_render', { artifactId: quiz.id, userId: alice.id }, bob), { code: 'NOT_FOUND' });
  for (const name of ['workspace_get', 'workspace_render']) {
    await assert.rejects(engine.call(name, {}, { ...alice, scopes: ['notable.write'] }), { code: 'INSUFFICIENT_SCOPE' });
    await assert.rejects(engine.call(name, {}, { id: alice.id }), { code: 'INSUFFICIENT_SCOPE' });
  }
  for (const artifactId of ['', null, 2, 'x'.repeat(129), '__proto__']) {
    await assert.rejects(engine.call('workspace_render', { artifactId }, alice), { code: 'INVALID_INPUT' });
  }
  for (const artifact of [quiz, null]) {
    await assert.rejects(engine.call('workspace_render', { artifactId: quiz.id, artifact }, alice), { code: 'INVALID_INPUT' });
  }
});

test('workspace rendering preserves anonymous complete previews and empty welcome rendering', async t => {
  const { engine, store } = await fixture(t);
  const preview = await engine.call('workspace_render', { artifact: quiz });
  assert.equal(preview.authenticated, false);
  assert.equal(preview.unsaved, true);
  assert.equal(preview.artifact.id, quiz.id);
  assert.deepEqual(preview.artifact.questions, quiz.questions);
  assert.equal(preview.workspace.artifacts.some(item => item.id === quiz.id), false);
  const connectedPreview = await engine.call('workspace_render', { artifact: quiz }, alice);
  assert.equal(connectedPreview.unsaved, true);
  assert.deepEqual((await store.read(alice.id)).artifacts, []);
  const welcome = await engine.call('workspace_render');
  assert.ok(welcome.workspace);
  assert.equal(welcome.artifact, undefined);
  assert.equal(welcome.unsaved, undefined);
  await assert.rejects(engine.call('workspace_render', { artifact: null }), { code: 'INVALID_INPUT' });
});

test('durable atomic storage survives restart and concurrent saves without lost updates', async t => {
  const { engine, directory } = await fixture(t);
  await Promise.all(Array.from({ length: 15 }, (_, index) => engine.call('artifact_save', { artifact: { id: `note-${index}`, title: `Note ${index}`, subject: 'General', kind: 'note', content: 'A remembered idea.' } }, alice)));
  const second = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
  assert.equal((await second.call('workspace_get', {}, alice)).workspace.artifacts.length, 15);
});

test('corrupt storage fails closed instead of overwriting saved information', async t => {
  const { store, engine } = await fixture(t);
  await writeFile(store.file(alice.id), '{corrupted');
  await assert.rejects(engine.call('artifact_save', { artifact: quiz }, alice), SyntaxError);
});

test('artifact validation rejects broken quizzes and preserves typed complete content', () => {
  assert.throws(() => validateArtifact({ ...quiz, questions: [{ prompt: 'Bad question', options: ['One', 'Two'], correctIndex: 4 }] }), /correctIndex/);
  assert.throws(() => validateArtifact({ ...quiz, questions: [{ prompt: 'No answer' }] }), /need an answer/);
  assert.throws(() => validateArtifact({ ...quiz, questions: [{ id: 'x', prompt: '1', answer: '1' }, { id: 'x', prompt: '2', answer: '2' }] }), /unique/);
  assert.equal(validateArtifact(quiz).questions[1].correctIndex, 0);
  assert.equal(validateArtifact(quiz).color, 'mint');
});

test('quiz score is computed from answers; points are idempotent and daily bounded', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: quiz }, alice);
  const result = await engine.call('progress_record', { artifactRevision: 1, artifactId: quiz.id, sessionId: 'session-1', answers: { q1: 'atp!', q2: 1 }, score: 999, xp: 99999 }, alice);
  assert.equal(result.progressEvent.score, 1);
  assert.equal(result.progressEvent.total, 2);
  assert.equal(result.progressEvent.xp, 5);
  const repeated = await engine.call('progress_record', { artifactRevision: 1, artifactId: quiz.id, sessionId: 'session-1', answers: { q1: 'ATP', q2: 0 } }, alice);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.workspace.stats.xp, 5);
  const another = await engine.call('progress_record', { artifactRevision: 1, artifactId: quiz.id, sessionId: 'session-2', answers: { q1: 'ATP', q2: 0 } }, alice);
  assert.equal(another.progressEvent.xp, 0);
  await assert.rejects(engine.call('progress_record', { artifactRevision: 1, artifactId: quiz.id, sessionId: 'session-3', answers: { unknown: 'yes' } }, alice), /unknown question/);
});

test('flashcard confidence persists review schedule and invalid card identifiers fail', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: { id: 'cards', kind: 'flashcards', title: 'Cards', subject: 'Biology', cards: [{ id: 'c1', front: 'Energy currency', back: 'ATP' }] } }, alice);
  const result = await engine.call('progress_record', { artifactRevision: 1, artifactId: 'cards', kind: 'flashcards', sessionId: 'cards-1', cardRatings: { c1: 'good' } }, alice);
  assert.equal(result.workspace.reviews.cards.c1.intervalDays, 2);
  await assert.rejects(engine.call('progress_record', { artifactRevision: 1, artifactId: 'cards', kind: 'flashcards', sessionId: 'cards-2', cardRatings: { other: 'good' } }, alice), /Invalid flashcard/);
});

test('sprint grades its selected question subset and plans reject impossible calendar dates', async t => {
  const { engine } = await fixture(t);
  await engine.call('artifact_save', { artifact: quiz }, alice);
  const result = await engine.call('progress_record', { artifactRevision: 1, artifactId: quiz.id, kind: 'sprint', sessionId: 'sprint-1', answers: { q2: 0 } }, alice);
  assert.equal(result.progressEvent.total, 1);
  assert.equal(result.progressEvent.score, 1);
  await assert.rejects(engine.call('plan_save', { expectedRevision: (await engine.call('plan_get', {}, alice)).workspaceRevision, plan: { tasks: [{ title: 'Review', dueDate: '2026-02-30' }] } }, alice), /valid YYYY-MM-DD/);
  const plan = await engine.call('plan_save', { expectedRevision: (await engine.call('plan_get', {}, alice)).workspaceRevision, plan: { tasks: [{ title: 'Review', dueDate: '2026-10-01' }] } }, alice);
  assert.equal(plan.plan.tasks[0].dueDate, '2026-10-01');
});

test('space customization persists, rejects active image formats and shares only explicit appearance', async t => {
  const { engine, store } = await fixture(t);
  await engine.call('artifact_save', { artifact: { id: 'secret', kind: 'note', title: 'Private title', subject: 'Personal', content: 'Private lecture content never shared.' } }, alice);
  await engine.call('space_customize', { space: { name: 'Moonlit room', theme: 'moonlight', companion: 'cat', accent: '#b1a0d8', decorations: ['sparkles'], layout: 'calm', tagline: 'One small step' } }, alice);
  assert.equal((await engine.call('workspace_get', {}, alice)).workspace.space.name, 'Moonlit room');
  assert.throws(() => validateSpace({ backgroundImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }), /PNG, JPEG or WebP/);
  assert.throws(() => validateSpace({ backgroundImage: 'data:image/png;base64,PHN2Zz48L3N2Zz4=' }), /bytes/);
  const result = await engine.call('space_share', { description: 'My room', includeProgress: false }, alice);
  const snapshot = await store.readShare(result.share.id);
  assert.equal(snapshot.space.name, 'Moonlit room');
  assert.equal(snapshot.stats, undefined);
  assert.equal(snapshot.artifacts, undefined);
  assert.equal(JSON.stringify(snapshot).includes('Private'), false);
  assert.equal(JSON.stringify(snapshot).includes(alice.id), false);
  await assert.rejects(engine.call('space_unshare', { shareId: snapshot.id }, bob), { code: 'NOT_FOUND' });
  assert.notEqual(await store.readShare(snapshot.id), null);
  await engine.call('space_unshare', { shareId: snapshot.id }, alice);
  assert.equal(await store.readShare(snapshot.id), null);
  assert.equal(await store.readShare('../../etc/passwd'), null);
});

test('shared progress includes only aggregate fields after an explicit opt-in', async t => {
  const { engine, store } = await fixture(t);
  const saved = await engine.call('space_share', { includeProgress: true }, alice);
  const snapshot = await store.readShare(saved.share.id);
  assert.deepEqual(Object.keys(snapshot.stats).sort(), ['focusMinutes', 'level', 'streak', 'xp']);
  await assert.rejects(engine.call('space_share', { includeProgress: true }), { code: 'AUTH_REQUIRED' });
});

test('Nook rooms and companions persist across restart and appear only in appearance shares', async t => {
  const { engine, store, directory } = await fixture(t);
  assert.equal((await engine.call('workspace_get', {}, alice)).workspace.space.room, 'rainy-library');
  const legacy = validateSpace({ name: 'Existing room', theme: 'moonlight', companion: 'cat' });
  assert.equal(legacy.theme, 'moonlight');
  assert.equal(legacy.room, undefined);
  await engine.call('artifact_save', { artifact: { id: 'private-study', kind: 'note', title: 'Private source', subject: 'Personal', content: 'Never include this in a room snapshot.' } }, alice);
  const rooms = ['rainy-library', 'midnight-train', 'sakura-garden', 'seaside-studio', 'alpine-cabin', 'autumn-bookshop', 'moonlit-observatory', 'sunlit-greenhouse', 'neon-tokyo', 'paris-attic', 'kyoto-teahouse', 'brooklyn-loft', 'cloud-bedroom', 'oxford-library', 'lighthouse-study', 'tropical-veranda', 'mossy-watermill', 'aurora-cabin', 'autumn-camper', 'ricefield-porch', 'lakeside-boathouse', 'castle-study', 'desert-casita', 'underwater-study', 'floating-airship', 'moon-base', 'woodland-treehouse', 'lavender-cottage', 'canal-apartment', 'night-campus', 'mosslight-dungeon'];
  const companions = ['sleepy-dog', 'sprout', 'cat', 'none', 'bunny', 'fox', 'capybara', 'red-panda', 'owl', 'turtle', 'bear', 'ghost'];
  for (const [index, room] of rooms.entries()) {
    const companion = companions[index % companions.length];
    const saved = await engine.call('space_customize', { space: { ...legacy, room, companion } }, alice);
    assert.equal(saved.workspace.space.room, room);
    assert.equal(saved.workspace.space.companion, companion);
    const result = await engine.call('space_share', {}, alice);
    const snapshot = await store.readShare(result.share.id);
    assert.equal(snapshot.space.room, room);
    assert.equal(snapshot.space.companion, companion);
    assert.equal(snapshot.stats, undefined);
    assert.equal(JSON.stringify(snapshot).includes('Never include'), false);
    assert.equal(snapshot.artifacts, undefined);
    await engine.call('space_unshare', { shareId: snapshot.id }, alice);
    assert.equal(await store.readShare(snapshot.id), null);
  }
  const restarted = new StudyEngine(new WorkspaceStore(directory, { seeded: false }));
  const restored = (await restarted.call('workspace_get', {}, alice)).workspace;
  assert.equal(restored.space.room, 'mosslight-dungeon');
  assert.equal(restored.space.companion, 'capybara');
  assert.equal(restored.artifacts[0].id, 'private-study');
  assert.throws(() => validateSpace({ room: 'unknown-room' }), /Invalid room/);
  assert.throws(() => validateSpace({ companion: 'unknown-animal' }), /Invalid companion/);
});

test('background pixels stay in UI metadata and never inflate model-visible content', () => {
  const source = { structuredContent: { workspace: { space: { name: 'Room', backgroundImage: 'data:image/png;base64,pixels' } } }, content: [{ type: 'text', text: 'Saved.' }] };
  const result = modelSafeResult(source);
  assert.equal(result.structuredContent.workspace.space?.backgroundImage, undefined);
  assert.equal(result._meta.notableData.workspace.space.backgroundImage, source.structuredContent.workspace.space.backgroundImage);
  assert.equal(source.structuredContent.workspace.space.backgroundImage, 'data:image/png;base64,pixels');
});

test('focus pause/resume excludes paused time and replay cannot duplicate points', async t => {
  let milliseconds = Date.parse('2026-10-01T12:00:00Z');
  const { engine } = await fixture(t, { clock: () => new Date(milliseconds) });
  const started = await engine.call('focus_start', { minutes: 1, subject: 'Biology' }, alice);
  const sessionId = started.focusSession.id;
  milliseconds += 30000;
  await engine.call('focus_update', { sessionId, action: 'pause' }, alice);
  milliseconds += 600000;
  await engine.call('focus_update', { sessionId, action: 'resume' }, alice);
  milliseconds += 30000;
  const finished = await engine.call('focus_complete', { sessionId, minutes: 9999 }, alice);
  assert.equal(finished.focusSession.minutes, 1);
  assert.equal(finished.workspace.stats.xp, 2);
  const repeated = await engine.call('focus_complete', { sessionId }, alice);
  assert.equal(repeated.workspace.stats.xp, 2);
  assert.equal(repeated.duplicate, true);
});

test('unfinished focus cannot claim completed focus points', async t => {
  const { engine } = await fixture(t);
  const start = await engine.call('focus_start', { minutes: 25 }, alice);
  const finish = await engine.call('focus_complete', { sessionId: start.focusSession.id, minutes: 25 }, alice);
  assert.equal(finish.focusSession.xp, 0);
  assert.equal(finish.workspace.stats.focusMinutes, 0);
});

test('read-only scopes cannot mutate the study library', async t => {
  const { engine } = await fixture(t);
  await assert.rejects(engine.call('artifact_save', { artifact: quiz }, { id: 'read-only', scopes: ['notable.read'] }), { code: 'INSUFFICIENT_SCOPE' });
});

test('OAuth introspection validates issuer, audience, expiration and scopes', async () => {
  const claims = { active: true, iss: 'https://login.notable.test', aud: 'https://notable.test/mcp', exp: Date.now() / 1000 + 300, sub: 'student-1', scope: 'notable.read notable.write' };
  const verifier = createIntrospectionVerifier({ endpoint: 'https://login.notable.test/introspect', issuer: claims.iss, audience: claims.aud, clientId: 'test', clientSecret: 'test', fetchImpl: async () => ({ ok: true, json: async () => claims }) });
  assert.equal((await verifier('signed-access-token')).id, 'https://login.notable.test|student-1');
  claims.aud = 'https://wrong.test'; assert.equal(await verifier('token'), null);
  claims.aud = 'https://notable.test/mcp'; claims.exp = 1; assert.equal(await verifier('token'), null);
});

test('HTTP MCP initializes, discovers tools, renders UI and rejects foreign origins', async t => {
  const { directory } = await fixture(t);
  const dist = join(directory, 'dist'); await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<div id="root"></div><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">');
  await writeFile(join(dist, 'assets/main.js'), 'document.body.dataset.test="ready"; document.body.dataset.replacement="x".replace(/x/,"$&y"); const quotePattern=/["\']/; const image="/assets/test.png"; const repeated="/assets/test.png"; if(image!==repeated)throw Error("Image references differ"); document.body.dataset.image=image;');
  await writeFile(join(dist, 'assets/test.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(dist, 'assets/font.ttf'), Buffer.from([0, 1, 2]));
  await writeFile(join(dist, 'assets/main.css'), 'body {color:green} @font-face {src:url("/assets/font.ttf")}');
  const { server } = createNotableServer({ demo: true, publicUrl: 'https://ignored.example/mcp', dataDirectory: join(directory, 'data'), distDirectory: dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (method, params = {}, headers = {}) => fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const initialized = await (await post('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json();
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.equal(initialized.result.serverInfo.title, 'Nooks');
  assert.equal(initialized.result.serverInfo.name, 'notable-study-space');
  const discovered = await (await post('tools/list')).json();
  assert.equal(new Set(discovered.result.tools.map(tool => tool.name)).size, discovered.result.tools.length);
  for (const name of ['artifact_save', 'library_search', 'context_get', 'note_revision_propose', 'session_save']) assert.ok(discovered.result.tools.some(tool => tool.name === name));
  assert.equal(discovered.result.tools.find(tool => tool.name === 'workspace_render')._meta.ui.resourceUri, UI_URI);
  const entrypoint = discovered.result.tools.find(tool => tool.name === 'workspace_render');
  assert.equal(entrypoint.title, 'Open Nooks study space');
  const customization = discovered.result.tools.find(tool => tool.name === 'space_customize').inputSchema.properties.space.properties;
  assert.equal(customization.room.enum.includes('neon-tokyo'), true);
  assert.equal(customization.room.enum.length, 31);
  assert.equal(customization.room.enum.includes('night-campus'), true);
  assert.equal(customization.companion.enum.includes('ghost'), true);
  assert.deepEqual(entrypoint._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  assert.equal(entrypoint.inputSchema.required.length, 0);
  assert.equal(entrypoint.inputSchema.properties.artifactId.maxLength, 128);
  assert.deepEqual(entrypoint.inputSchema.allOf, [
    { not: { required: ['artifact', 'artifactId'] } },
    { not: { required: ['view', 'artifact'] } },
    { not: { required: ['view', 'artifactId'] } },
  ]);
  assert.match(entrypoint.icons[0].src, /^data:image\/svg\+xml;base64,/);
  const resource = await (await post('resources/read', { uri: UI_URI })).json();
  assert.match(resource.result.contents[0].text, /dataset.test/);
  assert.equal(resource.result.contents[0].text.includes('src="/assets/'), false);
  assert.match(resource.result.contents[0].text, /data:image\/png;base64/);
  assert.equal((resource.result.contents[0].text.match(/data:image\/png;base64/g) ?? []).length, 1);
  const context = { document: { body: { dataset: {} } } };
  for (const script of resource.result.contents[0].text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) runInNewContext(script[1], context);
  assert.match(context.document.body.dataset.image, /^data:image\/png;base64,/);
  assert.equal(context.document.body.dataset.replacement, 'xy');
  assert.match(resource.result.contents[0].text, /data:font\/ttf;base64/);
  assert.deepEqual(resource.result.contents[0]._meta['openai/ui'], { availableDisplayModes: ['fullscreen'] });
  const legacyResource = await (await post('resources/read', { uri: LEGACY_UI_URI })).json();
  assert.equal(legacyResource.result.contents[0].uri, LEGACY_UI_URI);
  assert.deepEqual(legacyResource.result.contents[0]._meta['openai/ui'], { availableDisplayModes: ['fullscreen'] });
  assert.deepEqual(resource.result.contents[0]._meta.ui.csp.resourceDomains, []);
  assert.deepEqual(resource.result.contents[0]._meta.ui.csp.connectDomains, ['https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com']);
  assert.deepEqual(resource.result.contents[0]._meta.ui.csp.frameDomains, ['https://open.spotify.com']);
  assert.deepEqual(resource.result.contents[0]._meta['openai/widgetCSP'].connect_domains, ['https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com']);
  assert.deepEqual(resource.result.contents[0]._meta['openai/widgetCSP'].resource_domains, []);
  assert.deepEqual(resource.result.contents[0]._meta['openai/widgetCSP'].frame_domains, ['https://open.spotify.com']);
  assert.equal(resource.result.contents[0].text.includes('ignored.example'), false);
  const foreign = await post('tools/list', {}, { Origin: 'https://evil.test' }); assert.equal(foreign.status, 403);
  const forged = await (await post('tools/call', { name: 'workspace_get', arguments: { userId: 'alice' } }, { 'X-User-Id': 'alice' })).json();
  assert.equal(forged.result.structuredContent.mode, 'local-demo');
});

test('production REST is disabled, identity headers are ignored and no-auth writes fail', async t => {
  const { directory } = await fixture(t);
  assert.throws(() => createNotableServer({ demo: true, host: '0.0.0.0' }), /loopback/);
  const { server } = createNotableServer({ dataDirectory: directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/workspace')).status, 404);
  const response = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': 'verified-alice', Authorization: 'Bearer unverified-arbitrary-token' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'artifact_save', arguments: { artifact: quiz } } }) });
  const result = await response.json(); assert.equal(result.result.structuredContent.error.code, 'AUTH_REQUIRED');
});

test('HTTP chat creation saves once and opens the verified owner’s item by id', async t => {
  const { directory } = await fixture(t);
  const { server } = createNotableServer({
    dataDirectory: directory,
    verifyToken: async token => token === 'alice-token' ? alice : token === 'bob-token' ? bob : null,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (name, args, token) => {
    const response = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': alice.id, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  const saved = await call('artifact_save', { artifact: quiz }, 'alice-token');
  assert.equal(saved.isError, undefined);
  const opened = await call('workspace_render', { artifactId: saved.structuredContent.artifact.id }, 'alice-token');
  assert.equal(opened.isError, undefined);
  assert.equal(opened.structuredContent.unsaved, false);
  assert.equal(opened.structuredContent.workspace.library.count, 1);
  assert.deepEqual(opened._meta.notableData.artifact, saved.structuredContent.artifact);
  assert.equal(opened._meta.notableData.workspace.artifacts.length, 1);
  assert.equal(opened.structuredContent.workspace.artifacts, undefined);
  for (const token of [undefined, 'invalid-token']) {
    const denied = await call('workspace_render', { artifactId: quiz.id, userId: alice.id }, token);
    assert.equal(denied.structuredContent.error.code, 'AUTH_REQUIRED');
    assert.equal(denied._meta?.notableData, undefined);
  }
  const foreign = await call('workspace_render', { artifactId: quiz.id, userId: alice.id }, 'bob-token');
  assert.equal(foreign.structuredContent.error.code, 'NOT_FOUND');
  assert.equal(foreign._meta?.notableData, undefined);
  const preview = await call('workspace_render', { artifact: quiz });
  assert.equal(preview.structuredContent.authenticated, false);
  assert.equal(preview.structuredContent.unsaved, true);
});

test('hosted widget images use only the configured HTTPS origin and public build registry', async t => {
  const { directory } = await fixture(t);
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, 'images'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><html><head><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css"></head><body></body></html>');
  await writeFile(join(dist, 'assets/main.js'), 'const room="/images/room.png"; const repeated="/images/room.png";');
  await writeFile(join(dist, 'assets/main.css'), 'body{background-image:url("/images/room.png")} @font-face{font-family:Test;src:url("/assets/font.ttf")}');
  await writeFile(join(dist, 'images/room.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(dist, 'assets/font.ttf'), Buffer.from([0, 1, 2]));
  for (const origin of ['http://nook.example', 'https://user:secret@nook.example', 'https://nook.example/path', 'https://nook.example?token=secret']) await assert.rejects(widgetHtml(dist, { assetOrigin: origin }), /configured HTTPS origin/);
  assert.throws(() => createNotableServer({ publicUrl: 'https://user:secret@nook.example/mcp' }), /without credentials/);
  const { server } = createNotableServer({ publicUrl: 'https://nook.example/mcp', dataDirectory: join(directory, 'data'), distDirectory: dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Use the HTTP transport directly: fetch normalizes Host to the URL hostname.
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const connection = httpRequest(base + path, { method: options.method ?? 'GET', headers: { Host: 'nook.example', ...options.headers } }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
    });
    connection.on('error', reject);
    connection.end(options.body);
  });
  const response = await request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: UI_URI, assetOrigin: 'https://untrusted.example' } }) });
  const envelope = await response.json();
  assert.equal(response.status, 200, JSON.stringify(envelope));
  const resource = envelope.result.contents[0];
  assert.deepEqual(resource._meta.ui.csp.resourceDomains, ['https://nook.example']);
  assert.deepEqual(resource._meta['openai/widgetCSP'].resource_domains, ['https://nook.example']);
  assert.deepEqual(resource._meta.ui.csp.frameDomains, ['https://open.spotify.com']);
  assert.deepEqual(resource._meta['openai/widgetCSP'].frame_domains, ['https://open.spotify.com']);
  assert.deepEqual(resource._meta.ui.csp.connectDomains, ['https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com']);
  assert.deepEqual(resource._meta['openai/widgetCSP'].connect_domains, ['https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com']);
  assert.match(resource.text, /https:\/\/nook\.example\/images\/room\.png/);
  assert.match(resource.text, /data:font\/ttf;base64/);
  assert.equal(resource.text.includes('untrusted.example'), false);
  assert.equal(resource.text.includes('data:image/png'), false);
  assert.equal(resource.text.includes('src="/assets/main.js"'), false);
  const image = await request('/images/room.png', { headers: { Origin: 'https://web-sandbox.oaiusercontent.com' } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('access-control-allow-origin'), '*');
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([137, 80, 78, 71]));
  const blocked = await request('/mcp', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(blocked.status, 403);
  const inline = await widgetHtml(dist);
  assert.match(inline, /data:image\/png;base64/);
  assert.equal(inline.includes('https://nook.example'), false);
});


test('opening movies use the trusted media origin without embedding bytes or rewriting unknown paths', async t => {
  const { directory } = await fixture(t);
  const dist = join(directory, 'film-dist');
  await mkdir(join(dist, 'media/opening-film'), { recursive: true });
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), '<html><script type="module" src="/assets/entry.js"></script></html>');
  await writeFile(join(dist, 'assets/entry.js'), 'const film="/media/opening-film/nooks-opening-v3.mp4"; const unknown="/media/opening-film/unknown.mp4";');
  await writeFile(join(dist, 'media/opening-film/nooks-opening-v3.mp4'), 'movie-bytes-never-in-html');
  const hosted = await widgetHtml(dist, { assetOrigin: 'https://nook.example' });
  assert.ok(hosted.includes('"https://nook.example/media/opening-film/nooks-opening-v3.mp4"'));
  assert.ok(hosted.includes('"/media/opening-film/unknown.mp4"'));
  assert.ok(!hosted.includes('data:video'));
  assert.ok(!hosted.includes('movie-bytes-never-in-html'));
  const local = await widgetHtml(dist);
  assert.ok(local.includes('"/media/opening-film/nooks-opening-v3.mp4"'));
  assert.ok(!local.includes('data:video'));
});
