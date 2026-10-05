import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./WorkspaceErrorBoundary.tsx', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replace(/export default class/, 'class').replace(/export /g, '');
const code = ts.transpileModule(`export const create=({Component,React,createContext,useContext,useEffect,useRef,useState})=>{${source};return {useCrashDraft,WorkspaceErrorBoundary};};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { create } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function harness() {
  let current;
  class Component { constructor(props) { this.props = props; } setState(next) { this.state = { ...this.state, ...next(this.state) }; } }
  const api = create({ Component, React: { createElement: (type, props, ...children) => ({ type, props, children }) }, createContext: value => ({ value }), useContext: () => 'host',
    useState(initial) { const h = current, slot = h.at++; if (!Object.hasOwn(h.states, slot)) h.states[slot] = typeof initial === 'function' ? initial() : initial; return [h.states[slot], next => { h.states[slot] = typeof next === 'function' ? next(h.states[slot]) : next; }]; },
    useRef(initial) { const h = current, slot = h.at++; return h.states[slot] ??= { current: initial }; },
    useEffect(effect, deps) { const h = current, slot = h.at++; if (!h.effects[slot] || deps.some((item, i) => item !== h.effects[slot].deps[i])) h.pending.push(() => { h.effects[slot]?.cleanup?.(); h.effects[slot] = { deps, cleanup: effect() }; }); },
  });
  function mount(owner = 'account:alice') {
    const h = { states: [], effects: [], pending: [], at: 0, owner };
    h.render = (commit = true) => { h.at = 0; current = h; h.result = api.useCrashDraft('plan:title', '', h.owner); if (commit) h.pending.splice(0).forEach(effect => effect()); return h.result; };
    h.unmount = () => h.effects.forEach(effect => effect?.cleanup?.());
    h.render(); return h;
  }
  return { ...api, mount };
}
test('a caught render failure keeps the last input in its original account and ordinary closing does not resurrect it', () => {
  const h = harness(), first = h.mount();
  first.result[1]('Last keystroke before the failing render');
  h.WorkspaceErrorBoundary.getDerivedStateFromError(new Error('PRIVATE_EXCEPTION_SENTINEL'));
  first.unmount();
  const other = h.mount('account:bob'); assert.equal(other.result[0], ''); other.unmount();
  const reopened = h.mount(); assert.equal(reopened.result[0], 'Last keystroke before the failing render');
  reopened.unmount(); assert.equal(h.mount().result[0], '');
});
test('switching a mounted form owner resets before exposing old text and ignores its old event handler', () => {
  const h = harness(), form = h.mount(); const stale = form.result[1];
  stale('Alice draft'); form.render(); form.owner = 'account:bob';
  assert.equal(form.render()[0], ''); stale('Late Alice update'); assert.equal(form.render()[0], '');
});
test('an aborted owner transition cannot replace Alice recovery with Bob or empty form fields', () => {
  for (const existingBobDraft of [false, true]) {
    const h = harness();
    if (existingBobDraft) {
      const bob = h.mount('account:bob'); bob.result[1]('BOB_PRIVATE_DRAFT');
      h.WorkspaceErrorBoundary.getDerivedStateFromError(); bob.unmount();
    }
    const alice = h.mount(); alice.result[1]('ALICE_PRIVATE_DRAFT'); alice.render();
    alice.owner = 'account:bob'; alice.render(false);
    h.WorkspaceErrorBoundary.getDerivedStateFromError(); alice.unmount();
    assert.equal(h.mount().result[0], 'ALICE_PRIVATE_DRAFT');
    assert.equal(h.mount('account:bob').result[0], existingBobDraft ? 'BOB_PRIVATE_DRAFT' : '');
  }
});
test('reopen resets only the failed render and never renders the exception text', () => {
  const h = harness(); let retried = 0;
  const boundary = new h.WorkspaceErrorBoundary({ children: 'workspace', onReopen: () => retried++ });
  boundary.state = { ...boundary.state, ...h.WorkspaceErrorBoundary.getDerivedStateFromError(new Error('PRIVATE_EXCEPTION_SENTINEL')) };
  const fallback = boundary.render(); assert.equal(fallback.props.role, 'alert'); assert.doesNotMatch(JSON.stringify(fallback), /PRIVATE_EXCEPTION/);
  const button = fallback.children.find(child => child?.type === 'button'); assert.equal(button.children[0], 'Reopen nook');
  button.props.onClick(); assert.equal(retried, 1); assert.equal(boundary.state.failed, false); assert.equal(boundary.state.attempt, 1);
  assert.equal(boundary.render().children[0], 'workspace');
});
