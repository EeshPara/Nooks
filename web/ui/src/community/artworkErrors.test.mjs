import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function declarations(relative, names) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.set(node.name.text, node.getText(ast).replace(/^export /, ''));
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (names.includes(declaration.name.getText(ast))) found.set(declaration.name.getText(ast), node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast); for (const name of names) assert.ok(found.has(name), `${relative}: ${name}`);
  return names.map(name => found.get(name)).join('\n');
}
async function compile(source) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const handlers = declarations('./NookStudio.tsx', ['payload', 'snapshot', 'save', 'operate']);
const helpers = declarations('../organization/types.ts', ['resultData', 'errorMessage']);
const { createStudio } = await compile(`export function createStudio(draft,onTool){
 const state={draft,adopted:[],busy:'',error:'',conflict:null,readiness:null};const dirty=true,mounted={current:true},currentBusy={current:''},owner='account:alice',currentOwner=()=>true,cancelingArtwork={current:null},currentSnapshot={current:''};
 const adopt=value=>{state.adopted.push(value);state.draft=value;};const setBusy=value=>state.busy=value;const setError=value=>state.error=value;const setNotice=()=>{};const setConflict=value=>state.conflict=value;const setReadiness=value=>state.readiness=value;
 ${helpers}
 ${handlers}
 return {state,save:()=>operate('save',async()=>{await save();})};
}`);
const { createPersonalize } = await compile(`export function createPersonalize(draft,onSave){
 const state={draft,saving:false,error:'',closed:false};const saving=false,uploading=false;
 const owner='account:alice',origin={current:{owner,key:'current-appearance'}},lifetime={current:owner},mounted={current:true},saveInFlight={current:false},failedSave={current:false},closeRequested={current:false},failedAppearanceDrafts=new Map();
 const dismiss=()=>{if(saveInFlight.current){closeRequested.current=true;return;}closeRequested.current=false;state.closed=true;},dismissLatest={current:dismiss};
 const setSaving=value=>state.saving=value;const setError=value=>state.error=value;
 ${declarations('../personalization/PersonalizePanel.tsx', ['save'])}
 return {state,save};
}`);
const image = 'data:image/png;base64,iVBORw0KGgo=';
const messages = { ARTWORK_LIMIT: 'Artwork uploads are limited to 100 new images per day and 128 pending or retained image uploads. Try again later; removed images remain retained until retention cleanup.', ARTWORK_CONFLICT: 'Your saved artwork changed or is no longer available. Refresh and retry; your existing study work is unchanged.' };
const makeDraft = () => ({ id: '10000000-0000-4000-8000-000000000001', title: 'My unsaved room', description: 'Keep my unsaved description', revision: 2, space: { room: 'rainy-library', theme: 'botanical', backgroundImage: image }, style: 'watercolor', artworkMode: 'upload', scenePrompt: 'Keep my unsaved prompt', visibility: 'private', pathTemplate: 'none' });

test('studio quota/conflict failures keep every unsaved field and require an explicit second save', async () => {
  for (const [code, message] of Object.entries(messages)) {
    const draft = makeDraft(), original = structuredClone(draft), calls = []; let rejected = true;
    const studio = createStudio(draft, async (name, args) => {
      calls.push({ name, args });
      if (name === 'nook_draft_save') { if (rejected) throw Object.assign(new Error(message), { code }); return { draft: { ...draft, revision: 3 }, readiness: { readyToPublish: false, blockers: [] } }; }
      if (name === 'nook_draft_get') return { draft: { ...draft, title: 'Previously saved title' } };
      assert.fail('Unexpected tool');
    });
    await studio.save(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(studio.state.draft, original); assert.deepEqual(studio.state.adopted, []);
    assert.equal(studio.state.error, message); assert.equal(studio.state.busy, ''); assert.equal(studio.state.conflict, null);
    assert.deepEqual(calls.map(call => call.name), ['nook_draft_save', 'nook_draft_get'], 'one reconciliation read, no automatic second write');
    assert.equal(calls[0].args.draft.space.backgroundImage, image);
    rejected = false; await studio.save();
    assert.equal(calls.length, 3); assert.equal(calls[2].name, 'nook_draft_save'); assert.deepEqual(calls[2].args, calls[0].args);
    assert.equal(studio.state.draft.revision, 3); assert.equal(studio.state.error, '');
  }
});

test('studio preserves draft and original guidance when reconciliation fails or finds another revision', async () => {
  for (const readFails of [false, true]) {
    const draft = makeDraft(), original = structuredClone(draft);
    const studio = createStudio(draft, async name => {
      if (name === 'nook_draft_save') throw Object.assign(new Error(messages.ARTWORK_CONFLICT), { code: 'ARTWORK_CONFLICT' });
      if (readFails) throw new Error('Synthetic network outage');
      return { draft: { ...draft, title: 'Another saved title', revision: 3 } };
    });
    await studio.save(); assert.deepEqual(studio.state.draft, original); assert.equal(studio.state.error, messages.ARTWORK_CONFLICT);
    assert.equal(studio.state.conflict?.revision ?? null, readFails ? null : 3); assert.deepEqual(studio.state.adopted, []);
  }
});

test('personalization retains image/name/description and actionable artwork guidance until manual retry succeeds', async () => {
  for (const [code, message] of Object.entries(messages)) {
    const draft = { name: 'My unsaved nook', tagline: 'Keep this description', theme: 'botanical', backgroundImage: image }, original = structuredClone(draft); let calls = 0, reject = true;
    const panel = createPersonalize(draft, async submitted => { calls++; assert.deepEqual(submitted, draft); if (reject) throw Object.assign(new Error(message), { code }); });
    await panel.save(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(panel.state.draft, original); assert.equal(panel.state.closed, false); assert.equal(panel.state.saving, false); assert.equal(calls, 1);
    assert.equal(panel.state.error, `${message} Your design is still here.`);
    reject = false; await panel.save(); assert.equal(calls, 2); assert.equal(panel.state.closed, true); assert.equal(panel.state.error, '');
  }
});
