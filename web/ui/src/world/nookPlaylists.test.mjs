import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const load = async path => {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { nookPlaylists, getNookPlaylist } = await load('./nookPlaylists.ts');
const { roomScenes } = await load('../personalization/types.ts');
const { parseSpotifyLink } = await load('./spotifyLink.ts');
const names = JSON.parse(fs.readFileSync(new URL('./nook-names.json', import.meta.url), 'utf8'));

test('all 50 public nooks use their researched Spotify recommendation', () => {
  const research = JSON.parse(fs.readFileSync(new URL('../../../../creative/nooks-50-backgrounds/spotify-research.json', import.meta.url), 'utf8'));
  assert.deepEqual(research.map(item => item.roomId).sort(), roomScenes.map(item => item.id).sort());
  for (const item of research) {
    const { title, curator, vibe, url } = item;
    assert.deepEqual(getNookPlaylist(item.roomId), { title, curator, vibe, url });
    assert.match(item.sourceUrl, /^https:\/\/open\.spotify\.com\//);
  }
});

test('every built-in nook and unlockable annex has an explicit curated soundtrack', () => {
  const ids = new Set([...roomScenes.map(nook => nook.id), ...Object.keys(names), 'moonstone-annex', 'crystal-vault']);
  assert.deepEqual(Object.keys(nookPlaylists).sort(), [...ids].sort());
  for (const id of ids) assert.equal(getNookPlaylist(id), nookPlaylists[id], id);
});

test('catalog links are canonical public Spotify playlists accepted by the existing player', () => {
  for (const [id, playlist] of Object.entries(nookPlaylists)) {
    assert.match(playlist.url, /^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]{22}$/, id);
    const parsed = parseSpotifyLink(playlist.url);
    assert.equal(parsed?.kind, 'playlist', id);
    assert.equal(parsed?.url, playlist.url, id);
    for (const key of ['title', 'curator', 'vibe']) {
      assert.ok(typeof playlist[key] === 'string' && playlist[key].trim().length > 0, `${id}: ${key}`);
      assert.ok(playlist[key].length <= 100, `${id}: ${key} remains concise`);
    }
    assert.notEqual(playlist.curator, 'Nooks', 'selection must not imply Nooks owns a third-party playlist');
  }
});

test('settings have musical variety and source metadata stays consistent when a playlist is reused', () => {
  const sources = new Map();
  for (const playlist of Object.values(nookPlaylists)) {
    const metadata = { title: playlist.title, curator: playlist.curator };
    if (sources.has(playlist.url)) assert.deepEqual(metadata, sources.get(playlist.url));
    sources.set(playlist.url, metadata);
  }
  assert.ok(sources.size >= 10, 'distinct settings should not all use the same playlist');
  assert.notEqual(nookPlaylists['sakura-garden'].url, nookPlaylists['neon-tokyo'].url);
  assert.notEqual(nookPlaylists['oxford-library'].url, nookPlaylists['mosslight-dungeon'].url);
});

test('custom and unknown nook IDs use a safe default, including inherited object property names', () => {
  for (const id of ['custom-my-nook', '', 'toString', 'constructor', '__proto__']) {
    const playlist = getNookPlaylist(id);
    assert.equal(playlist.title, 'Lofi Girl - beats to relax/study to');
    assert.equal(parseSpotifyLink(playlist.url)?.kind, 'playlist');
  }
});
