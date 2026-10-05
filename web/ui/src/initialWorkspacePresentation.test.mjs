import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const recovery = fs.readFileSync(new URL('./study/studyRecoveryScope.ts', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('./initialWorkspacePresentation.ts', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
const { verifiedInitialPresentation, readNativeRecoveryScope } = await load(recovery + '\n' + presentation);
const ast = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let update, receive;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'update') update = node.initializer.getText(ast); if (ts.isFunctionDeclaration(node) && node.name?.text === 'receiveLoadedWorkspace') receive = node.getText(ast); ts.forEachChild(node, visit); }
visit(ast);
const { create } = await load(`export const create=(deps)=>{const {readNativeRecoveryScope,verifiedInitialPresentation,setWorkspace,setActive,workspaceOrder}=deps;
const isPublicPreview=false,progressMounted={current:true},workspaceLoaded={current:false},pendingInitialPresentation={current:undefined},progressOwner={current:'host'};
const studioNavigationVersion={current:0},setPendingStudioDraftId=()=>{};
const noop=()=>{},setError=noop,setNativeRecoveryScope=noop,setVerifiedRecoveryScope=noop,setRecoverableDrafts=noop,listRecoverableNotes=()=>[],readNookProfile=()=>null,setProfile=noop,setProfileReady=noop,setNookDrafts=noop,readNookDrafts=()=>[],setActiveDraftId=noop,readLocalWorkspaceState=()=>null,setProgressRecovery=noop,setPendingProgressCount=noop,setProgressConflictCount=noop;
const createPendingStudyStore=()=>({entries:()=>[]}),progressRecoveryRef={},pendingProgress={},progressConflicts={current:new Map()},isPendingProgress=()=>false;
const acceptWorkspace=(previous,next)=>!previous||next.revision>=previous.revision,normalize=(next)=>next,readWorkspaceView=value=>value,dirtyNote={current:false},studyEditing={current:false},setPendingChatArtifact=noop,setPendingChatView=noop,pendingChatReference={},notify=noop,previewArtifacts={current:new WeakSet()},openChatArtifact=setActive,openChatView=noop;
let ready=false;const setWorkspaceReady=value=>{ready=value};const update=${update};${receive};return {update,receive:receiveLoadedWorkspace,owner:progressOwner,pendingInitialPresentation,ready:()=>ready};};`);
const alice = 'account:928c5afe-b1ae-4f3c-8fa0-b15fcc86c16c', bob = 'account:928c5afe-b1ae-4f3c-8fa0-b15fcc86c16d';
const artifact = (id, title, revision = 1) => ({ id, title, revision, kind: 'note', content: title });
const snapshot = (scope, revision, artifacts) => ({ recoveryScope: scope, workspace: { backend: 'supabase', revision, artifacts } });
test('cached and pre-load host data cannot seed another account even at a higher revision', () => {
  for (const freshRevision of [1, 30]) {
    let workspace, active;
    const h = create({ readNativeRecoveryScope, verifiedInitialPresentation, workspaceOrder: { current: null }, setWorkspace: next => { workspace = next(workspace); }, setActive: next => { active = next; } });
    const stale = { ...snapshot(alice, 20, [artifact('alice-note', 'ALICE_PRIVATE_SENTINEL')]), artifact: artifact('alice-note', 'ALICE_PRIVATE_SENTINEL'), navigation: { view: 'library' } };
    h.update(stale); assert.equal(workspace, undefined); assert.equal(active, undefined); assert.equal(h.ready(), false);
    h.update(stale, 'internal'); assert.equal(workspace, undefined);
    h.receive(snapshot(bob, freshRevision, [artifact('bob-note', 'BOB_PRIVATE_SENTINEL')]));
    assert.equal(h.owner.current, bob); assert.equal(h.ready(), true); assert.equal(workspace.revision, freshRevision);
    assert.equal(active, undefined); assert.equal(JSON.stringify(workspace).includes('ALICE_PRIVATE_SENTINEL'), false);
    assert.equal(h.pendingInitialPresentation.current, undefined);
  }
});
test('matching initial navigation opens the freshly loaded saved artifact without replaying stale workspace contents', () => {
  let workspace, active;
  const h = create({ readNativeRecoveryScope, verifiedInitialPresentation, workspaceOrder: { current: null }, setWorkspace: next => { workspace = next(workspace); }, setActive: next => { active = next; } });
  h.update({ ...snapshot(alice, 20, [artifact('note', 'Old body')]), artifact: artifact('note', 'Old body'), alongsideArtifact: artifact('deleted', 'Deleted source'), unsaved: false });
  h.receive(snapshot(alice, 21, [artifact('note', 'Current body', 2)]));
  assert.equal(workspace.revision, 21); assert.equal(active.title, 'Current body'); assert.equal(active.revision, 2);
  assert.equal(verifiedInitialPresentation({ recoveryScope: alice, artifact: artifact('deleted', 'Deleted') }, snapshot(alice, 21, [])).artifact, undefined);
});
