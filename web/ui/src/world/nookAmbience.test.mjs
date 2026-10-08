import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('./nookAmbience.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { loadAmbience, defaultAmbience, ambienceKey, safeVolume } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null };
test('pilot nooks start with matching quiet ambience and no competing synth music', () => {
  for (const [id, channel] of [['rainy-library', 'rain'], ['howls-moving-study', 'fire'], ['gryffindor-common-room', 'fire']]) {
    const p = loadAmbience(id, storage);
    assert.deepEqual(Object.keys(p.levels).filter(k => p.levels[k] > 0), [channel]);
    assert.ok(p.master <= .5);
  }
});
test('changing nooks restores each saved mix, including silence, without carrying the previous mix', () => {
  const rain = defaultAmbience('rainy-library'); rain.levels.rain = .23; rain.master = 0;
  values.set(ambienceKey('rainy-library'), JSON.stringify(rain));
  assert.deepEqual(loadAmbience('rainy-library', storage), rain);
  assert.deepEqual(loadAmbience('gryffindor-common-room', storage), defaultAmbience('gryffindor-common-room'));
  assert.deepEqual(loadAmbience('rainy-library', storage), rain);
  values.clear();
});
test('legacy mixes remain available elsewhere but do not override matching pilot presets', () => {
  values.set('notable:ambient-levels:v1', JSON.stringify({ master: .2, levels: { rain: 0, warm: .8 } }));
  assert.equal(loadAmbience('other-nook', storage).levels.warm, .8);
  assert.equal(loadAmbience('rainy-library', storage).levels.warm, 0);
  values.clear();
});
test('broken storage and hostile volume values cannot create unsafe audio gains', () => {
  assert.deepEqual(loadAmbience('rainy-library', { getItem() { throw Error('blocked'); } }), defaultAmbience('rainy-library'));
  values.set(ambienceKey('rainy-library'), '{broken');
  assert.deepEqual(loadAmbience('rainy-library', storage), defaultAmbience('rainy-library'));
  values.set(ambienceKey('rainy-library'), JSON.stringify({ master: 30, local: -2, levels: { rain: 'loud', fire: 200 } }));
  const p = loadAmbience('rainy-library', storage);
  assert.equal(p.master, 1); assert.equal(p.local, 0); assert.equal(p.levels.rain, 0); assert.equal(p.levels.fire, 1);
  for (const value of [NaN, Infinity, null, '1']) assert.equal(safeVolume(value), 0);
  values.clear();
});
