import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const ast = ts.createSourceFile('NoteWorkspace.tsx', fs.readFileSync(new URL('./NoteWorkspace.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let leaveSource;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'leave') leaveSource = node.getText(ast); ts.forEachChild(node, visit); }
visit(ast); assert.ok(leaveSource);
const source = `export const createLeave = ({ autosave, draft, persisted, window, onBack, setLeaving }) => { const leaving = false; ${leaveSource}; return leave; };`;
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createLeave } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function setup(flush, confirm = () => false) {
  const events = [];
  const leave = createLeave({ autosave: { flush }, draft: { content: 'Student writing' }, persisted: true, window: { confirm }, onBack: () => events.push('library'), setLeaving: value => events.push(value ? 'saving' : 'ready') });
  return { leave, events, close: () => events.push('nook') };
}

test('the note close action waits for autosave and then returns to its own destination', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const h = setup(() => pending);
  const leaving = h.leave(h.close);
  assert.deepEqual(h.events, ['saving']);
  finish(true); await leaving;
  assert.deepEqual(h.events, ['saving', 'ready', 'nook']);
});

test('Library remains a separate destination and closes after saving', async () => {
  const h = setup(async () => true); await h.leave();
  assert.deepEqual(h.events, ['saving', 'ready', 'library']);
});

test('failed saves keep the note open unless the student explicitly discards the writing', async () => {
  let discard = false, confirmations = 0;
  const h = setup(async () => false, () => { confirmations++; return discard; });
  await h.leave(h.close); assert.deepEqual(h.events, ['saving', 'ready']);
  discard = true; await h.leave(h.close);
  assert.deepEqual(h.events, ['saving', 'ready', 'saving', 'ready', 'nook']);
  assert.equal(confirmations, 2);
});
