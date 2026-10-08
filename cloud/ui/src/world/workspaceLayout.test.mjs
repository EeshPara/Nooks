import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function load(name) {
  const source = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const math = await load('./workspaceLayoutMath.ts');
const { createWorkspaceLayoutStore, changeLayout } = await load('./workspaceLayoutState.ts');
const empty = { version: 1, positions: {} }, move = (id, x, y) => ({ id, position: { x, y } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('positions use available widget travel, respecting host edges, composer and visual viewport offsets', () => {
  const viewport = { width: 1200, height: 900, left: 30, right: 40, top: 110, bottom: 160, offsetX: 7, offsetY: 9 };
  const size = { width: 300, height: 200 };
  assert.deepEqual(math.widgetPixels({ x: 0, y: 0 }, viewport, size), { x: 37, y: 119 });
  assert.deepEqual(math.widgetPixels({ x: 1, y: 1 }, viewport, size), { x: 867, y: 549 });
  assert.deepEqual(math.widgetPosition({ x: 452, y: 334 }, viewport, size), { x: .5, y: .5 });
  assert.deepEqual(math.widgetPosition({ x: -200, y: 5000 }, viewport, size), { x: 0, y: 1 });
});
test('saved corner stays visible when the viewport narrows or a widget expands', () => {
  const size = { width: 350, height: 400 }, viewport = { width: 800, height: 720, bottom: 144 };
  assert.deepEqual(math.widgetPixels({ x: 1, y: 1 }, viewport, size), { x: 434, y: 176 });
  assert.deepEqual(math.widgetPixels({ x: .7, y: .8 }, { width: 200, height: 200 }, size), { x: 16, y: 96 });
  assert.deepEqual(math.widgetPosition({ x: 300, y: 300 }, { width: 200, height: 200 }, size), { x: 0, y: 0 });
});
test('invalid geometry stays finite and pointer noise does not count as a move', () => {
  assert.deepEqual(math.widgetPixels({ x: NaN, y: Infinity }, { width: NaN, height: Infinity }, { width: NaN, height: NaN }), { x: 0, y: 0 });
  assert.equal(math.passedWidgetDragThreshold(2, 2), false);
  assert.equal(math.passedWidgetDragThreshold(3, 4), true);
  assert.deepEqual(math.movedWidget({ x: 20, y: 30 }, 'ArrowLeft'), { x: 12, y: 30 });
  assert.deepEqual(math.movedWidget({ x: 20, y: 30 }, 'ArrowDown', true), { x: 20, y: 54 });
});
test('failed saves retain the exact draft and wait for explicit retry', async () => {
  const store = createWorkspaceLayoutStore(); let fail = true; const calls = [];
  store.select('alice', empty, async change => { calls.push(change); if (fail) throw new Error('Offline'); });
  store.change('alice', move('timer', .4, .7)); await tick();
  assert.equal(calls.length, 1); assert.match(store.get('alice').error, /Offline.*still here/);
  assert.deepEqual(store.get('alice').value.positions.timer, { x: .4, y: .7 });
  store.change('alice', move('tasks', .1, .2)); await tick(); assert.equal(calls.length, 1);
  fail = false; await store.retry('alice');
  assert.equal(calls.length, 3); assert.equal(store.get('alice').queue.length, 0); assert.equal(store.get('alice').error, '');
});
test('synchronous transport exceptions also remain retryable', async () => {
  const store = createWorkspaceLayoutStore(); let fail = true;
  store.select('alice', empty, () => { if (fail) throw new Error('Not connected'); return Promise.resolve(); });
  store.change('alice', move('welcome', .2, .3)); await tick();
  assert.match(store.get('alice').error, /Not connected/); fail = false; await store.retry('alice');
  assert.equal(store.get('alice').queue.length, 0);
});
test('account switch pauses the original queue and cannot send it through the new account', async () => {
  const store = createWorkspaceLayoutStore(), first = deferred(), calls = [];
  store.select('alice', empty, change => { calls.push(['alice', change]); return first.promise; });
  store.change('alice', move('timer', .1, .2)); store.change('alice', move('tasks', .3, .4)); await tick();
  store.select('bob', empty, async change => calls.push(['bob', change]));
  first.resolve(); await tick();
  assert.equal(calls.length, 1); assert.equal(store.get('alice').queue.length, 1);
  assert.deepEqual(store.get('bob').value, empty);
  store.change('alice', move('collection', .9, .9)); assert.equal(store.get('alice').queue.length, 1);
  store.select('alice', empty, async change => calls.push(['alice', change])); await tick();
  assert.equal(calls.length, 1); await store.retry('alice'); assert.equal(calls.length, 2);
  assert.ok(calls.every(([owner]) => owner === 'alice'));
});
test('switching before the send microtask dispatches no stale request', async () => {
  const store = createWorkspaceLayoutStore(), calls = [];
  store.select('alice', empty, async change => calls.push(change)); store.change('alice', move('timer', .1, .1));
  store.select('bob', empty, async change => calls.push(change)); await tick();
  assert.equal(calls.length, 0); assert.equal(store.get('alice').queue.length, 1);
});
test('queued positions rebase on fresh server state without erasing other widgets', async () => {
  const store = createWorkspaceLayoutStore(), pending = deferred();
  store.select('alice', empty, () => pending.promise); store.change('alice', move('timer', .2, .3)); await tick();
  store.select('alice', changeLayout(empty, move('people', .8, .9)), () => pending.promise);
  assert.deepEqual(store.get('alice').value.positions, { people: { x: .8, y: .9 }, timer: { x: .2, y: .3 } });
  pending.resolve(); await tick(); assert.deepEqual(store.get('alice').value.positions.people, { x: .8, y: .9 });
});
test('reset one and reset all persist in order and no optimistic edit is marked saved early', async () => {
  const store = createWorkspaceLayoutStore(), pending = deferred(), calls = [];
  store.select('alice', changeLayout(empty, move('spotify', .4, .5)), async change => { calls.push(change); if (calls.length === 1) await pending.promise; });
  store.change('alice', { id: 'spotify', position: null }); store.change('alice', move('timer', .3, .2)); store.change('alice', { reset: true }); await tick();
  assert.deepEqual(store.get('alice').value, empty); assert.equal(store.get('alice').queue.length, 3); assert.equal(store.get('alice').saving, true);
  pending.resolve(); await tick(); assert.deepEqual(calls, [{ id: 'spotify', position: null }, move('timer', .3, .2), { reset: true }]);
  assert.equal(store.get('alice').queue.length, 0);
});

// Run the actual primitive's handlers/effects against a small DOM geometry and
// hook harness. The built-widget browser checks additionally verify iframe DOM
// identity and the real CSS layout; these tests isolate event/save boundaries.
const primitiveSource = fs.readFileSync(new URL('./WorkspaceLayout.tsx', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export type .*\n/gm, '').replace(/export function /g, 'function ');
const primitiveCode = ts.transpileModule(`export const create=({React,createContext,useContext,useRef,useLayoutEffect,useEffect,Grip,LayoutGrid,RotateCcw,Check,window,getComputedStyle,ResizeObserver,requestAnimationFrame,cancelAnimationFrame,widgetBounds,widgetPixels,widgetPosition,snapWidget,movedWidget,passedWidgetDragThreshold})=>{${primitiveSource};return {MovableWidget,LayoutControls};}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { create } = await import('data:text/javascript;base64,' + Buffer.from(primitiveCode).toString('base64'));
function primitive() {
  const h = { states: [], effects: [], pending: [], at: 0, frames: new Map(), changes: [], outerWidth: 244, contentHeight: 180, captures: [], releases: [], observers: [], events: new Map() };
  const style = () => ({ removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; delete this[key]; }, setProperty(key, value) { this[key] = value; } });
  h.outer = { querySelectorAll:()=>[], dataset: {}, style: style(), getBoundingClientRect: () => ({ width: parseFloat(h.outer.style.minWidth) || (h.intrinsic && h.outer.dataset.positioned ? 0 : h.outerWidth), height: 180, left:0, top:0 }) };
  h.surface = { dataset: {}, style: style(), closest: () => h.outer, getBoundingClientRect() { return { width: parseFloat(this.style.width) || h.outerWidth, height: Math.min(h.contentHeight, parseFloat(this.style.maxHeight) || Infinity), left: parseFloat(this.style.left) || 120, top: parseFloat(this.style.top) || 160 }; } };
  h.handle = { focus() {}, setPointerCapture: id => h.captures.push(id), releasePointerCapture: id => h.releases.push(id) };
  h.context = { scope: 'alice', value: empty, compact: false, editing: true, change: change => h.changes.push(change) };
  const effect = (fn, deps) => { const at = h.at++; if (!h.effects[at] || deps.some((dep, i) => dep !== h.effects[at].deps[i])) h.pending.push(() => { h.effects[at]?.cleanup?.(); h.effects[at] = { deps, cleanup: fn() }; }); };
  const api = create({ ...math, React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }) }, createContext: () => ({}), useContext: () => h.context, useRef: initial => h.states[h.at++] ??= { current: initial }, useLayoutEffect: effect, useEffect: effect, Grip: 'grip', RotateCcw: 'reset', LayoutGrid: 'grid', Check: 'check',
    window: { innerWidth: 1200, innerHeight: 900, addEventListener: (key, fn) => h.events.set(key, fn), removeEventListener: key => h.events.delete(key) },
    getComputedStyle: () => ({ getPropertyValue: key => ({ '--nooks-composer-reserve': '112px', '--nooks-host-safe-bottom': '8px' })[key] ?? '' }),
    ResizeObserver: class { constructor(fn) { h.observers.push(fn); } observe() {} disconnect() {} },
    requestAnimationFrame: fn => { const id = h.frames.size + 1; h.frames.set(id, fn); return id; }, cancelAnimationFrame: id => h.frames.delete(id),
  });
  h.iframe = { type: 'iframe', props: { src: 'https://example.invalid/player' } };
  h.walk = function* (node) { if (!node || typeof node !== 'object') return; yield node; for (const child of node.children ?? []) yield* h.walk(child); };
  h.render = () => { h.at = 0; h.tree = api.MovableWidget({ id: 'spotify', label: 'Music player', children: h.iframe }); for (const node of h.walk(h.tree)) if (node.props?.ref) node.props.ref.current = node.props.className?.includes('workspace-widget-slot') ? h.outer : node.props.className === 'workspace-widget-surface' ? h.surface : h.handle; h.pending.splice(0).forEach(fn => fn()); h.button = [...h.walk(h.tree)].find(node => node.props?.className === 'workspace-widget-handle'); };
  h.event = (overrides = {}) => ({ button: 0, pointerId: 1, clientX: 100, clientY: 100, currentTarget: h.handle, preventDefault() {}, stopPropagation() {}, ...overrides });
  h.frame = () => { const pending = [...h.frames.values()]; h.frames.clear(); pending.forEach(fn => fn()); };
  h.render(); return h;
}
test('handle capture, threshold, and release save exactly once while child input remains untouched', () => {
  const h = primitive(), handlers = h.button.props;
  assert.equal(h.tree.props.onPointerDown, undefined); assert.equal(h.tree.children[0].props.onPointerDown, undefined);
  handlers.onPointerDown(h.event()); handlers.onPointerMove(h.event({ clientX: 102 })); h.frame();
  assert.equal(h.surface.dataset.positioned, undefined); handlers.onPointerUp(h.event()); assert.equal(h.changes.length, 0);
  handlers.onPointerDown(h.event()); handlers.onPointerMove(h.event({ clientX: 300 })); h.frame();
  assert.equal(h.surface.dataset.positioned, 'true'); assert.equal(h.changes.length, 0);
  handlers.onPointerUp(h.event()); assert.equal(h.changes.length, 1); assert.deepEqual(h.captures, [1, 1]); assert.deepEqual(h.releases, [1, 1]);
  assert.equal(h.tree.children[0].children[0], h.iframe);
});
test('Escape restores the original flow and discards a pointer or keyboard gesture', () => {
  const h = primitive(), handlers = h.button.props;
  handlers.onPointerDown(h.event()); handlers.onPointerMove(h.event({ clientX: 400 })); h.frame();
  handlers.onKeyDown(h.event({ key: 'Escape' })); assert.equal(h.surface.dataset.positioned, undefined); assert.equal(h.changes.length, 0);
  handlers.onKeyDown(h.event({ key: 'ArrowRight' })); h.frame(); handlers.onKeyDown(h.event({ key: 'Escape' }));
  assert.equal(h.changes.length, 0); assert.equal(h.surface.style['--workspace-widget-max-height'], undefined);
});
test('keyboard movement commits on release, while account changes cancel an active gesture', () => {
  const h = primitive(); h.button.props.onKeyDown(h.event({ key: 'ArrowRight', shiftKey: true })); h.frame();
  h.button.props.onKeyUp(h.event({ key: 'ArrowRight' })); assert.equal(h.changes.length, 1);
  const expected = math.widgetPosition({ x: 144, y: 160 }, { width: 1200, height: 900, top: 96, bottom: 152, left: 16, right: 16 }, { width: 244, height: 180 });
  assert.deepEqual(h.changes[0].position, expected);
  h.button.props.onPointerDown(h.event()); h.button.props.onPointerMove(h.event({ clientX: 500 }));
  h.context = { ...h.context, scope: 'bob', value: empty }; h.render(); h.frame(); h.button.props.onPointerUp(h.event());
  assert.equal(h.changes.length, 1); assert.equal(h.surface.dataset.positioned, undefined);
});
test('expanding the existing music slot reclamps its width and height without changing the child', () => {
  const h = primitive(); h.context.value = changeLayout(empty, move('spotify', 1, 1)); h.render();
  assert.equal(h.surface.style.width, '244px'); const child = h.tree.children[0].children[0];
  h.outerWidth = 350; h.contentHeight = 420; h.observers.forEach(fn => fn());
  assert.equal(h.surface.style.width, '350px'); assert.equal(h.surface.style.left, '834px'); assert.equal(h.surface.style.top, '328px');
  assert.equal(h.tree.children[0].children[0], child);
  h.context.compact = true; h.context.editing = false; h.render();
  assert.equal(h.surface.dataset.positioned, undefined); assert.equal(h.surface.style['--workspace-widget-max-height'], undefined);
  assert.deepEqual(h.context.value.positions.spotify, { x: 1, y: 1 }); assert.equal(h.changes.length, 0);
});
test('layout ResizeObserver during a gesture does not cancel capture or save early', () => {
  const h = primitive(); h.button.props.onPointerDown(h.event()); h.button.props.onPointerMove(h.event({ clientX: 320 })); h.frame();
  h.outerWidth = 350; h.observers.forEach(fn => fn()); h.frame(); assert.equal(h.releases.length, 0); assert.equal(h.changes.length, 0);
  h.button.props.onPointerUp(h.event()); assert.equal(h.changes.length, 1);
});
test('an intrinsic flex widget retains its original slot width until reset', () => {
  const h = primitive(); h.intrinsic = true; h.context.value = changeLayout(empty, move('spotify', .5, .5)); h.render();
  assert.equal(h.outer.style.minWidth, '244px'); assert.equal(h.outer.getBoundingClientRect().width, 244);
  h.context.value = empty; h.render(); assert.equal(h.outer.style.minWidth, undefined);
});

test('grid finds the nearest free cell with space around cards and controls',()=>{
 const viewport={width:600,height:500,top:0,bottom:0,left:0,right:0},size={width:100,height:100};
 const obstacles=[{x:0,y:0,width:200,height:200}];
 const point=math.snapWidget({x:24,y:24},viewport,size,obstacles);
 assert.ok(point);assert.equal(point.x%24,0);assert.equal(point.y%24,0);
 assert.ok(point.x>=212||point.y>=212);
 assert.equal(math.snapWidget({x:0,y:0},viewport,size,[{x:0,y:0,width:600,height:500}]),null);
});
test('positioned cards use document flow rather than viewport-fixed positioning',()=>{
 const css=fs.readFileSync(new URL('./WorkspaceLayout.css',import.meta.url),'utf8');
 assert.match(css,/\.workspace-widget-surface\[data-positioned="true"\] \{ position: relative/);
 const h=primitive();h.context.value=changeLayout(empty,move('spotify',.5,.5));h.render();
 const top=h.surface.style.top;h.events.get('scroll')?.();assert.equal(h.surface.style.top,top);
});

 test('free placement does not reject a drop when the workspace is occupied', () => {
  const h = primitive();
  h.outer.querySelectorAll = () => [{ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 900 }) }];
  h.button.props.onPointerDown(h.event()); h.button.props.onPointerMove(h.event({ clientX: 360, clientY: 300 })); h.frame();
  h.button.props.onPointerUp(h.event());
  assert.equal(h.changes.length, 1);
  assert.ok(h.changes[0].position.x >= 0 && h.changes[0].position.x <= 1);
 });
