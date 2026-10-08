import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { archiveRelease, currentGraph, prepareReleaseAssets, verifyReleaseAssets, readRetained, retainLiveRelease, verifyLiveRelease, validateGraph, validateEnvelope, MAX_GRAPHS, RETENTION_MS, MAX_CAPTURE_AGE_MS, PUBLIC_ORIGIN } from '../scripts/release-assets.mjs';
import { previewOutputConfig } from '../scripts/preview-deployment-contract.mjs';
const now = Date.parse('2026-10-08T12:00:00Z');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const provenance = { kind: 'exact-published-verification', immutableDeployment: 'https://nooks-study-space-test123-eeshpara-1663s-projects.vercel.app', verificationReportSha256: 'a'.repeat(64), verificationSampledAt: new Date(now).toISOString(), sourceCommit: null };
async function root(t) { const path = await mkdtemp(join(tmpdir(), 'nooks-retained-assets-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
async function build(root, version, { name = version, text = `export const version = '${version}';`, dependencies = false } = {}) {
  const directory = join(root, `build-${version}`); await mkdir(join(directory, 'assets'), { recursive: true });
  const index = Buffer.from(`<div id="root"></div><script type="module" src="/assets/index-${name}.js"></script><link rel="stylesheet" href="/assets/index-${name}.css">`);
  await writeFile(join(directory, 'index.html'), index);
  await writeFile(join(directory, `assets/index-${name}.js`), text + (dependencies ? 'const sound="/assets/rain-abc123.mp3";' : ''));
  await writeFile(join(directory, `assets/index-${name}.css`), 'body{color:black}');
  if (dependencies) await writeFile(join(directory, 'assets/rain-abc123.mp3'), 'verified-audio');
  const graph = await currentGraph(directory), assets = new Map();
  for (const entry of graph.assets) assets.set(entry.path, await readFile(join(directory, entry.path)));
  return { directory, graph, assets, index };
}
async function current(root, release) { await rm(join(root, 'dist-preview'), { recursive: true, force: true }); await cp(release.directory, join(root, 'dist-preview'), { recursive: true }); }
function publicRequests(current, retained = [], { indexChanges = false, manifest = true } = {}) {
  let indexRequests = 0;
  const assets = new Map([...current.assets, ...retained.flatMap(item => [...item.release.assets])]);
  const envelope = { version: 1, current: current.graph, retained: retained.map(item => item.record) };
  return async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    const path = url.slice(PUBLIC_ORIGIN.length); assert.ok(url.startsWith(PUBLIC_ORIGIN));
    if (path === '/') return new Response(indexChanges && ++indexRequests > 1 ? '<p>New deployment</p>' : current.index, { headers: { 'content-type': 'text/html' } });
    if (path === '/nooks-release.json') return new Response(manifest ? JSON.stringify(envelope) : current.index, { headers: { 'content-type': manifest ? 'application/json' : 'text/html' } });
    const bytes = assets.get(path.slice(1));
    return new Response(bytes ?? 'missing', { status: bytes ? 200 : 404, headers: { 'content-type': path.endsWith('.css') ? 'text/css' : 'application/javascript' } });
  };
}

test('package contains exact current plus verified old graph, and public metadata supports a fresh machine', async t => {
  const folder = await root(t), old = await build(folder, 'old'), next = await build(folder, 'new');
  const record = await archiveRelease(folder, old.graph, old.assets, provenance, { now });
  await current(folder, next); const envelope = await prepareReleaseAssets(folder, { now });
  assert.deepEqual(envelope.retained, [record]); assert.equal(envelope.current.id, next.graph.id);
  await verifyReleaseAssets(folder, undefined, { now });
  assert.deepEqual((await prepareReleaseAssets(folder, { now })).current, next.graph, 'packaging twice does not relabel old assets as current');
  const fresh = await root(t);
  const capture = await retainLiveRelease(fresh, { request: publicRequests(next, [{ release: old, record }]), now: now + 1000 });
  const restored = await readRetained(fresh, { now: now + 1000 });
  assert.equal(restored.length, 2); assert.equal(restored.find(item => item.graph.id === old.graph.id).retainUntil, record.retainUntil, 'old deadline does not slide on each rollout');
  assert.equal(capture.indexSha256, next.graph.indexSha256);
  await writeFile(join(folder, 'dist-preview/assets/unregistered-abc.js'), 'unverified');
  await assert.rejects(verifyReleaseAssets(folder, undefined, { now }), /exact current and retained union/);
});

test('hash mismatch, traversal, unknown files and symlinks never become retained code', async t => {
  const folder = await root(t), release = await build(folder, 'a');
  const wrong = new Map(release.assets); wrong.set(release.graph.assets[0].path, Buffer.from('changed'));
  await assert.rejects(archiveRelease(folder, release.graph, wrong, provenance, { now }), /differs from the verified release/);
  for (const path of ['../server.js', 'assets/a.js?retry=1', 'assets/../private.js']) assert.throws(() => validateGraph({ ...release.graph, assets: [{ ...release.graph.assets[0], path }] }), /Invalid release asset/);
  await archiveRelease(folder, release.graph, release.assets, provenance, { now });
  const directory = join(folder, 'release-assets', release.graph.id);
  await writeFile(join(directory, 'extra.txt'), 'unexpected'); await assert.rejects(readRetained(folder, { now }), /unexpected files/); await rm(join(directory, 'extra.txt'));
  const path = join(directory, release.graph.assets[0].path); await rm(path); await symlink(join(release.directory, release.graph.assets[0].path), path);
  await assert.rejects(readRetained(folder, { now }), /regular file/);
});

test('same asset filename with changed bytes blocks retention and never overwrites the current build', async t => {
  const folder = await root(t), old = await build(folder, 'old', { name: 'same' }), next = await build(folder, 'new', { name: 'same' });
  await archiveRelease(folder, old.graph, old.assets, provenance, { now });
  await current(folder, next);
  await assert.rejects(prepareReleaseAssets(folder, { now }), /paths collide/);
  assert.equal((await readFile(join(folder, 'dist-preview/assets/index-same.js'))).toString(), "export const version = 'new';");
});

test('unexpired graph cap fails closed, then expiry prunes whole generations', async t => {
  const folder = await root(t);
  for (let i = 0; i < MAX_GRAPHS; i++) { const release = await build(folder, `v${i}`); await archiveRelease(folder, release.graph, release.assets, provenance, { now }); }
  const extra = await build(folder, 'extra'); await assert.rejects(archiveRelease(folder, extra.graph, extra.assets, provenance, { now }), /bounded retention budget/);
  assert.equal((await readRetained(folder, { now: now + RETENTION_MS - 1 })).length, MAX_GRAPHS);
  assert.equal((await readRetained(folder, { now: now + RETENTION_MS + 1, prune: true })).length, 0);
  assert.deepEqual(await readdir(join(folder, 'release-assets')), []);
});

test('32MiB stored asset budget blocks an oversized graph before writing any generation', async t => {
  const folder = await root(t), release = await build(folder, 'large');
  const bytes = Buffer.alloc(4 * 1024 * 1024, 'x');
  for (let i = 0; i < 9; i++) { const path = `assets/large-${i}.js`; release.graph.assets.push({ path, bytes: bytes.length, sha256: sha(bytes) }); release.assets.set(path, bytes); }
  await assert.rejects(archiveRelease(folder, release.graph, release.assets, provenance, { now }), /bounded retention budget/);
  assert.equal((await readRetained(folder, { now })).length, 0);
});

test('retained non-code asset dependencies must still exist with their exact hash', async t => {
  const folder = await root(t), old = await build(folder, 'old', { dependencies: true }), next = await build(folder, 'new');
  await archiveRelease(folder, old.graph, old.assets, provenance, { now }); await current(folder, next);
  await assert.rejects(prepareReleaseAssets(folder, { now }), /ENOENT/);
  await writeFile(join(folder, 'dist-preview/assets/rain-abc123.mp3'), 'changed-audio');
  await assert.rejects(prepareReleaseAssets(folder, { now }), /dependency is absent or changed/);
});

test('relative hashed CSS fonts are registered, and unsupported hashed CSS dependencies fail closed', async t => {
  const folder = await root(t), release = await build(folder, 'font');
  await writeFile(join(release.directory, 'assets/face-abc.woff2'), 'font-bytes');
  await writeFile(join(release.directory, 'assets/index-font.css'), '@font-face{src:url(./face-abc.woff2)}.grain{background:url("data:image/svg+xml,%3Csvg filter=\'url(%23grain)\'/%3E")}');
  assert.equal((await currentGraph(release.directory)).dependencies[0].path, 'assets/face-abc.woff2');
  await writeFile(join(release.directory, 'assets/index-font.css'), '.a{background:url(./unsupported-abc.avif)}');
  await assert.rejects(currentGraph(release.directory), /unsupported hashed CSS dependency/);
});

test('chunked oversized bodies are cancelled before buffering beyond the declared cap', async t => {
  const folder = await root(t); let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); controller.enqueue(new Uint8Array(3 * 1024 * 1024)); }, cancel() { cancelled = true; } }));
  await assert.rejects(retainLiveRelease(folder, { request: async () => response, now }), /exceeds its bound/);
  assert.equal(cancelled, true);
});

test('oversized declared graph budgets and unbounded deadlines are rejected before any asset request', async t => {
  const folder = await root(t), release = await build(folder, 'live');
  const huge = structuredClone(release.graph);
  for (let i = 0; i < 9; i++) huge.assets.push({ path: `assets/large-${i}.js`, bytes: 4 * 1024 * 1024, sha256: 'a'.repeat(64) });
  let requests = 0;
  await assert.rejects(retainLiveRelease(folder, { now, request: async url => {
    requests++;
    if (url.endsWith('/')) return new Response(release.index);
    assert.ok(url.endsWith('/nooks-release.json'), 'no declared oversized asset may be requested');
    return new Response(JSON.stringify({ version: 1, current: huge, retained: [] }), { headers: { 'content-type': 'application/json' } });
  } }), /bounded retention budget/);
  assert.equal(requests, 2);
  const record = { graph: release.graph, provenance, capturedAt: new Date(now).toISOString(), retainUntil: new Date(now + RETENTION_MS).toISOString() };
  for (const changed of [ { ...record, retainUntil: '9999-01-01T00:00:00.000Z' }, { ...record, capturedAt: new Date(now + 3600000).toISOString(), retainUntil: new Date(now + 3600000 + RETENTION_MS).toISOString() }, { ...record, provenance: { ...provenance, secret: 'unregistered' } } ]) {
    assert.throws(() => validateEnvelope({ version: 1, current: release.graph, retained: [changed] }, { now }), /retention deadline|provenance field/);
  }
});

test('unknown bootstrap, changed alias and stale capture stop publication without silently forgetting older clients', async t => {
  const folder = await root(t), release = await build(folder, 'live');
  await assert.rejects(retainLiveRelease(folder, { request: publicRequests(release, [], { manifest: false }), now }), /Unknown live release/);
  await assert.rejects(retainLiveRelease(folder, { request: publicRequests(release, [], { indexChanges: true }), now }), /changed while its assets/);
  assert.equal((await readRetained(folder, { now })).length, 0);
  await archiveRelease(folder, release.graph, release.assets, provenance, { now });
  const capture = await retainLiveRelease(folder, { request: publicRequests(release, [], { manifest: false }), now });
  await verifyLiveRelease(capture, { request: publicRequests(release), now: now + 1000 });
  await assert.rejects(verifyLiveRelease(capture, { request: publicRequests(release), now: now + MAX_CAPTURE_AGE_MS + 1 }), /too old/);
  await assert.rejects(verifyLiveRelease(capture, { request: async () => new Response('other-index'), now }), /changed before publishing/);
});

test('missing assets terminate after filesystem lookup with404/no-store before SPA fallback; manifest is not immutable', () => {
  const routes = previewOutputConfig.routes, filesystem = routes.findIndex(route => route.handle === 'filesystem');
  const missing = routes.findIndex(route => route.status === 404);
  assert.ok(missing > filesystem); assert.ok(missing < routes.findIndex(route => route.dest === '/index.html'));
  assert.equal(routes[missing].headers['Cache-Control'], 'no-store');
  for (const path of ['/assets/missing.js', '/assets/missing.js?nooks_retry=1', '/assets']) assert.match(path.split('?')[0], new RegExp(`^(?:${routes[missing].src})$`));
  const manifest = routes.find(route => route.src === '/nooks-release\\.json'); assert.equal(manifest.headers['Cache-Control'], 'no-store');
});
