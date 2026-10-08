import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./bridge.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('bridge.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'callTool').getText(ast).replace(/^export /, '');
const code = ts.transpileModule(`export const create=(nooksAccount,publicPreview=true,fetch)=>{const tutorialTools=null;const isPublicPreview=publicPreview,isEmbedded=false,flatten=value=>value;${declaration};return callTool;};`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { create } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function harness(response) {
  const state = { key: 'account:alice' };
  const call = create({ getSnapshot: () => ({ status: 'signed-in', workspaceKey: state.key }),
    transport: async () => ({ mode: 'account', workspaceKey: state.key }), authenticatedFetch: async () => response });
  return { state, call };
}
test('public plan conflicts retain their structured revision metadata for safe refresh and retry', async () => {
  const h = harness({ ok: false, json: async () => ({ error: { code: 'REVISION_CONFLICT', message: 'Your study plan changed. Read plan_get again.', currentRevision: 42, retryAfter: 3 } }) });
  await assert.rejects(h.call('plan_save', { expectedRevision: 41, plan: { tasks: [] } }), error => error.code === 'REVISION_CONFLICT' && error.currentRevision === 42 && error.retryAfter === 3);
});
test('public and private top-level artwork errors preserve actionable code and guidance', async () => {
  for (const publicPreview of [true, false]) for (const code of ['ARTWORK_LIMIT', 'ARTWORK_CONFLICT']) {
    const message = code === 'ARTWORK_LIMIT' ? 'Artwork uploads are limited to 100 new images per day.' : 'Your saved artwork changed. Refresh and retry.';
    const response = { ok: false, json: async () => ({ error: { code, message } }) };
    const call = publicPreview ? harness(response).call : create(null, false, async () => response);
    await assert.rejects(call('nook_draft_save', { expectedRevision: 1, draft: { title: 'Keep my work' } }), error => error.code === code && error.message === message);
  }
});
test('switching accounts while parsing a response prevents old-account content from reaching the new workspace', async () => {
  let deliver; const parsed = new Promise(resolve => { deliver = resolve; });
  const h = harness({ ok: true, json: () => parsed });
  const result = h.call('workspace_get'); await new Promise(resolve => setImmediate(resolve));
  h.state.key = 'account:bob'; deliver({ workspace: { artifacts: [{ content: 'Alice private note' }] } });
  await assert.rejects(result, /account changed/);
});
test('switching accounts while transport loads cannot turn an old action into a new-account write', async () => {
  let finish, calls = 0, key = 'account:alice';
  const call = create({ getSnapshot: () => ({ status: 'signed-in', workspaceKey: key }), transport: () => new Promise(resolve => { finish = resolve; }),
    authenticatedFetch: async () => { calls++; return { ok: true, json: async () => ({}) }; } });
  const result = call('artifact_save', { artifact: { id: 'alice-note' } }); key = 'account:bob'; finish({ mode: 'account', workspaceKey: key });
  await assert.rejects(result, /account changed/); assert.equal(calls, 0);
});
