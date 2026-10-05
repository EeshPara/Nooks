import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./spotifyLink.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('spotifyLink.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parser = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'parseSpotifyLink');
assert.ok(parser, 'Spotify link parser must be exported by the shared link module');
const code = ts.transpileModule(parser.getText(ast), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseSpotifyLink } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const id = '37i9dQZF1DX4sWSpwq3LiO';

for (const kind of ['playlist', 'album', 'track']) {
  test(`canonical ${kind} link strips tracking parameters`, () => {
    const result = parseSpotifyLink(`https://open.spotify.com/${kind}/${id}?si=tracking`);
    assert.equal(result.url, `https://open.spotify.com/${kind}/${id}`);
    assert.equal(result.embed, `https://open.spotify.com/embed/${kind}/${id}?theme=0`);
  });
  test(`Spotify ${kind} URI produces a trusted embed`, () => {
    assert.equal(parseSpotifyLink(`spotify:${kind}:${id}`).uri, `spotify:${kind}:${id}`);
  });
  test(`copied ${kind} embed URL produces a canonical URL`, () => {
    assert.equal(parseSpotifyLink(`https://open.spotify.com/embed/${kind}/${id}?theme=0`).url, `https://open.spotify.com/${kind}/${id}`);
  });
  test(`localized ${kind} link produces a canonical URL`, () => {
    assert.equal(parseSpotifyLink(`https://open.spotify.com/intl-en/${kind}/${id}`).url, `https://open.spotify.com/${kind}/${id}`);
  });
}

const invalid = {
  'lookalike domain': `https://open.spotify.com.evil.example/playlist/${id}`,
  'insecure URL': `http://open.spotify.com/playlist/${id}`,
  'credential-bearing URL': `https://evil.example@open.spotify.com/playlist/${id}`,
  'nonstandard port': `https://open.spotify.com:8443/playlist/${id}`,
  'unsupported artist page': `https://open.spotify.com/artist/${id}`,
  'script URL': 'javascript:alert(1)',
  'malformed content ID': 'spotify:track:bad',
  'extra path segment': `https://open.spotify.com/track/${id}/extra`,
};
for (const [name, input] of Object.entries(invalid)) test(`rejects ${name}`, () => assert.equal(parseSpotifyLink(input), null));

test('legacy Spotify playlist share link is canonicalized', () => {
  assert.equal(parseSpotifyLink(`https://open.spotify.com/user/spotify/playlist/${id}`).url, `https://open.spotify.com/playlist/${id}`);
});
test('legacy playlist path still rejects trailing segments', () => {
  assert.equal(parseSpotifyLink(`https://open.spotify.com/user/spotify/playlist/${id}/extra`), null);
});
test('an entire embed HTML tag is not treated as a link', () => {
  assert.equal(parseSpotifyLink(`<iframe src="https://open.spotify.com/embed/playlist/${id}"></iframe>`), null);
});

const moduleCode = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { withSpotifyMetadata, savedSpotifyLink, spotifyKey, spotifyMetadataKey } = await import('data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64'));

test('curated display metadata cannot replace the canonical embed URL', () => {
  const original = parseSpotifyLink(`https://open.spotify.com/playlist/${id}`);
  const result = withSpotifyMetadata(original, { title: 'Quiet\n Library', curator: 'Spotify', embed: 'https://evil.example', url: 'https://evil.example' });
  assert.equal(result.title, 'Quiet Library');
  assert.equal(result.curator, 'Spotify');
  assert.equal(result.url, original.url);
  assert.equal(result.embed, original.embed);
  assert.equal(withSpotifyMetadata(original, { title: 'x'.repeat(400), curator: 'y'.repeat(400) }).title.length, 120);
  assert.equal(withSpotifyMetadata(original, { title: 'x', curator: 'y'.repeat(400) }).curator.length, 80);
  assert.deepEqual(withSpotifyMetadata(original, { title: 123, curator: 'Not a valid label' }), original);
});

test('restored playlist uses matching metadata and tolerates stale or corrupt labels', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null } });
  try {
    const url = `https://open.spotify.com/playlist/${id}`;
    values.set(spotifyKey, url);
    values.set(spotifyMetadataKey, JSON.stringify({ url, title: 'Deep Focus', curator: 'Spotify' }));
    assert.equal(savedSpotifyLink().title, 'Deep Focus');
    values.set(spotifyMetadataKey, JSON.stringify({ url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn', title: 'Wrong playlist' }));
    assert.equal(savedSpotifyLink().title, undefined);
    values.set(spotifyMetadataKey, '{corrupt');
    assert.equal(savedSpotifyLink().url, url);
    values.set(spotifyKey, 'https://evil.example');
    assert.equal(savedSpotifyLink(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
