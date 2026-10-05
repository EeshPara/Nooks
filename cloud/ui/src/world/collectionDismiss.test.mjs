import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
function extract(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (predicate(node)) found = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found, `Source missing in ${file}`); return found;
}
const named = (file, name) => extract(file, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const moduleBody = file => read(file).replace(/^import .*;\n/gm, '').replace(/export /g, '');
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64'));
const discoveryKey = named('../community/NookDiscovery.tsx', 'handleKey');
const rewardKey = extract('./RewardCelebration.tsx', node => ts.isVariableDeclaration(node) && node.name.getText() === 'key' && ts.isArrowFunction(node.initializer));
const helpers = moduleBody('./dismissal.ts');
const { keys } = await load(`export function keys({ document, getComputedStyle, dialog, selectedRef, setSelected, closeRef }) {
  ${helpers}
  ${discoveryKey}
  const ${rewardKey};
  return { discovery: handleKey, reward: key };
}`);

function surface() {
  return { isConnected: true, closest: () => null, getClientRects: () => [{}], contains: () => false,
    querySelectorAll: () => [], focus() { this.focuses++; }, focuses: 0 };
}
const event = (key = 'Escape') => ({ key, defaultPrevented: false, stopped: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } });
function keyHarness({ native = false, selected = null } = {}) {
  const modal = surface(), studio = surface(), state = { closes: 0, selected };
  const document = { activeElement: studio, querySelectorAll: selector => selector === 'dialog[open]' ? (native ? [studio] : []) : [modal] };
  const handlers = keys({ document, getComputedStyle: () => ({ visibility: 'visible' }), dialog: { current: modal },
    selectedRef: { current: selected }, setSelected: value => { state.selected = value; }, closeRef: { current: () => state.closes++ } });
  return { handlers, state, modal };
}

for (const name of ['discovery', 'reward']) {
  test(`${name} leaves Escape and Tab to a native studio above it`, () => {
    const h = keyHarness({ native: true });
    for (const key of ['Escape', 'Tab']) {
      const e = event(key); h.handlers[name](e);
      assert.equal(e.defaultPrevented, false); assert.equal(e.stopped, false);
    }
    assert.equal(h.state.closes, 0); assert.equal(h.modal.focuses, 0);
  });
  test(`${name} handles Escape only when it is topmost and the key is unconsumed`, () => {
    const h = keyHarness(), e = event(); h.handlers[name](e);
    assert.equal(h.state.closes, 1); assert.equal(e.defaultPrevented, true); assert.equal(e.stopped, true);
    h.handlers[name](e); assert.equal(h.state.closes, 1, 'another handler cannot consume the same dismissal');
    const tab = event('Tab'); h.handlers[name](tab); assert.equal(tab.defaultPrevented, true); assert.equal(h.modal.focuses, 1);
  });
}
test('Escape from an Explore detail returns to the directory without closing Explore', () => {
  const h = keyHarness({ selected: { id: 'garden' } }); h.handlers.discovery(event());
  assert.equal(h.state.selected, null); assert.equal(h.state.closes, 0);
});

// Render the real component functions and shared dismissal hooks with a small hook
// runtime. This checks their actual X/backdrop/Escape wiring during a slow write.
const { componentFactory } = await load(`export function componentFactory(deps) {
  const { useState, useRef, useEffect, useCallback, useId, React, useModalFocus, window, document,
    requestAnimationFrame, getComputedStyle, roomJourneyState, unlockedRewards } = deps;
  ${helpers}
  ${moduleBody('./useSoftDismiss.ts')}
  ${moduleBody('./useBackdropDismiss.ts')}
  const X = () => null, ChevronRight = X, RewardDrawing = X, RoomRewardShelf = X, SealedReward = X;
  const safeSeconds = value => Math.max(0, value);
  ${named('./RoomJourney.tsx', 'RoomJourneyModal').replace(/^export /, '')}
  ${named('./RewardCelebration.tsx', 'RewardCelebration').replace(/^export /, '')}
  return { RoomJourneyModal, RewardCelebration };
}`);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function collectionHarness(componentName) {
  const slots = [], effects = [], pendingEffects = [], surfaceElement = surface(), listeners = new Map();
  const state = { closes: 0, placements: 0 }, write = deferred(); let slot = 0, tree, closeByFocus;
  const reward = { id: 'first', name: 'First keepsake', minutes: 15, description: 'A keepsake', art: 'letter' };
  const document = { body: { style: { overflow: '' } }, activeElement: surfaceElement,
    querySelectorAll: selector => selector === 'dialog[open]' ? [] : [surfaceElement],
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const hooks = {
    useState(initial) { const at = slot++; if (!Object.hasOwn(slots, at)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useRef(initial) { const at = slot++; return slots[at] ??= { current: initial }; },
    useEffect(run, deps) { const at = slot++; if (!effects[at] || deps.some((value, i) => value !== effects[at].deps[i])) pendingEffects.push(() => { effects[at]?.cleanup?.(); effects[at] = { deps, cleanup: run() }; }); },
    useCallback(fn, deps) { const at = slot++; if (!slots[at] || deps.some((value, i) => value !== slots[at].deps[i])) slots[at] = { fn, deps }; return slots[at].fn; },
    useId: () => 'collection-heading',
  };
  const components = componentFactory({ ...hooks, document, getComputedStyle: () => ({ visibility: 'visible' }),
    window: { requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {}, matchMedia: () => ({ matches: true }) },
    requestAnimationFrame: fn => fn(), useModalFocus: (_ref, close) => { closeByFocus = close; },
    roomJourneyState: () => ({ room: { label: 'Garden', rewards: [reward] }, unlocked: [reward], next: undefined, remainingMinutes: 0 }),
    unlockedRewards: () => [reward],
    React: { createElement(type, props, ...children) { if (props?.ref && props['aria-modal']) props.ref.current = surfaceElement; return { type, props: props ?? {}, children: children.flat(Infinity) }; } },
  });
  const props = { roomId: 'garden', roomLabel: 'Garden', rewards: [reward],
    progress: { focusSeconds: 900, sessions: 1, practices: 0, placed: [] },
    onClose: () => state.closes++, onPlace: () => { state.placements++; return write.promise; } };
  function render() { slot = 0; tree = components[componentName](props); pendingEffects.splice(0).forEach(run => run()); }
  function find(predicate, node = tree) { if (!node || typeof node !== 'object') return; if (predicate(node)) return node; for (const child of node.children ?? []) { const match = find(predicate, child); if (match) return match; } }
  const h = { state, write, render,
    place() { const button = find(node => node.props['aria-label'] === 'Place First keepsake' || node.props.className === 'reward-celebration-place-item'); assert.ok(button); const work = button.props.onClick({ currentTarget: surfaceElement }); render(); return work; },
    close(kind) {
      if (kind === 'x') { const button = find(node => /^Close (nook collection|new keepsakes)$/.test(node.props['aria-label'])); assert.ok(button); assert.notEqual(button.props.disabled, true, 'X must remain available during a write'); button.props.onClick(); }
      else if (kind === 'outside') tree.props.onClickCapture({ button: 0, target: surfaceElement, currentTarget: surfaceElement });
      else if (componentName === 'RoomJourneyModal') closeByFocus();
      else listeners.get('keydown')(event());
    },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); surfaceElement.isConnected = false; },
  };
  render(); return h;
}

for (const component of ['RoomJourneyModal', 'RewardCelebration']) {
  for (const close of ['x', 'outside', 'escape']) test(`${component} remembers ${close} during placement and closes once after the write`, async () => {
    const h = collectionHarness(component), work = h.place();
    h.close(close); h.close(close); assert.equal(h.state.closes, 0); assert.equal(h.state.placements, 1);
    h.write.resolve(); await work; h.render(); assert.equal(h.state.closes, 1);
    h.render(); assert.equal(h.state.closes, 1); h.unmount();
  });
  test(`${component} can close after a failed display write without fabricating another placement`, async () => {
    const h = collectionHarness(component), work = h.place(); h.close('outside');
    h.write.reject(new Error('Offline')); await work; h.render();
    assert.equal(h.state.closes, 1); assert.equal(h.state.placements, 1); h.unmount();
  });
  test(`${component} never closes a replacement popup when its old placement settles after unmount`, async () => {
    const h = collectionHarness(component), work = h.place(); h.close('x'); h.unmount();
    h.write.resolve(); await work; assert.equal(h.state.closes, 0);
  });
}
