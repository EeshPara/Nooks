/** Compare a deployed public release with the exact local packaged compatibility manifest. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const origin = 'https://nooks-study-space.vercel.app';
const root = new URL('../../', import.meta.url);
const expected = JSON.parse(await readFile(new URL('web/dist-preview/nooks-release.json', root), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
async function get(path, limit = 4 * 1024 * 1024) {
  const response = await fetch(origin + path, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.length; if (bytes > limit) throw new Error('Public response exceeded limit');
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return { status: response.status, type: response.headers.get('content-type') ?? '', cache: response.headers.get('cache-control') ?? '', body: Buffer.concat(chunks) };
}
const registry = await get('/nooks-release.json', 1024 * 1024);
rows.push({ path: '/nooks-release.json', status: registry.status, type: registry.type, cache: registry.cache,
  passed: registry.status === 200 && registry.type.includes('application/json') && registry.cache.includes('no-store') && !registry.cache.includes('immutable') && isDeepStrictEqual(JSON.parse(registry.body.toString()), expected) });
const index = await get('/');
rows.push({ path: '/', status: index.status, sha256: sha(index.body), passed: index.status === 200 && sha(index.body) === expected.current.indexSha256 });
const assets = new Map();
for (const graph of [expected.current, ...expected.retained.map(record => record.graph)]) {
  for (const entry of graph.assets) {
    const previous = assets.get(entry.path);
    if (previous && !isDeepStrictEqual(previous, entry)) throw new Error('Expected manifest filename collision');
    assets.set(entry.path, entry);
  }
}
async function assetCheck(path, entry) {
  const result = await get(path);
  const typeOK = entry.path.endsWith('.css') ? /^text\/css(?:;|$)/i.test(result.type) : /^(?:application\/(?:javascript|x-javascript)|text\/javascript)(?:;|$)/i.test(result.type);
  rows.push({ path, status: result.status, type: result.type, cache: result.cache, bytes: result.body.length, sha256: sha(result.body),
    passed: result.status === 200 && typeOK && result.body.length === entry.bytes && sha(result.body) === entry.sha256 && result.cache.includes('immutable') });
}
for (const entry of assets.values()) await assetCheck('/' + entry.path, entry);
for (const record of expected.retained) {
  const editor = record.graph.assets.find(entry => /study-content-.*\.js$/.test(entry.path));
  if (editor) await assetCheck('/' + editor.path + '?nooks_retry=1', editor);
}
for (const path of ['/assets/nooks-confirmed-missing-release-20261008.js', '/assets/nooks-confirmed-missing-release-20261008.js?nooks_retry=1']) {
  const result = await get(path, 256 * 1024);
  rows.push({ path, status: result.status, type: result.type, cache: result.cache,
    passed: result.status === 404 && result.cache.includes('no-store') && !result.cache.includes('immutable') && sha(result.body) !== expected.current.indexSha256 });
}
const report = { sampledAt: new Date().toISOString(), origin, current: expected.current.id,
  retained: expected.retained.map(record => ({ id: record.graph.id, retainUntil: record.retainUntil })),
  scope: 'Actual public current/retained JS and CSS hashes, retry URLs, release registry, and missing-asset cache behavior. Browser behavior is separate.',
  passed: rows.every(row => row.passed), rows };
await writeFile(new URL('public-compatibility-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: rows.length, failed: rows.filter(row => !row.passed) }, null, 2));
if (!report.passed) process.exitCode = 1;
