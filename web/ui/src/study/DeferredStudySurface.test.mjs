import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { Writable } from 'node:stream';

const source = fs.readFileSync(new URL('./DeferredStudySurface.tsx', import.meta.url), 'utf8').replace(/^import '\.\/DeferredStudySurface.css';\n/m, '');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`);
const { DeferredStudySurface } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

function boundary(load, componentProps = {}, onBack = () => {}) {
  const instance = new DeferredStudySurface({ load, componentProps, label: 'Note', onBack, backLabel: 'Back to library' });
  // Exercise boundary actions without adding a second DOM renderer dependency.
  // Suspense and async lazy resolution below use React's real server renderer.
  instance.updater = { enqueueSetState(target, patch) { target.state = { ...target.state, ...(typeof patch === 'function' ? patch(target.state, target.props) : patch) }; } };
  return instance;
}
function render(element) {
  return new Promise((resolve, reject) => {
    let html = ''; const errors = [];
    const output = new Writable({ write(chunk, _encoding, done) { html += chunk.toString(); done(); } });
    output.on('finish', () => resolve({ html, errors })); output.on('error', reject);
    const stream = renderToPipeableStream(element, { onAllReady() { stream.pipe(output); }, onError(error) { errors.push(error); } });
  });
}
const View = props => createElement('article', null, `${props.owner}: ${props.text}`);

test('a rejected download has an in-place retry that performs a fresh load and succeeds', async () => {
  let calls = 0, backs = 0;
  const view = boundary(async () => { if (++calls === 1) throw new Error('PRIVATE_NETWORK_DETAIL'); return { default: View }; }, { owner: 'Alice', text: 'Saved note' }, () => backs++);
  const failed = await render(view.render()); assert.equal(calls, 1); assert.equal(failed.errors.length, 1);
  view.state = { ...view.state, ...DeferredStudySurface.getDerivedStateFromError(failed.errors[0]) };
  const fallback = view.render(); const markup = renderToStaticMarkup(fallback);
  assert.match(markup, /role="alert"/); assert.match(markup, /Try again/); assert.doesNotMatch(markup, /PRIVATE_NETWORK_DETAIL/);
  const [retry, back] = fallback.props.children[2].props.children;
  back.props.onClick(); assert.equal(backs, 1);
  const original = view.state.surface; retry.props.onClick(); assert.notEqual(view.state.surface, original);
  const success = await render(view.render()); assert.equal(calls, 2); assert.equal(success.errors.length, 0); assert.match(success.html, /Alice: Saved note/);
});

test('ordinary rerenders keep the resolved editor type and forward current note/account props', async () => {
  let calls = 0;
  const view = boundary(async () => { calls++; return { default: View }; }, { owner: 'Alice', text: 'Private draft' });
  const surface = view.state.surface;
  assert.match((await render(view.render())).html, /Alice: Private draft/);
  view.props = { ...view.props, componentProps: { owner: 'Bob', text: 'Different note' } };
  const next = await render(view.render());
  assert.equal(calls, 1); assert.equal(view.state.surface, surface); assert.match(next.html, /Bob: Different note/); assert.doesNotMatch(next.html, /Alice|Private draft/);
});

test('a pending view exposes an accessible back action without forcing the deferred import to finish', () => {
  let backs = 0;
  const view = boundary(() => new Promise(() => {}), {}, () => backs++);
  const fallback = view.render().props.fallback;
  const markup = renderToStaticMarkup(fallback);
  assert.match(markup, /aria-busy="true"/); assert.match(markup, /role="status"/); assert.match(markup, /Opening note/);
  fallback.props.children[1].props.onClick(); assert.equal(backs, 1);
});

test('an editor render error propagates to existing workspace draft recovery instead of being mislabeled a download failure', () => {
  const editorFailure = new Error('Editor runtime failed');
  assert.throws(() => DeferredStudySurface.getDerivedStateFromError(editorFailure), error => error === editorFailure);
});
