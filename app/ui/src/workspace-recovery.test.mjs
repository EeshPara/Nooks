import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const ast = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = {};
function visit(node) { if (ts.isFunctionDeclaration(node) && ['receiveLoadedWorkspace', 'retryUnsaved'].includes(node.name?.text)) declarations[node.name.text] = node.getText(ast); ts.forEachChild(node, visit); }
visit(ast);
const { readNativeRecoveryScope } = await load(fs.readFileSync(new URL('./study/studyRecoveryScope.ts', import.meta.url), 'utf8'));
const { createPendingStudyStore, isPendingProgress } = await load(fs.readFileSync(new URL('./study/pendingStudyStore.ts', import.meta.url), 'utf8'));
const { create } = await load(`export const create=({progressMounted,workspaceLoaded={current:false},pendingInitialPresentation={current:undefined},verifiedInitialPresentation=()=>undefined,isEmbedded,isPublicPreview=false,nooksAccount,communityAccountBinding,setCommunityRecoveryScope=()=>{},readNookProfile=()=>null,setProfile=()=>{},setProfileReady=()=>{},setNookDrafts=()=>{},readNookDrafts=()=>[],setActiveDraftId=()=>{},readLocalWorkspaceState=()=>null,readNativeRecoveryScope,progressOwner,setNativeRecoveryScope,setVerifiedRecoveryScope,setRecoverableDrafts,listRecoverableNotes,createPendingStudyStore,progressRecoveryRef,setProgressRecovery,pendingProgress,progressConflicts={current:new Map()},setProgressConflictCount=()=>{},isPendingProgress,setPendingProgressCount,update,setWorkspaceReady})=>{${declarations.receiveLoadedWorkspace};return receiveLoadedWorkspace;};`);
const scope = 'account:928c5afe-b1ae-4f3c-8fa0-b15fcc86c16c';
const otherScope = 'account:928c5afe-b1ae-4f3c-8fa0-b15fcc86c16d';
const event = { artifactId: 'quiz', sessionId: 'session', kind: 'quiz', score: 1, total: 2, xp: 15, answers: { q1: 1 } };
function harness(options = {}) {
  const memory = new Map(), state = { ready: false, updates: 0 }, owner = { current: 'host' }, mounted = { current: true }, pending = { current: new Map() }, recoveryRef = { current: null };
  const store = (scope, category) => createPendingStudyStore(scope, category, undefined, memory);
  const binding={current:null};
  const receive = create({ progressMounted: mounted, isEmbedded: true, communityAccountBinding:binding, setCommunityRecoveryScope:value=>{state.communityScope=value;}, ...options, readNativeRecoveryScope, progressOwner: owner,
    setNativeRecoveryScope: value => { state.scope = value; }, setVerifiedRecoveryScope: value => { state.verified = value; },
    setRecoverableDrafts: value => { state.notes = value; }, listRecoverableNotes: value => [{ scope: value }], createPendingStudyStore: store,
    progressRecoveryRef: recoveryRef, setProgressRecovery: value => { state.store = value; }, pendingProgress: pending, isPendingProgress,
    setPendingProgressCount: value => { state.pendingCount = value; }, update: raw => { state.updates++; return raw; }, setWorkspaceReady: value => { state.ready = value; } });
  return { state, owner, mounted, pending, recoveryRef, store, receive, binding };
}
test('a successful Retry after the first load failed installs native recovery before unlocking study content', () => {
  const h = harness(); h.store(scope, 'results').retain(event.sessionId, event);
  assert.equal(h.state.ready, false);
  h.receive({ workspace: { artifacts: [] }, recoveryScope: scope }, 'internal');
  assert.equal(h.state.ready, true); assert.equal(h.state.verified, scope); assert.equal(h.owner.current, scope);
  assert.deepEqual(h.state.notes, [{ scope }]); assert.deepEqual(h.pending.current.get(event.sessionId), event);
  assert.equal(h.recoveryRef.current, h.state.store, 'immediate retry writes use the verified store before React rerenders');
});
test('later workspace refreshes do not reset unsent results or rebind a different account', () => {
  const h = harness(); h.receive({ workspace: { artifacts: [] }, recoveryScope: scope });
  h.pending.current.set(event.sessionId, event); const originalStore = h.recoveryRef.current;
  h.receive({ workspace: { artifacts: [] }, recoveryScope: scope });
  assert.equal(h.pending.current.get(event.sessionId), event); assert.equal(h.recoveryRef.current, originalStore);
  const updates = h.state.updates;
  assert.throws(() => h.receive({ workspace: { artifacts: [] }, recoveryScope: otherScope }), /another account/);
  assert.equal(h.state.updates, updates); assert.equal(h.owner.current, scope); assert.equal(h.pending.current.get(event.sessionId), event);
});
test('partial and unmounted responses cannot unlock an unverified study surface', () => {
  const h = harness(); assert.throws(() => h.receive({ workspace: {}, recoveryScope: scope }), /loaded completely/);
  assert.equal(h.state.ready, false); assert.equal(h.owner.current, 'host');
  h.mounted.current = false; h.receive({ workspace: { artifacts: [] }, recoveryScope: scope });
  assert.equal(h.state.ready, false); assert.equal(h.state.updates, 0);
});
test('native account workspaces cannot become editable without their verified recovery scope', () => {
  const h = harness();
  for (const recoveryScope of [undefined, 'host', 'account:unverified']) {
    assert.throws(() => h.receive({ workspace: { backend: 'supabase', artifacts: [] }, recoveryScope }), /recovery context could not be verified/);
    assert.equal(h.state.ready, false); assert.equal(h.state.updates, 0);
  }
});
const { createRetry } = await load(`export const createRetry=({perform,workspaceReady,pendingProgress,flushProgress})=>{const isPublicPreview=false,completionRetry=false;${declarations.retryUnsaved};return retryUnsaved;};`);
test('the initial-load Retry prioritizes workspace verification over any unscoped pending results', async () => {
  const calls = [];
  const retry = createRetry({ workspaceReady: false, pendingProgress: { current: new Map([[event.sessionId, event]]) }, perform: async name => calls.push(name), flushProgress: async () => calls.push('progress_record') });
  await retry(); assert.deepEqual(calls, ['workspace_get']);
});
const navigationCode = ts.transpileModule(fs.readFileSync(new URL('./workspace-navigation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const navigationUrl = 'data:text/javascript;base64,' + Buffer.from(navigationCode).toString('base64');
const sessionSource = fs.readFileSync(new URL('./workspace-session.ts', import.meta.url), 'utf8')
  .replace(/^import .* from '(react|\.\/bridge|\.\/study\/readMaterial)';\n/gm, '')
  .replace("from './workspace-navigation'", `from '${navigationUrl}'`);
const { createWorkspaceSessionController } = await load(sessionSource);
test('chat view refresh after an initial load failure forwards private scope into the verified loader', async () => {
  const h = harness(); const sessionId = 'session';
  const controller = createWorkspaceSessionController({ initialSessionId: sessionId,
    call: async () => ({ sessionId, sequence: 0, expiresAt: '2027-01-01T00:00:00Z' }), read: async () => { throw new Error('No material was selected'); },
    refresh: async () => ({ workspace: { backend: 'supabase', artifacts: [] }, recoveryScope: scope }),
    onPresent: data => { h.receive(data); return 'presented'; }, setContext: () => {}, setTimer: () => 1, clearTimer: () => {} });
  try {
    assert.equal(h.state.ready, false); controller.start();
    await controller.present({ view: 'library' });
    assert.equal(h.state.ready, true); assert.equal(h.state.verified, scope); assert.equal(h.owner.current, scope);
  } finally { controller.stop(); }
});

test('a private top-level workspace requires and installs the same verified scope as the native iframe', () => {
 const h = harness({isEmbedded:false});
 assert.throws(() => h.receive({ workspace: { backend: 'supabase', artifacts: [] } }), /recovery context/);
 h.receive({ workspace: { backend: 'supabase', artifacts: [] }, recoveryScope: scope });
 assert.equal(h.state.verified,scope); assert.equal(h.state.ready,true);
});

test('public community binds server account UUID separately from the browser Auth UUID on fresh authenticated read only',()=>{
 const authOwner='account:11111111-1111-4111-8111-111111111111';
 const h=harness({isPublicPreview:true,nooksAccount:{getSnapshot:()=>({workspaceKey:authOwner,status:'signed-in'})}});h.owner.current=authOwner;
 const data={authenticated:true,workspace:{backend:'supabase',artifacts:[]},recoveryScope:scope};
 h.receive(data);assert.equal(h.state.communityScope,undefined,'host presentation cannot initialize community owner');
 h.receive(data,'internal',true);assert.equal(h.state.communityScope,scope);assert.equal(h.owner.current,authOwner,'local drafts keep the Auth account key');
 assert.equal(h.state.verified,undefined,'public account does not replace the native recovery singleton');
});

test('late or unauthenticated public workspace replies cannot bind a community owner',()=>{
 const authOwner='account:11111111-1111-4111-8111-111111111111';let currentOwner=otherScope;
 const h=harness({isPublicPreview:true,nooksAccount:{getSnapshot:()=>({workspaceKey:currentOwner,status:'signed-in'})}});h.owner.current=authOwner;
 const data={authenticated:true,workspace:{backend:'supabase',artifacts:[]},recoveryScope:scope};
 h.receive(data,'internal',true);assert.equal(h.state.communityScope,undefined);assert.equal(h.state.updates,0);
 currentOwner=authOwner;assert.throws(()=>h.receive({...data,authenticated:false},'internal',true),/could not be verified/);assert.equal(h.state.communityScope,undefined);
 assert.throws(()=>h.receive({...data,recoveryScope:undefined},'internal',true),/could not be verified/);assert.equal(h.state.updates,0);
 h.mounted.current=false;h.receive(data,'internal',true);assert.equal(h.state.communityScope,undefined);assert.equal(h.state.updates,0);
});

test('an internal account mismatch under the same public Auth owner blocks community until remount',()=>{
 const authOwner='account:11111111-1111-4111-8111-111111111111';
 const h=harness({isPublicPreview:true,nooksAccount:{getSnapshot:()=>({workspaceKey:authOwner,status:'signed-in'})}});h.owner.current=authOwner;
 const data={authenticated:true,workspace:{backend:'supabase',artifacts:[]},recoveryScope:scope};
 h.receive(data,'internal',true);assert.equal(h.state.communityScope,scope);const updates=h.state.updates;
 assert.throws(()=>h.receive({...data,recoveryScope:otherScope},'internal',true),/account changed/);assert.equal(h.state.communityScope,undefined);assert.equal(h.state.updates,updates);
 assert.throws(()=>h.receive(data,'internal',true),/account changed/);assert.equal(h.state.communityScope,undefined);
});
