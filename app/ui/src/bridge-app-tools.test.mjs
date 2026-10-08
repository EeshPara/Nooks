import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual bridge and app-tool dispatcher in a fresh browser-like realm.
// Only the Vite build flag and browser transport are substituted.
const paths = ['./workspace-navigation', './app-tools', './world/hostLayout', './tool-result', './bridge'];
const compiled = Object.fromEntries(paths.map(path => [path, ts.transpileModule(
  fs.readFileSync(new URL(`${path}.ts`, import.meta.url), 'utf8').replace('import.meta.env.VITE_NOOKS_PUBLIC_PREVIEW', "'0'"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText]));
const copy = value => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };

function harness(openai, practice = false) {
  const listeners = new Map(), timers = new Map(), sent = [], events = [], modules = new Map();
  let timerId = 0;
  const parent = { postMessage(message, origin) { sent.push({ message: copy(message), origin }); } };
  const window = {
    openai,
    parent,
    addEventListener(type, listener) { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    dispatchEvent(event) { events.push(event); for (const listener of listeners.get(event.type) ?? []) listener(event); },
  };
  class FakeEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const context = vm.createContext({ window, Event: FakeEvent, CustomEvent: FakeEvent, console, structuredClone,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch() { throw new Error('Native bridge must not fall through to browser HTTP'); },
  });
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    if (path === './account/client') return { nooksAccount: {} };
    if (path === './onboarding/tutorialSession') return { isTutorialPractice: practice, tutorialSeed: practice ? { workspace: {revision:0} } : null };
    if (path === './preview/tutorial-tools.mjs') return { createTutorialTools: () => async () => ({ practice: true }) };
    assert.ok(compiled[path], `Unexpected import: ${path}`);
    const exports = {}; modules.set(path, exports);
    vm.runInContext(`(function(require,exports){${compiled[path]}\n})`, context)(load, exports);
    return exports;
  }
  const bridge = load('./bridge'), tools = load('./app-tools');
  function receive(message, { source = parent, origin = 'https://chatgpt.com' } = {}) {
    for (const listener of listeners.get('message') ?? []) listener({ data: message, source, origin });
  }
  function reply(request, result = {}) { receive({ jsonrpc: '2.0', id: request.id, result }); }
  const outgoing = method => sent.filter(item => item.message.method === method).map(item => item.message);
  const responses = id => sent.filter(item => item.message.id === id && !item.message.method).map(item => item.message);
  const request = (id, method, params) => receive({ jsonrpc: '2.0', id, method, params });
  async function initialize() {
    reply(outgoing('ui/initialize')[0], { hostCapabilities: { updateModelContext: { text: true, structuredContent: true } } });
    await tick();
  }
  return { bridge, tools, sent, events, timers, receive, reply, outgoing, responses, request, initialize };
}

test('optional file helpers never invent transport methods or expose host failures', async () => {
  const absent=harness();await absent.initialize();
  assert.deepEqual(copy(absent.bridge.getFileCapabilities()),{download:false,select:false});
  assert.equal(await absent.bridge.getAuthorizedFileDownloadUrl('file-a'),null);
  assert.equal(await absent.bridge.selectAuthorizedFiles(),null);
  assert.deepEqual(absent.outgoing('tools/call'),[]);
  let received;
  const present=harness({getFileDownloadUrl:async args=>{received=args;return{downloadUrl:'https://files.oaiusercontent.com/authorized'};},selectFiles:async()=>[{fileId:'file-a',fileName:'image.png',mimeType:'image/png',ignored:'private'},{}]});await present.initialize();
  assert.equal(await present.bridge.getAuthorizedFileDownloadUrl('file-a'),'https://files.oaiusercontent.com/authorized');
  assert.deepEqual(copy(received),{fileId:'file-a'});
  assert.deepEqual(copy(await present.bridge.selectAuthorizedFiles()),[{fileId:'file-a',fileName:'image.png',mimeType:'image/png'}]);
  const denied=harness({getFileDownloadUrl:async()=>{throw new Error('secret signed URL');}});await denied.initialize();
  await assert.rejects(denied.bridge.getAuthorizedFileDownloadUrl('file-a'),error=>/authorize/.test(error.message)&&!error.message.includes('secret'));
});

test('host discovery and app tools operate in the mounted tab without the server render opener', async () => {
  const h = harness(); await h.initialize();
  const targets = [];
  h.tools.registerAppToolHandlers({ present: target => { targets.push(copy(target)); }, state: () => ({ view: 'study' }) });
  h.request('discover', 'tools/list');
  assert.deepEqual(h.responses('discover')[0].result.tools.map(tool => tool.name), ['nooks_present', 'nooks_view_state']);
  h.request('present', 'tools/call', { name: 'nooks_present', arguments: { artifactId: 'deck-a', alongsideArtifactId: 'note-a' } });
  await tick();
  assert.deepEqual(targets, [{ artifactId: 'deck-a', alongsideArtifactId: 'note-a' }]);
  assert.equal(h.responses('present')[0].result.structuredContent.status, 'presented');
  assert.deepEqual(h.outgoing('tools/call'), [], 'app tools must never call workspace_render or any server tool');
  assert.equal(h.sent.some(item => JSON.stringify(item.message).includes('workspace_render')), false);
});

test('numeric host request IDs cannot consume an outgoing RPC with the same ID', async () => {
  const h = harness(); await h.initialize();
  h.tools.registerAppToolHandlers({ present: () => {}, state: () => ({ view: 'study' }) });
  let settled = false;
  const pending = h.bridge.callTool('artifact_get', { artifactId: 'note-a' }).then(value => { settled = true; return value; });
  await tick();
  const rpc = h.outgoing('tools/call').at(-1);
  assert.equal(typeof rpc.id, 'number');
  h.request(rpc.id, 'tools/list');
  h.request(rpc.id, 'tools/call', { name: 'nooks_view_state', arguments: {} });
  await tick();
  assert.equal(h.responses(rpc.id).length, 2, 'both incoming requests get their own replies');
  assert.equal(settled, false);
  assert.equal(h.timers.size, 1, 'the outgoing RPC is still waiting for its actual response');
  h.reply(rpc, { structuredContent: { artifact: { id: 'note-a', kind: 'note' } } });
  assert.deepEqual(copy(await pending), { artifact: { id: 'note-a', kind: 'note' } });
  assert.equal(h.timers.size, 0);
});

test('foreign windows and mismatching pinned origins cannot invoke tools or resolve RPCs', async () => {
  const h = harness();
  const initialize = h.outgoing('ui/initialize')[0];
  h.receive({ jsonrpc: '2.0', id: initialize.id, result: {} }, { source: {}, origin: 'https://evil.example' });
  assert.equal(h.timers.size, 1);
  await h.initialize();
  let calls = 0;
  h.tools.registerAppToolHandlers({ present: () => { calls++; }, state: () => ({}) });
  const before = h.sent.length;
  const request = { jsonrpc: '2.0', id: 'untrusted', method: 'tools/call', params: { name: 'nooks_present', arguments: { view: 'focus' } } };
  h.receive(request, { source: {}, origin: 'https://chatgpt.com' });
  h.receive(request, { origin: 'https://evil.example' });
  h.receive({ ...request, method: 'tools/list' }, { origin: 'https://evil.example' });
  await tick();
  assert.equal(calls, 0); assert.equal(h.sent.length, before);
  assert.ok(h.sent.slice(1).every(item => item.origin === 'https://chatgpt.com'));
  let settled = false;
  const pending = h.bridge.callTool('artifact_get', { artifactId: 'owned-note' }).then(value => { settled = true; return value; });
  await tick();
  const rpc = h.outgoing('tools/call').at(-1);
  const response = { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: { injected: true } } };
  h.receive(response, { origin: 'https://evil.example' });
  h.receive(response, { source: {} });
  await tick(); assert.equal(settled, false);
  h.reply(rpc, { structuredContent: { owned: true } });
  assert.deepEqual(copy(await pending), { owned: true });
});

test('an in-flight app tool cannot send a late success or error reply after teardown', async () => {
  for (const reject of [false, true]) {
    const h = harness(); await h.initialize();
    let finish, fail;
    h.tools.registerAppToolHandlers({ present: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }), state: () => ({}) });
    h.request('slow-tool', 'tools/call', { name: 'nooks_present', arguments: { view: 'focus' } });
    await tick();
    h.request('closing', 'ui/resource-teardown');
    assert.deepEqual(h.responses('closing'), [{ jsonrpc: '2.0', id: 'closing', result: {} }]);
    assert.equal(h.events.filter(event => event.type === 'notable:teardown').length, 1);
    if (reject) fail(new Error('private backend failure')); else finish({ status: 'presented' });
    await tick();
    assert.deepEqual(h.responses('slow-tool'), []);
  }
});

test('clearing selected study context retains session routing and chat messages use the current session', async () => {
  const h = harness(); await h.initialize();
  const session = 'a67ded20-a99f-40ab-9b57-5aaf6e14e8f9';
  h.bridge.setWorkspaceSessionContext(session); await tick();
  h.reply(h.outgoing('ui/update-model-context').at(-1)); await tick();
  const select = h.bridge.updateModelContext({ title: 'Biology', text: 'Selected mitochondria note', structuredContent: { artifactId: 'note-a' } });
  await tick(); h.reply(h.outgoing('ui/update-model-context').at(-1)); await select;
  const clear = h.bridge.updateModelContext(null); await tick();
  const cleared = h.outgoing('ui/update-model-context').at(-1);
  assert.deepEqual(cleared.params.structuredContent, { workspaceSessionId: session });
  assert.match(cleared.params.content[0].text, /workspace_navigate/);
  assert.ok(cleared.params.content[0].text.includes(session));
  assert.equal(JSON.stringify(cleared.params).includes('mitochondria'), false);
  assert.equal(JSON.stringify(cleared.params).includes('note-a'), false);
  h.reply(cleared); await clear;
  const current = '022fbd73-2ba0-4932-a2d0-2a88d96bcd03';
  h.bridge.setWorkspaceSessionContext(current); await tick();
  h.reply(h.outgoing('ui/update-model-context').at(-1)); await tick();
  const chat = h.bridge.requestChatGPT('Make a quiz from this conversation.'); await tick();
  const message = h.outgoing('ui/message').at(-1);
  assert.equal(message.params.role, 'user');
  assert.ok(message.params.content[0].text.includes(current));
  assert.equal(message.params.content[0].text.includes(session), false);
  assert.match(message.params.content[0].text, /Do not call workspace_render again/);
  assert.match(message.params.content[0].text, /immediately present the result without asking/);
  assert.equal(h.bridge.getWorkspaceSessionId(), current);
  h.reply(message); assert.equal(await chat, true);
  assert.equal(h.timers.size, 0);
});

 test('tutorial transport cannot send tool writes or generation requests to the host', async () => {
  const h=harness(undefined,true);
  assert.equal((await h.bridge.callTool('artifact_save',{artifact:{id:'trial'}})).practice,true);
  assert.equal(await h.bridge.requestChatGPT('Create trial notes'),false);
  assert.deepEqual(h.outgoing('tools/call'),[]);
  assert.deepEqual(h.outgoing('ui/message'),[]);
 });
