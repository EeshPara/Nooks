import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./breakTimerState.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { initialBreakTimer, startBreak, pauseBreak, restoreBreakTimer, remainingBreakSeconds, selectBreakMode, expireBreak } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const now = 1_800_000_000_000;
test('running break restores the wall-clock deadline after navigation', () => {
  const state = startBreak(initialBreakTimer('short'), now);
  const restored = restoreBreakTimer(JSON.stringify(state), now + 47_000);
  assert.equal(restored.mode, 'short'); assert.equal(remainingBreakSeconds(restored, now + 47_000), 253);
});
test('paused break survives navigation without counting time away', () => {
  const state = pauseBreak(startBreak(initialBreakTimer('long'), now), now + 125_000);
  const restored = restoreBreakTimer(JSON.stringify(state), now + 900_000);
  assert.equal(restored.deadline, null); assert.equal(restored.remaining, 775);
  assert.equal(remainingBreakSeconds(startBreak(restored, now + 900_000), now + 930_000), 745);
});
test('elapsed break ends instead of restarting after remount', () => {
  const state = startBreak(initialBreakTimer('short'), now);
  const restored = restoreBreakTimer(JSON.stringify(state), now + 301_000);
  assert.equal(restored.remaining, 0); assert.equal(restored.deadline, null);
  assert.equal(remainingBreakSeconds(startBreak(restored, now + 301_000), now + 301_000), 300);
});
test('active mode cannot switch until break pauses or expires', () => {
  const state = startBreak(initialBreakTimer('short'), now);
  assert.equal(selectBreakMode(state, 'long', now + 10_000), state);
  assert.equal(selectBreakMode(expireBreak(state, now + 300_000), 'long', now + 300_000).remaining, 900);
  assert.equal(startBreak(initialBreakTimer('focus'), now).deadline, null);
});
test('corrupt or impossible persisted state safely resets', () => {
  for (const value of ['{', 'null', '{}', JSON.stringify({ version: 1, mode: 'short', remaining: -1, deadline: null }), JSON.stringify({ version: 1, mode: 'short', remaining: 300, deadline: now + 900_000 })]) {
    assert.deepEqual(restoreBreakTimer(value, now), initialBreakTimer());
  }
});
