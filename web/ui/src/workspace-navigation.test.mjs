import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = source => import('data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64'));
const { readWorkspaceView, panelForWorkspaceView, workspaceSurfaceKey } = await load(fs.readFileSync(new URL('./workspace-navigation.ts', import.meta.url), 'utf8'));
const { acceptWorkspace } = await load(fs.readFileSync(new URL('./workspace-order.ts', import.meta.url), 'utf8'));
const app = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['update','presentAppTarget'].includes(node.name.getText(app))) expressions[node.name.getText(app)] = node.initializer.getText(app);
  if (ts.isFunctionDeclaration(node) && ['openUtility', 'changePage', 'clearChatObstructions', 'openChatArtifact', 'openChatView'].includes(node.name?.text)) expressions[node.name.text] = node.getText(app);
  if (ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect' && node.arguments[1]?.getText(app) === '[noteDirty,studyEditorOpen,pendingChatArtifact,pendingChatView,pendingStudioDraftId]') expressions.flush = node.arguments[0].getText(app);
  ts.forEachChild(node, visit);
}
visit(app);
// Exercise the App's real transitions and autosave effect, rather than a copy of their logic.
const factory = async (name, dependencies) => {
  assert.ok(expressions[name], `${name} exists in App`);
  const result = await load(`export const create=({${dependencies.join(',')}})=>(${expressions[name]});`);
  return result.create;
};
const panelSetters = ['setShowFocus', 'setShowSounds', 'setShowPeople', 'setShowCollection', 'setShowToday', 'setShowNooks', 'setShowPersonalize', 'setShowSettings'];
const otherSetters = ['setShowCreate', 'setShowNookCreator', 'setShowIdentity', 'setShowAccount', 'setShowAbout', 'setShowShare', 'setHandoff', 'setMobileNav', 'setZen'];
const createUtility = await factory('openUtility', [...panelSetters, 'progressionWorld', 'setDiscoveryWorldId']);
const createClear = await factory('clearChatObstructions', [...otherSetters,'interruptOpening=()=>{}','studioNavigationVersion={current:0}','setPendingStudioDraftId=()=>{}']);
const createChangePage = await factory('changePage', ['openUtility', 'setPage', 'setQuery', 'setMobileNav', 'setFilter', 'setSubject']);
const createOpenView = await factory('openChatView', ['clearChatObstructions', 'openUtility', 'panelForWorkspaceView', 'setActive', 'changePage']);
const createOpenArtifact = await factory('openChatArtifact', ['clearChatObstructions', 'openUtility', 'setActive', 'setPage', 'setReference', 'writeLocalWorkspaceState', 'isPublicPreview=false', 'account={workspaceKey:"device"}', 'getNativeRecoveryScope=()=>"account:alice"']);
const createUpdate = await factory('update', ['interruptOpening=()=>{}','isEmbedded=false', 'isPublicPreview=false', 'workspaceLoaded={current:true}', 'pendingInitialPresentation={current:undefined}', 'readNativeRecoveryScope=()=>undefined', 'progressOwner={current:"host"}', 'setError=()=>{}', 'studioNavigationVersion={current:0}', 'setPendingStudioDraftId=()=>{}', 'workspaceOrder', 'acceptWorkspace', 'normalize', 'setWorkspace', 'dirtyNote', 'studyEditing', 'setPendingChatArtifact', 'setPendingChatView', 'pendingChatReference', 'notify', 'readWorkspaceView', 'openChatArtifact', 'openChatView', 'previewArtifacts']);
const createFlush = await factory('flush', ['pendingStudioDraftId', 'setStudioDraftId=()=>{}', 'setPendingStudioDraftId=()=>{}', 'setShowNookCreator=()=>{}', 'noteDirty', 'dirtyNote', 'studyEditing', 'pendingChatArtifact', 'pendingChatView', 'pendingChatReference', 'setPendingChatArtifact', 'setPendingChatView', 'openChatArtifact', 'openChatView']);

function harness(progressionWorld) {
  const state = { page: 'home', active: { id: 'writing', kind: 'note', content: 'My draft' }, workspace: { revision: 9, artifacts: [] }, pendingChatArtifact: null, pendingChatView: null };
  const dirtyNote = { current: false }, studyEditing = { current: false };
  const pendingChatReference = { current: undefined };
  const workspaceOrder = { current: { revision: 9 } };
  const setters = {};
  for (const name of [...panelSetters, ...otherSetters, 'setDiscoveryWorldId', 'setPage', 'setQuery', 'setFilter', 'setSubject', 'setActive', 'setWorkspace', 'setPendingChatArtifact', 'setPendingChatView', 'setPendingStudioDraftId', 'setStudioDraftId', 'setReference']) {
    const key = name.slice(3,4).toLowerCase() + name.slice(4);
    setters[name] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  const openUtility = createUtility({ ...setters, progressionWorld });
  const clearChatObstructions = createClear(setters);
  const changePage = createChangePage({ ...setters, openUtility });
  const openChatView = createOpenView({ ...setters, clearChatObstructions, openUtility, panelForWorkspaceView, changePage });
  const openChatArtifact = createOpenArtifact({ ...setters, clearChatObstructions, openUtility, writeLocalWorkspaceState: (scope,key,value) => { state.lastOpened = value; }, localScope: 'account:alice' });
  const previewArtifacts = {current:new WeakSet()};
  const update = createUpdate({ ...setters, previewArtifacts, pendingChatReference, workspaceOrder, acceptWorkspace, normalize: value => value, dirtyNote, studyEditing, notify: value => { state.notice = value; }, readWorkspaceView, openChatArtifact, openChatView });
  const flush = () => createFlush({ ...setters, pendingChatReference, noteDirty: dirtyNote.current, dirtyNote, studyEditing, pendingChatArtifact: state.pendingChatArtifact, pendingChatView: state.pendingChatView, pendingStudioDraftId: state.pendingStudioDraftId, openChatArtifact, openChatView })();
  return { state, dirtyNote, studyEditing, workspaceOrder, previewArtifacts, update, flush, openUtility };
}
const destination = view => ({ workspace: { revision: 9, artifacts: [] }, navigation: { view } });

test('all native view requests open the existing destination without a second click', () => {
  const expected = { explore: 'showNooks', focus: 'showFocus', plan: 'showToday', collection: 'showCollection', music: 'showSounds', people: 'showPeople' };
  for (const view of ['study', 'library', ...Object.keys(expected)]) {
    const h = harness();
    h.state.showCreate = true;
    h.state.zen = true;
    h.update(destination(view));
    if (view === 'study') { assert.equal(h.state.page, 'home'); assert.equal(h.state.active, null); }
    else if (view === 'library') { assert.equal(h.state.page, 'library'); assert.equal(h.state.active.id, 'writing', 'library hides, rather than discards, an open saved note'); }
    else assert.equal(h.state[expected[view]], true, view);
    assert.equal(h.state.showCreate, false);
    assert.equal(h.state.zen, false);
  }
});

test('repeating a chat destination keeps it open and closes the previous panel', () => {
  const h = harness();
  h.update(destination('music')); h.update(destination('music'));
  assert.equal(h.state.showSounds, true);
  h.update(destination('focus'));
  assert.equal(h.state.showSounds, false); assert.equal(h.state.showFocus, true);
  h.openUtility('focus');
  assert.equal(h.state.showFocus, false, 'the existing direct UI button still toggles normally');
});

test('stale complete and abbreviated responses cannot navigate away from newer work', () => {
  const h = harness();
  for (const workspace of [{ revision: 8, artifacts: [] }, { revision: 8 }]) h.update({ workspace, navigation: { view: 'study' } });
  assert.equal(h.state.active.id, 'writing'); assert.equal(h.state.workspace.revision, 9);
  h.update(destination('library'));
  assert.equal(h.state.page, 'library');
});

test('chat navigation waits for autosave, then opens automatically; newest request wins', () => {
  const h = harness(); h.dirtyNote.current = true;
  h.update(destination('study')); h.update(destination('collection'));
  assert.equal(h.state.pendingChatView, 'collection'); assert.equal(h.state.active.content, 'My draft');
  h.flush();
  assert.notEqual(h.state.showCollection, true, 'failed or in-flight autosave keeps the editor open');
  h.dirtyNote.current = false; h.flush();
  assert.equal(h.state.showCollection, true); assert.equal(h.state.pendingChatView, null);
});

test('new flashcards wait for a dirty note, then open and dismiss covering panels', () => {
  const h = harness(); h.dirtyNote.current = true; h.state.showNooks = true;
  const artifact = { id: 'new-deck', kind: 'flashcards', title: 'Cell energy' };
  h.update({ artifact });
  assert.equal(h.state.active.id, 'writing'); assert.equal(h.state.pendingChatArtifact, artifact);
  h.dirtyNote.current = false; h.flush();
  assert.equal(h.state.active, artifact); assert.equal(h.state.lastOpened, 'new-deck'); assert.equal(h.state.showNooks, false);
});

test('a later navigation supersedes a queued artifact and internal updates never steal navigation', () => {
  const h = harness(); h.dirtyNote.current = true;
  h.update({ artifact: { id: 'new-deck', kind: 'flashcards' } });
  h.update(destination('library'));
  assert.equal(h.state.pendingChatArtifact, null); assert.equal(h.state.pendingChatView, 'library');
  h.update({ workspace: { revision: 10, artifacts: [] }, navigation: { view: 'study' } }, 'internal');
  assert.equal(h.state.workspace.revision, 10); assert.equal(h.state.pendingChatView, 'library');
  h.dirtyNote.current = false; h.flush();
  assert.equal(h.state.page, 'library'); assert.equal(h.state.active.id, 'writing');
});

test('only allowlisted product destinations are accepted', () => {
  const h = harness();
  for (const view of ['__proto__', 'constructor', 'https://other.site', 'settings', {}, null, undefined]) {
    assert.equal(readWorkspaceView(view), undefined);
    h.update({ navigation: { view } });
  }
  assert.equal(h.state.active.id, 'writing'); assert.equal(h.state.pendingChatView, null);
});


test('the native bridge labels UI-initiated tool responses separately from host navigation', async () => {
  const bridge = ts.createSourceFile('bridge.ts', fs.readFileSync(new URL('./bridge.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = {};
  for (const node of bridge.statements) if (ts.isFunctionDeclaration(node) && ['publish', 'callTool'].includes(node.name?.text)) functions[node.name.text] = node.getText(bridge).replace(/^export /, '');
  const { create } = await load(`export const create=(window,CustomEvent,rpc)=>{let initialData;const tutorialTools=null;const isPublicPreview=false,isEmbedded=true,initialized=true,connection=Promise.resolve(),flatten=value=>value;${functions.publish};${functions.callTool};return {publish,callTool};};`);
  const events = [];
  const data = { workspace: { revision: 10, artifacts: [] }, artifact: { id: 'autosaved-note', kind: 'note' } };
  const bridgeHarness = create({ dispatchEvent: event => events.push(event) }, class { constructor(name, options) { this.name=name; this.detail=options.detail; } }, async () => data);
  await bridgeHarness.callTool('artifact_save', {});
  assert.deepEqual(events[0].detail, { data, origin: 'internal' });
  bridgeHarness.publish(destination('collection'));
  assert.equal(events[1].detail.origin, 'host');
  assert.equal(events[1].detail.data.navigation.view, 'collection');
});


test('native unsaved preview flag cannot be mistaken for a saved set with the same id', () => {
 const h=harness();const artifact={id:'existing-deck',kind:'flashcards',cards:[{id:'a',front:'Question',back:'Answer'}]};
 h.update({workspace:{revision:9,artifacts:[{...artifact}]},artifact,unsaved:true});
 assert.equal(h.state.active,artifact);assert.equal(h.previewArtifacts.current.has(h.state.active),true);
 const saved={...artifact,revision:2};h.update({artifact:saved,unsaved:false});
 assert.equal(h.previewArtifacts.current.has(h.state.active),false);
});

test('surface identity changes for navigation, not autosave revisions or a hidden note', () => {
 const note={id:'source-note',kind:'note',revision:1,content:'First draft'};
 const identity=workspaceSurfaceKey('home',note);
 assert.equal(workspaceSurfaceKey('home',{...note,revision:2,content:'Saved draft'}),identity);
 assert.notEqual(workspaceSurfaceKey('home',{id:'quiz',kind:'quiz'}),identity);
 assert.equal(workspaceSurfaceKey('library',note),workspaceSurfaceKey('library',null));
 assert.notEqual(workspaceSurfaceKey('home',null),identity);
});

test('saved note-to-quiz presentation opens in the existing state with its requested reference', () => {
 const h=harness();const quiz={id:'quiz',kind:'quiz',questions:[{id:'q',prompt:'ATP?',answer:'Energy'}]};const note={id:'source',kind:'note',content:'ATP stores energy'};
 h.update({artifact:quiz,alongsideArtifact:note,unsaved:false});
 assert.equal(h.state.page,'home');assert.equal(h.state.active,quiz);assert.deepEqual(h.state.reference,{forArtifactId:'quiz',artifact:note});
 assert.equal(h.state.workspace.artifacts[0],quiz,'saved material loaded without a full workspace refresh is persisted, not mistaken for a local preview');
 h.update({artifact:{id:'cards',kind:'flashcards'},unsaved:false});assert.equal(h.state.reference,null,'a later single-surface request removes the old reference');
});

test('alongside presentation waits for autosave and preserves only the latest paired source', () => {
 const h=harness();h.dirtyNote.current=true;
 const first={id:'first',kind:'note',content:'First source'},latest={id:'latest',kind:'note',content:'Latest source'};
 h.update({artifact:{id:'quiz-a',kind:'quiz'},alongsideArtifact:first});
 h.update({artifact:{id:'quiz-b',kind:'quiz'},alongsideArtifact:latest});h.flush();
 assert.equal(h.state.active.id,'writing');assert.equal(h.state.reference,undefined);
 h.dirtyNote.current=false;h.flush();assert.equal(h.state.active.id,'quiz-b');assert.deepEqual(h.state.reference,{forArtifactId:'quiz-b',artifact:latest});
});


test('native navigation retains a study-set editor until saving or cancelling finishes', () => {
 const h=harness();h.studyEditing.current=true;
 h.update({artifact:{id:'next-deck',kind:'flashcards'}});h.flush();
 assert.equal(h.state.active.id,'writing');assert.equal(h.state.pendingChatArtifact.id,'next-deck');
 h.studyEditing.current=false;h.flush();assert.equal(h.state.active.id,'next-deck');
});

const createPresentDraft = await factory('presentAppTarget', ['interruptOpening=()=>{}','setOpeningHostPending=()=>{}','isPublicPreview=false','readNativeRecoveryScope=()=>undefined','workspaceReady=true','studioNavigationVersion','progressOwner','setPendingStudioDraftId','presentInWorkspace','setPendingChatArtifact','setPendingChatView','callTool','progressMounted','dirtyNote','studyEditing','setStudioDraftId','setShowNookCreator','showNookCreator=false']);
test('a late draft read never opens over a newer app destination',async()=>{
 let resolve;const reads=new Promise(yes=>resolve=yes),state={};const version={current:0};
 const present=createPresentDraft({studioNavigationVersion:version,progressOwner:{current:'owner'},progressMounted:{current:true},dirtyNote:{current:false},studyEditing:{current:false},callTool:()=>reads,presentInWorkspace:async()=>({status:'presented'}),setPendingStudioDraftId:()=>{},setPendingChatArtifact:()=>{},setPendingChatView:()=>{},setStudioDraftId:value=>state.draftId=value,setShowNookCreator:value=>state.open=value});
 const old=present({draftId:'draft-a'});await present({view:'study'});resolve({draft:{id:'draft-a'}});
 await assert.rejects(old,/no longer selected/);assert.deepEqual(state,{});
});
test('a nook draft waits for writing then opens in the same app',()=>{
 const h=harness();h.dirtyNote.current=true;h.state.pendingStudioDraftId='draft-a';h.flush();assert.equal(h.state.showNookCreator,undefined);
 h.dirtyNote.current=false;h.flush();assert.equal(h.state.studioDraftId,'draft-a');assert.equal(h.state.showNookCreator,true);assert.equal(h.state.pendingStudioDraftId,undefined);
});

for (const kind of ['note', 'flashcards', 'quiz', 'exam']) {
 test(`new ${kind} opens immediately in the current study surface`, () => {
  const h = harness(); h.state.showCreate = true; h.state.showNooks = true;
  const artifact = {id:`created-${kind}`,kind,title:'New study material',revision:1};
  h.update({artifact,unsaved:false});
  assert.equal(h.state.active,artifact); assert.equal(h.state.page,'home');
  assert.equal(h.state.showCreate,false); assert.equal(h.state.showNooks,false);
  assert.equal(h.state.lastOpened,artifact.id); assert.equal(h.state.pendingChatArtifact,null);
 });
}

test('Hogwarts collection opens its journey while Explore resets to all worlds', () => {
  const h = harness({id:'hogwarts'});
  h.update(destination('collection'));
  assert.equal(h.state.showNooks,true); assert.equal(h.state.showCollection,false); assert.equal(h.state.discoveryWorldId,'hogwarts');
  h.update(destination('explore'));
  assert.equal(h.state.showNooks,true); assert.equal(h.state.discoveryWorldId,undefined);
});
