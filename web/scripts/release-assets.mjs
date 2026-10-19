/** Retain only verified public build assets. No server code, HTML, or user data. */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const PUBLIC_ORIGIN = 'https://nooks-study-space.vercel.app';
export const RETENTION_MS = 48 * 60 * 60 * 1000;
export const MAX_CAPTURE_AGE_MS = 60 * 60 * 1000;
export const MAX_GRAPHS = 16;
export const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assetPath = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.(?:js|css)$/;
const dependencyPath = /^assets\/[A-Za-z0-9_.-]+\.(?:mp3|woff2?|ttf|otf|webp|png|svg)$/;
const fail = message => { throw new Error(`Public deployment stopped: ${message}`); };
const storePath = root => join(root, 'release-assets');
async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) fail('Retained asset is not a bounded regular file.');
  return readFile(path);
}
function fileMatches(bytes, entry) { return bytes.length === entry.bytes && digest(bytes) === entry.sha256; }
function entries(value, pattern) {
  if (!Array.isArray(value) || value.length > 128) fail('Invalid release asset list.');
  const paths = new Set();
  for (const entry of value) {
    if (!entry || !pattern.test(entry.path) || paths.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX_FILE_BYTES) fail('Invalid release asset entry.');
    paths.add(entry.path);
  }
  return value;
}
export function validateGraph(graph) {
  if (!graph || !/^[a-f0-9]{64}$/.test(graph.indexSha256) || graph.id !== graph.indexSha256.slice(0, 24)) fail('Invalid release identity.');
  entries(graph.assets, assetPath); entries(graph.dependencies, dependencyPath);
  if (!graph.assets.some(entry => entry.path.endsWith('.js')) || !graph.assets.some(entry => entry.path.endsWith('.css'))) fail('Release lacks JavaScript or styles.');
  return graph;
}
function validateProvenance(value) {
  if (!value || typeof value !== 'object') fail('Invalid release provenance.');
  const hash = input => /^[a-f0-9]{64}$/.test(input ?? '');
  const allowed = value.kind === 'verified-public-manifest'
    ? ['kind', 'url', 'manifestSha256', 'indexSha256']
    : ['kind', 'immutableDeployment', 'verificationReportSha256', 'verificationSampledAt', 'sourceCommit', 'lockSha256', 'sourceState'];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unknown release provenance field.');
  if (value.kind === 'verified-public-manifest') {
    if (value.url !== `${PUBLIC_ORIGIN}/nooks-release.json` || !hash(value.manifestSha256) || !hash(value.indexSha256)) fail('Invalid public manifest provenance.');
  } else if (value.kind === 'exact-published-verification') {
    if (!/^https:\/\/nooks-study-space-[a-z0-9]+-eeshpara-1663s-projects\.vercel\.app$/.test(value.immutableDeployment ?? '')
      || !hash(value.verificationReportSha256) || !Number.isFinite(Date.parse(value.verificationSampledAt))
      || (value.sourceCommit !== null && !/^[a-f0-9]{40}$/.test(value.sourceCommit ?? ''))
      || (value.lockSha256 !== undefined && !hash(value.lockSha256))
      || (value.sourceState !== undefined && (typeof value.sourceState !== 'string' || value.sourceState.length > 256))) fail('Invalid published-byte provenance.');
  } else fail('Unknown release provenance.');
}
function validateRecord(record, now = Date.now()) {
  validateGraph(record?.graph);
  const captured = Date.parse(record.capturedAt), until = Date.parse(record.retainUntil);
  if (!Number.isFinite(captured) || !Number.isFinite(until) || captured > now + 5 * 60 * 1000
    || until !== captured + RETENTION_MS) fail('Invalid release retention deadline.');
  validateProvenance(record.provenance);
  return record;
}
export function validateEnvelope(envelope, { now = Date.now() } = {}) {
  if (envelope?.version !== 1 || !Array.isArray(envelope.retained) || envelope.retained.length > MAX_GRAPHS) fail('Invalid public release manifest.');
  validateGraph(envelope.current); envelope.retained.forEach(record => validateRecord(record, now));
  if (new Set(envelope.retained.map(record => record.graph.id)).size !== envelope.retained.length) fail('Duplicate retained release.');
  return envelope;
}
function union(records) {
  const result = new Map();
  for (const record of records) for (const entry of record.graph.assets) {
    const previous = result.get(entry.path);
    if (previous && (previous.sha256 !== entry.sha256 || previous.bytes !== entry.bytes)) fail('Retained asset filename collision.');
    result.set(entry.path, entry);
  }
  return result;
}
function checkBudget(records) {
  union(records);
  if (records.length > MAX_GRAPHS || records.reduce((total, record) => total + record.graph.assets.reduce((sum, entry) => sum + entry.bytes, 0), 0) > MAX_BYTES) fail('Unexpired releases exceed the bounded retention budget; no release was evicted.');
}
export async function readRetained(root, { now = Date.now(), prune = false } = {}) {
  const folder = storePath(root);
  try { const info = await lstat(folder); if (!info.isDirectory() || info.isSymbolicLink()) fail('Release asset store must be a real directory.'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const records = [];
  for (const name of (await readdir(folder)).sort()) {
    if (name === 'README.md') continue;
    if (/^\.expired-[a-f0-9]{24}$/.test(name)) {
      const path = join(folder, name), info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) fail('Retired generation must be a real directory.');
      if (prune) await rm(path, { recursive: true });
      continue;
    }
    if (!/^[a-f0-9]{24}$/.test(name)) fail('Unknown file in release asset store.');
    const directory = join(folder, name), info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('Retained generation must be a real directory.');
    const record = validateRecord(JSON.parse((await regular(join(directory, 'manifest.json'))).toString()), now);
    if (record.graph.id !== name) fail('Retained release directory differs from its identity.');
    const top = (await readdir(directory)).sort();
    if (JSON.stringify(top) !== JSON.stringify(['assets', 'manifest.json'])) fail('Retained release contains unexpected files.');
    const assetsInfo = await lstat(join(directory, 'assets'));
    if (!assetsInfo.isDirectory() || assetsInfo.isSymbolicLink()) fail('Retained assets must be a real directory.');
    const actual = (await readdir(join(directory, 'assets'))).sort();
    if (JSON.stringify(actual) !== JSON.stringify(record.graph.assets.map(entry => entry.path.slice(7)).sort())) fail('Retained asset inventory differs from the verified manifest.');
    for (const entry of record.graph.assets) if (!fileMatches(await regular(join(directory, entry.path)), entry)) fail('Retained asset hash differs from its verified bytes.');
    if (Date.parse(record.retainUntil) <= now) {
      if (prune) {
        const retired = join(folder, `.expired-${name}`);
        await rename(directory, retired); // Atomically remove the whole graph from the active registry.
        await rm(retired, { recursive: true });
      }
      continue;
    }
    records.push(record);
  }
  checkBudget(records); return records;
}
export async function archiveRelease(root, graph, assets, provenance, { now = Date.now(), capturedAt = now } = {}) {
  validateGraph(graph);
  validateProvenance(provenance);
  for (const entry of graph.assets) if (!fileMatches(assets.get(entry.path) ?? Buffer.alloc(0), entry)) fail('Archive input differs from the verified release.');
  const records = await readRetained(root, { now, prune: true });
  const existing = records.find(record => record.graph.id === graph.id);
  if (existing && JSON.stringify(existing.graph) !== JSON.stringify(graph)) fail('Release identity collision.');
  const captured = Math.max(capturedAt, Date.parse(existing?.capturedAt ?? '') || 0);
  const record = validateRecord({ graph, capturedAt: new Date(captured).toISOString(), retainUntil: new Date(captured + RETENTION_MS).toISOString(), provenance }, now);
  const next = [...records.filter(item => item.graph.id !== graph.id), record]; checkBudget(next);
  const directory = join(storePath(root), graph.id);
  await mkdir(join(directory, 'assets'), { recursive: true });
  if (!existing) for (const entry of graph.assets) await writeFile(join(directory, entry.path), assets.get(entry.path), { flag: 'wx' });
  // Assets are immutable and verified before a manifest registers the generation.
  await writeFile(join(directory, 'manifest.next'), JSON.stringify(record, null, 2) + '\n');
  await rename(join(directory, 'manifest.next'), join(directory, 'manifest.json'));
  return record;
}
export async function currentGraph(directory) {
  const index = await regular(join(directory, 'index.html'));
  const assets = [], references = new Set();
  for (const name of (await readdir(join(directory, 'assets'))).sort()) {
    const path = `assets/${name}`; if (!assetPath.test(path)) continue;
    const bytes = await regular(join(directory, path));
    assets.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    for (const match of bytes.toString().matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:mp3|woff2?|ttf|otf|webp|png|svg)\b/g)) references.add(match[0].slice(1));
    if (path.endsWith('.css')) for (const match of bytes.toString().matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^()\s]+))\s*\)/g)) {
      const url = new URL((match[1] ?? match[2] ?? match[3]).trim(), `${PUBLIC_ORIGIN}/${path}`);
      if (url.origin !== PUBLIC_ORIGIN || !url.pathname.startsWith('/assets/')) continue;
      const target = url.pathname.slice(1);
      if (!dependencyPath.test(target) || url.search || url.hash) fail('Review the unsupported hashed CSS dependency before publishing.');
      references.add(target);
    }
  }
  const dependencies = [];
  for (const path of [...references].sort()) { const bytes = await regular(join(directory, path)); dependencies.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
  const indexSha256 = digest(index);
  return validateGraph({ id: indexSha256.slice(0, 24), indexSha256, assets, dependencies });
}
export async function prepareReleaseAssets(root, { now = Date.now() } = {}) {
  const directory = join(root, 'dist-preview');
  let current;
  try {
    const previous = validateEnvelope(JSON.parse((await regular(join(directory, 'nooks-release.json'))).toString()), { now });
    if (digest(await regular(join(directory, 'index.html'))) !== previous.current.indexSha256) fail('Run a clean build before replacing a registered release.');
    current = previous.current;
    for (const entry of current.assets) if (!fileMatches(await regular(join(directory, entry.path)), entry)) fail('Registered current build was modified before packaging.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; current = await currentGraph(directory); }
  const retained = await readRetained(root, { now, prune: true });
  for (const record of retained) {
    for (const entry of record.graph.dependencies) if (!fileMatches(await regular(join(directory, entry.path)), entry)) fail('A retained release dependency is absent or changed.');
    for (const entry of record.graph.assets) {
      const path = join(directory, entry.path), bytes = await regular(join(storePath(root), record.graph.id, entry.path));
      try { if (!fileMatches(await regular(path), entry)) fail('Current and retained asset paths collide.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(path, bytes, { flag: 'wx' }); }
    }
  }
  const envelope = { version: 1, current, retained };
  await writeFile(join(directory, 'nooks-release.json'), JSON.stringify(envelope, null, 2) + '\n');
  return envelope;
}
export async function verifyReleaseAssets(root, directory = join(root, 'dist-preview'), { now = Date.now() } = {}) {
  const envelope = validateEnvelope(JSON.parse((await regular(join(directory, 'nooks-release.json'))).toString()), { now });
  if (digest(await regular(join(directory, 'index.html'))) !== envelope.current.indexSha256) fail('Current HTML differs from its registered release.');
  const retained = await readRetained(root, { now });
  if (JSON.stringify(envelope.retained) !== JSON.stringify(retained)) fail('Packaged retained releases differ from the verified registry.');
  const expected = union([{ graph: envelope.current }, ...retained]);
  const actual = (await readdir(join(directory, 'assets'))).filter(name => /\.(?:js|css)$/.test(name)).map(name => `assets/${name}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected.keys()].sort())) fail('Packaged JavaScript/styles differ from the exact current and retained union.');
  for (const entry of expected.values()) if (!fileMatches(await regular(join(directory, entry.path)), entry)) fail('Packaged asset differs from its registered hash.');
  for (const graph of [envelope.current, ...retained.map(record => record.graph)]) for (const entry of graph.dependencies) if (!fileMatches(await regular(join(directory, entry.path)), entry)) fail('A registered release dependency is missing or changed.');
  return envelope;
}
async function get(path, request, maxBytes = MAX_FILE_BYTES) {
  const response = await request(PUBLIC_ORIGIN + path, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > maxBytes) fail('Current live release could not be read safely.');
  const reader = response.body?.getReader();
  if (!reader) fail('Live release response has no readable body.');
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); fail('Live release response exceeds its bound.'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks, total), type: response.headers.get('content-type') ?? '' };
}
export async function retainLiveRelease(root, { request = fetch, now = Date.now() } = {}) {
  const index = await get('/', request), indexSha256 = digest(index.bytes);
  const local = await readRetained(root, { now, prune: true });
  const published = await get('/nooks-release.json', request, 1024 * 1024);
  let current, carried, provenance;
  if (/application\/json/i.test(published.type)) {
    const envelope = validateEnvelope(JSON.parse(published.bytes.toString()), { now });
    if (envelope.current.indexSha256 !== indexSha256) fail('Live release changed during capture.');
    current = envelope.current; carried = envelope.retained.filter(record => Date.parse(record.retainUntil) > now);
    provenance = { kind: 'verified-public-manifest', url: `${PUBLIC_ORIGIN}/nooks-release.json`, manifestSha256: digest(published.bytes), indexSha256 };
  } else {
    // One-time migration: only previously registered, independently verified releases.
    const records = await readRetained(root, { now });
    const bootstrap = records.find(record => record.graph.indexSha256 === indexSha256);
    if (!bootstrap) fail('Unknown live release has no registered manifest; archive its verified graph before publishing.');
    current = bootstrap.graph; carried = []; provenance = bootstrap.provenance;
  }
  const all = [...carried.filter(record => record.graph.id !== current.id), { graph: current }];
  // Bound declared graphs before requesting any asset bodies, not after download.
  checkBudget(all);
  checkBudget([...new Map([...local, ...all].map(record => [record.graph.id, record])).values()]);
  const fetched = new Map();
  for (const entry of union(all).values()) {
    const result = await get('/' + entry.path, request);
    const type = entry.path.endsWith('.css') ? /^text\/css(?:;|$)/i : /^(?:application\/(?:javascript|x-javascript)|text\/javascript)(?:;|$)/i;
    if (!type.test(result.type) || !fileMatches(result.bytes, entry)) fail('Live asset is not the registered JavaScript or stylesheet.');
    fetched.set(entry.path, result.bytes);
  }
  if (digest((await get('/', request)).bytes) !== indexSha256) fail('Live alias changed while its assets were captured.');
  for (const record of carried) {
    // Do not extend old generations on each rollout; their original deadline is authoritative.
    await archiveRelease(root, record.graph, fetched, record.provenance, { now, capturedAt: Date.parse(record.capturedAt) });
  }
  await archiveRelease(root, current, fetched, provenance, { now });
  return { indexSha256, capturedAt: now };
}
export async function verifyLiveRelease(capture, { request = fetch, now = Date.now() } = {}) {
  if (!capture || now - capture.capturedAt > MAX_CAPTURE_AGE_MS || now < capture.capturedAt) fail('Live-release capture is too old; restart the guarded deployment.');
  if (digest((await get('/', request)).bytes) !== capture.indexSha256) fail('Live alias changed before publishing; recapture it before replacement.');
}
