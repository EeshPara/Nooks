import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('./dismissal.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { isTopmostDismissTarget, consumeDismissEscape } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function surface({ hidden = false, visible = true, connected = true, children = [] } = {}) {
  return { isConnected: connected, children, visibility: visible ? 'visible' : 'hidden',
    closest: () => hidden ? {} : null,
    getClientRects: () => hidden ? [] : [{}],
    contains(node) { return this.children.includes(node); },
  };
}
function withSurfaces(native, modal, callback) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousStyle = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelectorAll: selector => selector === 'dialog[open]' ? native : modal } });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: value => ({ visibility: value.visibility }) });
  try { callback(); }
  finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousStyle) Object.defineProperty(globalThis, 'getComputedStyle', previousStyle); else delete globalThis.getComputedStyle;
  }
}
function key(value = 'Escape') {
  return { key: value, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
  };
}

test('a native dialog blocks page modals and the music controls beneath it', () => {
  const native = surface(), modal = surface(), music = surface();
  withSurfaces([native], [native, modal], () => {
    assert.equal(isTopmostDismissTarget(native), true);
    assert.equal(isTopmostDismissTarget(modal), false);
    assert.equal(isTopmostDismissTarget(music), false);
    const event = key();
    assert.equal(consumeDismissEscape(event, music), false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(consumeDismissEscape(event, native), true);
  });
});

test('the last visible modal handles Escape while hidden or inert surfaces are ignored', () => {
  const first = surface(), second = surface(), hidden = surface({ hidden: true }), invisible = surface({ visible: false });
  withSurfaces([], [first, second, hidden, invisible], () => {
    assert.equal(isTopmostDismissTarget(first), false);
    assert.equal(isTopmostDismissTarget(second), true);
    const event = key();
    assert.equal(consumeDismissEscape(event, first), false);
    assert.equal(consumeDismissEscape(event, second), true);
    assert.equal(event.stopped, true);
  });
});

test('nested controls may consume Escape without also closing their parent', () => {
  const child = surface(), modal = surface({ children: [child] });
  withSurfaces([], [modal], () => {
    const event = key();
    assert.equal(consumeDismissEscape(event, child), true);
    assert.equal(consumeDismissEscape(event, modal), false);
  });
});

test('unmounted surfaces and other keys cannot dismiss a popup', () => {
  withSurfaces([], [], () => {
    assert.equal(isTopmostDismissTarget(null), false);
    assert.equal(isTopmostDismissTarget(surface({ connected: false })), false);
    assert.equal(consumeDismissEscape(key('Tab'), surface()), false);
    assert.equal(consumeDismissEscape(key(), surface()), true);
  });
});
