import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./spotifyLink.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { parseSpotifyLink, withSpotifyMetadata, savedNookSpotifyLink, saveNookSpotifyLink, nookSpotifyKey } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const recommended = withSpotifyMetadata(parseSpotifyLink('https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO'), { title: 'Peaceful Piano', curator: 'Spotify' });
const personal = parseSpotifyLink('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ');
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
test.beforeEach(() => values.clear());

test('every new nook starts with its curated playlist without Spotify login or a previous global link', () => {
  assert.deepEqual(savedNookSpotifyLink('rainy-library', recommended), recommended);
});
test('a personal choice stays in its nook across reload and never replaces another nook’s soundtrack', () => {
  saveNookSpotifyLink('rainy-library', personal);
  assert.deepEqual(savedNookSpotifyLink('rainy-library', recommended), personal);
  assert.deepEqual(savedNookSpotifyLink('gryffindor-common-room', recommended), recommended);
});
test('stopping music stays silent in that nook and the next nook still offers its playlist', () => {
  saveNookSpotifyLink('rainy-library', null);
  assert.equal(savedNookSpotifyLink('rainy-library', recommended), null);
  assert.deepEqual(savedNookSpotifyLink('stardew-farmhouse', recommended), recommended);
});
test('returning to the nook default follows later curation updates', () => {
  saveNookSpotifyLink('rainy-library', personal);
  saveNookSpotifyLink('rainy-library', recommended, true);
  assert.deepEqual(savedNookSpotifyLink('rainy-library', personal), personal);
});
test('damaged storage and unsafe custom URLs cannot replace the trusted Spotify player', () => {
  for(const value of ['not-json', JSON.stringify({mode:'custom',url:'https://evil.example/player'}), JSON.stringify({mode:'custom',url:42})]) {
    values.set(nookSpotifyKey('rainy-library'),value);
    assert.deepEqual(savedNookSpotifyLink('rainy-library',recommended),recommended);
  }
});
