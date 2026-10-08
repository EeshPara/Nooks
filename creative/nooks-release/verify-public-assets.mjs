/** Read-only byte verification of the existing public Nooks release. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'https://nooks-study-space.vercel.app';
const manifest = JSON.parse(await readFile(resolve(root, 'creative/nooks-animated-all/manifest.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
const assets = manifest.clips.map(clip => ({ path: clip.video, sha256: clip.qa.videoSha256, kind: 'video' }));
const built = resolve(root, 'web/dist-preview');
const html = await readFile(resolve(built, 'index.html'), 'utf8');
const entries = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
for (const path of new Set([...entries, ...(await readdir(resolve(built, 'assets'))).filter(name => name.endsWith('.mp3')).map(name => `/assets/${name}`)])) {
  assets.push({ path, sha256: hash(await readFile(resolve(built, path.slice(1)))), kind: path.endsWith('.mp3') ? 'audio' : 'entry' });
}
const rows = [];
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < assets.length) {
    const asset = assets[cursor++];
    try {
      const response = await fetch(origin + asset.path, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      const digest = hash(bytes);
      const type = response.headers.get('content-type') || '';
      const cors = response.headers.get('access-control-allow-origin');
      const mediaType = asset.kind === 'video' ? type.startsWith('video/mp4') : asset.kind === 'audio' ? type.startsWith('audio/mpeg') : true;
      rows.push({ ...asset, status: response.status, bytes: bytes.length, actualSha256: digest,
        contentType: type, cors, passed: response.ok && digest === asset.sha256 && mediaType && (asset.kind !== 'audio' || cors === '*') });
    } catch {
      rows.push({ ...asset, passed: false, error: 'Transport failed or timed out; no remote body retained' });
    }
  }
}));
rows.sort((a, b) => a.path.localeCompare(b.path));
const report = { sampledAt: new Date().toISOString(), origin, passed: rows.every(row => row.passed),
  scope: 'Deployed exact bytes, media types and public audio CORS; not continuous playback or listening', rows };
await writeFile(new URL('public-asset-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log({ passed: report.passed, assets: rows.length, videos: rows.filter(row => row.kind === 'video').length,
  audio: rows.filter(row => row.kind === 'audio').length, failed: rows.filter(row => !row.passed).map(row => row.path) });
if (!report.passed) process.exitCode = 1;
