import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('./nookAmbience.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { loadAmbience, defaultAmbience, ambienceKey, safeVolume, ambiencePresets } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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
test('unconfigured nooks stay quiet instead of inheriting global or auto-saved ambient mixes', () => {
  const old = { rain: .38, brown: .12, fire: .2, warm: .16 };
  values.set('notable:ambient-levels:v1', JSON.stringify({ master: .2, levels: old }));
  assert.deepEqual(loadAmbience('other-nook', storage).levels, { rain: 0, brown: 0, fire: 0, warm: 0, scene: 0 });
  values.set(ambienceKey('other-nook'), JSON.stringify({ levels: old }));
  assert.deepEqual(loadAmbience('other-nook', storage).levels, { rain: 0, brown: 0, fire: 0, warm: 0, scene: 0 });
  values.set(ambienceKey('other-nook'), JSON.stringify({ levels: old, customized: true }));
  assert.deepEqual(loadAmbience('other-nook', storage).levels, { ...old, scene: 0 });
  for (const id of ['constructor', '__proto__', 'toString']) assert.deepEqual(defaultAmbience(id).levels, { rain: 0, brown: 0, fire: 0, warm: 0, scene: 0 });
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

test('all 50 current nooks have an explicit gentle natural preset', async () => {
  const catalog = await readFile(new URL('../personalization/types.ts', import.meta.url), 'utf8');
  const ids = [...catalog.split('export const roomScenes = [')[1].split('] as const')[0].matchAll(/"id": "([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, 50);
  assert.deepEqual(Object.keys(ambiencePresets).sort(), ids.sort());
  for (const id of ids) {
    const p = defaultAmbience(id);
    assert.equal(p.levels.brown, 0); assert.equal(p.levels.warm, 0);
    assert.ok(p.levels.rain + p.levels.fire + p.levels.scene > 0, id);
    assert.ok(p.levels.rain + p.levels.fire + p.levels.scene < .8, id);
  }
});
test('pre-expansion saved silence stays silent and old auto-cached generic mixes migrate', () => {
  values.set(ambienceKey('lighthouse-study'), JSON.stringify({ customized:true, levels:{rain:0,fire:0,brown:0,warm:0} }));
  assert.equal(loadAmbience('lighthouse-study', storage).levels.scene, 0);
  values.set(ambienceKey('lighthouse-study'), JSON.stringify({ levels:{ rain:.38, brown:.12, fire:.2, warm:.16 } }));
  assert.deepEqual(loadAmbience('lighthouse-study', storage), defaultAmbience('lighthouse-study'));
  values.clear();
});
