import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./hostLayout.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { readHostLayout, legacyLayoutUpdate, mergeHostContext, hostLayoutStyle } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const insets = { top: 12, right: 24, bottom: 35, left: 0 };

test('reads the standard flat inset and bounded container schemas', () => {
  const layout = readHostLayout({ displayMode: 'fullscreen', safeAreaInsets: insets, containerDimensions: { width: 900, maxHeight: 640 } });
  assert.deepEqual(layout, { displayMode: 'fullscreen', safeAreaInsets: insets, containerDimensions: { width: 900, maxHeight: 640 } });
  assert.equal(hostLayoutStyle(layout)['--nooks-host-safe-right'], '24px');
  assert.equal(hostLayoutStyle(layout)['--nooks-host-container-max-height'], '640px');
});

test('rejects incomplete or unsafe insets instead of injecting CSS or inventing edges', () => {
  for (const safeAreaInsets of [null, [], {}, { ...insets, bottom: -1 }, { ...insets, bottom: Infinity }, { ...insets, right: NaN }, { ...insets, top: '0; color:red' }, { insets }]) {
    assert.equal(readHostLayout({ safeAreaInsets }).safeAreaInsets, undefined);
  }
  assert.deepEqual(readHostLayout({ safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 } }).safeAreaInsets, { top: 0, right: 0, bottom: 0, left: 0 });
});

test('partial notifications retain other fields while explicit removal clears old geometry', () => {
  const original = { displayMode: 'fullscreen', safeAreaInsets: insets, containerDimensions: { width: 900, height: 700 } };
  const themeChange = mergeHostContext(original, { theme: 'dark' });
  assert.deepEqual(readHostLayout(themeChange).safeAreaInsets, insets);
  const removed = readHostLayout(mergeHostContext(themeChange, { safeAreaInsets: undefined, containerDimensions: {} }));
  assert.equal(removed.safeAreaInsets, undefined);
  assert.equal(removed.containerDimensions, undefined);
  const style = hostLayoutStyle(removed);
  assert.equal(style['--nooks-host-safe-bottom'], '0px');
  assert.equal(style['--nooks-host-container-height'], undefined);
  assert.equal(readHostLayout(mergeHostContext(original, { safeAreaInsets: null })).safeAreaInsets, undefined);
  assert.strictEqual(mergeHostContext(original, []), original);
});

test('legacy globals use verified safeArea.insets and partial events only', () => {
  assert.deepEqual(legacyLayoutUpdate({ safeArea: { insets }, displayMode: 'pip', maxHeight: 720, chatSheet: { right: 500 } }), { safeAreaInsets: insets, displayMode: 'pip', containerDimensions: { maxHeight: 720 } });
  const current = legacyLayoutUpdate({ safeArea: { insets }, displayMode: 'fullscreen' });
  assert.deepEqual(readHostLayout(mergeHostContext(current, legacyLayoutUpdate({ maxHeight: 400 }))).safeAreaInsets, insets);
  assert.equal(readHostLayout(mergeHostContext(current, legacyLayoutUpdate({ safeArea: null }))).safeAreaInsets, undefined);
  assert.deepEqual(legacyLayoutUpdate({ safeAreaInsets: insets, view: { mode: 'fullscreen' } }), {});
});

test('unknown display modes and invalid dimensions remain unknown, without inferred occlusion', () => {
  const layout = readHostLayout({ displayMode: 'expanded-chat', containerDimensions: { width: '100%', height: -1, maxWidth: 500 }, chatSheet: { width: 480 } });
  assert.equal(layout.displayMode, undefined);
  assert.deepEqual(layout.containerDimensions, { maxWidth: 500 });
  assert.equal(hostLayoutStyle(layout)['--nooks-host-safe-right'], '0px');
  assert.equal(hostLayoutStyle(layout)['--nooks-composer-reserve'], undefined);
  assert.deepEqual(readHostLayout(undefined), {});
});
