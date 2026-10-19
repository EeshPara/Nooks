import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./NookStudio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('NookStudio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) { let result; function visit(node) { if (predicate(node)) result = node.getText(ast); ts.forEachChild(node, visit); } visit(ast); assert.ok(result); return result; }
const named = name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const button = find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' && node.children.some(child => ts.isJsxText(child) && child.text.trim() === 'Save draft'));
const code = ts.transpileModule(`
export function create(submit, options={}) {
  let locked=options.locked??false;
  const currentDraft={current:{id:'draft-a',title:options.title??'Quiet corner',revision:0}},currentBusy={current:options.busy??''},mounted={current:true};
  const state={busy:'',error:'',notice:'',submitted:[]};
  const setBusy=value=>state.busy=value,setError=value=>state.error=value,setNotice=value=>state.notice=value,errorMessage=reason=>reason.message;
  const save=async value=>{state.submitted.push(structuredClone(value));await submit(value);return value;};
  ${named('operate')}
  ${named('saveDraft')}
  return {saveDraft,state,currentBusy,currentDraft};
}
export function saveButton({busy,locked,draft,saveDraft}) {return ${button};}
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`);
const { create, saveButton } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('saving retains a focusable button while synchronous repeated activation sends only one write', async () => {
  const pending = deferred(), studio = create(() => pending.promise);
  const work = studio.saveDraft(); await studio.saveDraft();
  assert.equal(studio.state.submitted.length, 1); assert.equal(studio.currentBusy.current, 'save');
  const control = saveButton({ busy: 'save', locked: false, draft: studio.currentDraft.current, saveDraft: studio.saveDraft });
  assert.equal(control.props.disabled, false, 'the focused button must not be disabled while saving');
  assert.equal(control.props['aria-disabled'], true); assert.equal(control.props['aria-busy'], true);
  await control.props.onClick(); assert.equal(studio.state.submitted.length, 1);
  pending.resolve(); await work;
  assert.equal(studio.currentBusy.current, ''); assert.equal(studio.state.notice, 'Private draft saved.');
});

test('a failed save releases the activation guard so the same button can retry successfully', async () => {
  let attempt = 0; const studio = create(async () => { if (++attempt === 1) throw new Error('Connection lost'); });
  await studio.saveDraft(); assert.equal(studio.state.error, 'Connection lost'); assert.equal(studio.currentBusy.current, '');
  await studio.saveDraft(); assert.equal(attempt, 2); assert.equal(studio.state.error, ''); assert.equal(studio.state.notice, 'Private draft saved.');
});

test('locked, untitled and other-busy states still reject saves, while real validation remains disabled', async () => {
  for (const options of [{ locked: true }, { title: '  ' }, { busy: 'publish' }, { busy: 'load' }]) {
    const studio = create(() => assert.fail('must not save'), options); await studio.saveDraft(); assert.equal(studio.state.submitted.length, 0);
    const control = saveButton({ busy: options.busy ?? '', locked: options.locked ?? false, draft: studio.currentDraft.current, saveDraft: studio.saveDraft });
    assert.equal(control.props['aria-disabled'], true);
    assert.equal(control.props.disabled, Boolean(options.locked || options.title === '  '));
  }
});

test('save submits the latest draft reference rather than an older render snapshot', async () => {
  const studio = create(async () => {}); studio.currentDraft.current = { ...studio.currentDraft.current, title: 'Latest quiet corner' };
  await studio.saveDraft(); assert.equal(studio.state.submitted[0].title, 'Latest quiet corner');
});
