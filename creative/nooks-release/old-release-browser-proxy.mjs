/** Local device-only QA: reconstructed old HTML, exact old JS/CSS from the live alias. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log('Usage: node old-release-browser-proxy.mjs <verified-old-index.html> <old-public-asset-verification.json>');
  process.exit(1);
}
const origin = 'https://nooks-study-space.vercel.app';
const index = readFileSync(args[0]);
const report = JSON.parse(readFileSync(args[1], 'utf8'));
if (!report.passed || report.origin !== origin) throw new Error('Expected passing public release evidence');
const expected = new Map(report.rows.filter(row => /\.(js|css)$/.test(row.path)).map(row => [row.path, row]));
if (!expected.size || [...index.toString().matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].some(match => !expected.has(match[1]))) {
  throw new Error('Old HTML does not match the recorded asset graph');
}
const observations = [];
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:5192');
  const send = (status, type, body) => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); response.end(body); };
  if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'text/plain', 'Read-only QA');
  if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', index);
  if (url.pathname === '/api/config') return send(200, 'application/json', JSON.stringify({ backend: 'unconfigured', capabilities: { generation: false } }));
  if (url.pathname === '/__qa/state') return send(200, 'application/json', JSON.stringify({
    origin, oldIndexSha256: createHash('sha256').update(index).digest('hex'), observations,
  }));
  if (!/^\/(?:assets|images|videos|media)\/[a-zA-Z0-9_./-]+$/.test(url.pathname) || url.pathname.includes('..')) return send(404, 'text/plain', 'Not a QA asset');
  if (/\.(js|css)$/.test(url.pathname) && !expected.has(url.pathname)) return send(404, 'text/plain', 'Not in the verified old graph');
  try {
    // No browser cookies, credentials or arbitrary request headers are forwarded.
    const upstream = await fetch(origin + url.pathname + url.search, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    const reader = upstream.body.getReader();
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.length;
        if (bytes > 16 * 1024 * 1024) throw new Error('QA asset size limit');
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const body = Buffer.concat(chunks);
    const record = expected.get(url.pathname);
    if (record) {
      const sha256 = createHash('sha256').update(body).digest('hex');
      const passed = upstream.status === 200 && sha256 === record.sha256 && bytes === record.bytes;
      observations.push({ path: url.pathname, query: url.search, status: upstream.status, bytes, sha256, passed });
      if (!passed) return send(502, 'text/plain', 'Live old asset does not match release evidence');
    }
    return send(upstream.status, upstream.headers.get('content-type') || 'application/octet-stream', body);
  } catch {
    return send(502, 'text/plain', 'Public asset unavailable');
  }
}).listen(5192, '127.0.0.1', () => console.log('Old release browser QA at http://127.0.0.1:5192; all assets fetched from the public alias.'));
