import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const navigation = moduleUrl(await readFile(new URL('./workspace-navigation.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./app-tools.ts', import.meta.url), 'utf8')).replace("from './workspace-navigation'", `from '${navigation}'`);
const { listAppTools, callAppTool, registerAppToolHandlers, subscribeAppToolsChanged } = await import(moduleUrl(source));
function register(t, handlers) { const stop = registerAppToolHandlers(handlers); t.after(stop); return stop; }

test('app tool discovery follows the mounted view and stale cleanup cannot unregister a new mount', async () => {
  assert.deepEqual(listAppTools(), []);
  let changes = 0;
  const unsubscribe = subscribeAppToolsChanged(() => { changes++; });
  const first = registerAppToolHandlers({ present: () => {}, state: () => ({ view: 'study' }) });
  const second = registerAppToolHandlers({ present: () => {}, state: () => ({ view: 'library' }) });
  assert.deepEqual(listAppTools().map(tool => tool.name), ['nooks_present', 'nooks_view_state']);
  first();
  assert.equal((await callAppTool('nooks_view_state')).structuredContent.viewState.view, 'library');
  const copy = listAppTools(); copy[0].inputSchema.properties.view.enum.push('unsafe');
  assert.equal(listAppTools()[0].inputSchema.properties.view.enum.includes('unsafe'), false);
  second(); unsubscribe();
  assert.equal(changes, 3);
  assert.deepEqual(listAppTools(), []);
  assert.equal((await callAppTool('nooks_present', { view: 'study' })).structuredContent.error.code, 'APP_UNAVAILABLE');
});

test('every named view and saved item reaches the current view callback without a server opener', async t => {
  const targets = [];
  register(t, { present: target => { targets.push(target); return { status: 'presented' }; }, state: () => ({}) });
  for (const view of ['study', 'library', 'explore', 'focus', 'plan', 'collection', 'music', 'people']) {
    const result = await callAppTool('nooks_present', { view });
    assert.equal(result.structuredContent.status, 'presented');
    assert.equal(result.isError, undefined);
  }
  await callAppTool('nooks_present', { artifactId: 'cards-cell-energy', alongsideArtifactId: 'note-cell-energy' });
  assert.equal(targets.length, 9);
  assert.deepEqual(targets.at(-1), { artifactId: 'cards-cell-energy', alongsideArtifactId: 'note-cell-energy' });
});

test('invalid or ambiguous requests never invoke navigation or reveal callback state', async t => {
  let calls = 0;
  register(t, { present: () => { calls++; }, state: () => { calls++; return {}; } });
  for (const args of [{}, null, [], { view: 'unknown' }, { view: 'study', artifactId: 'n' }, { view: 'study', alongsideArtifactId: 'n' }, { alongsideArtifactId: 'n' }, { artifactId: '' }, { artifactId: 'n', html: '<script>run()</script>' }, { artifactId: 'https://example.com' }, { artifactId: '<p>note</p>' }, { artifactId: 'a'.repeat(129) }, { artifactId: 'constructor' }, { artifactId: 'n', alongsideArtifactId: null }]) {
    const result = await callAppTool('nooks_present', args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.equal(result.structuredContent.error.code, 'INVALID_ARGUMENTS');
  }
  assert.equal((await callAppTool('nooks_view_state', { includeLibrary: true })).isError, true);
  assert.equal((await callAppTool('workspace_render', {})).structuredContent.error.code, 'UNKNOWN_TOOL');
  assert.equal(calls, 0);
});

test('view state returns only current references, never selected note content or the library', async t => {
  register(t, { present: () => {}, state: () => ({ view: 'study', artifactId: 'note-cell-energy', alongsideArtifactId: 'cards-cell-energy', sessionId: 'session-a', unsavedChanges: true, content: 'private draft', title: 'private title', artifacts: [{ content: 'private library' }], backgroundImage: 'private pixels' }) });
  const result = await callAppTool('nooks_view_state');
  assert.deepEqual(result.structuredContent, { viewState: { view: 'study', artifactId: 'note-cell-energy', alongsideArtifactId: 'cards-cell-energy', sessionId: 'session-a', unsavedChanges: true } });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('queued navigation reports saving without claiming it already opened', async t => {
  register(t, { present: () => ({ status: 'queued', content: 'secret draft' }), state: () => ({}) });
  const result = await callAppTool('nooks_present', { artifactId: 'new-quiz' });
  assert.equal(result.structuredContent.status, 'queued');
  assert.match(result.content[0].text, /waiting.*save/);
  assert.equal(JSON.stringify(result).includes('secret draft'), false);
});

test('owned nook draft presentation uses the same tab and rejects mixed destinations',async t=>{
  const targets=[];
  register(t,{present:target=>{targets.push(target);return{status:'presented'};},state:()=>({draftId:'draft-a',backgroundImage:'private'})});
  assert.equal((await callAppTool('nooks_present',{draftId:'draft-a'})).structuredContent.status,'presented');
  assert.deepEqual(targets,[{draftId:'draft-a'}]);
  for(const args of [{draftId:'draft-a',view:'study'},{draftId:'draft-a',artifactId:'note-a'},{draftId:'draft-a',alongsideArtifactId:'note-a'},{draftId:'__proto__'}])assert.equal((await callAppTool('nooks_present',args)).isError,true);
  assert.deepEqual((await callAppTool('nooks_view_state')).structuredContent,{viewState:{draftId:'draft-a'}});
});

test('an explicit opening is an exclusive overlay request and preserves current view references', async t => {
  const requests=[];
  register(t,{present:target=>{requests.push(target);return{status:'queued'};},state:()=>({view:'study',artifactId:'note-draft',unsavedChanges:true,presentation:'opening'})});
  const result=await callAppTool('nooks_present',{presentation:'opening'});
  assert.equal(result.structuredContent.status,'queued');
  assert.deepEqual(requests,[{presentation:'opening'}]);
  assert.match(result.content[0].text,/study work stays in place/);
  assert.doesNotMatch(result.content[0].text,/waiting.*save/);
  assert.deepEqual((await callAppTool('nooks_view_state')).structuredContent.viewState,{view:'study',artifactId:'note-draft',unsavedChanges:true,presentation:'opening'});
  for(const args of [{presentation:'unknown'},{presentation:'opening',view:'study'},{presentation:'opening',artifactId:'note-draft'},{presentation:'opening',draftId:'draft-a'},{presentation:'opening',alongsideArtifactId:'note-a'}])assert.equal((await callAppTool('nooks_present',args)).structuredContent.error.code,'INVALID_ARGUMENTS');
  assert.equal(requests.length,1);
});

test('callback failures and closed views are valid MCP errors without raw exception leakage', async t => {
  const stop = register(t, { present: () => { throw new Error('private backend URL and content'); }, state: () => { throw new Error('private library'); } });
  for (const [name, args] of [['nooks_present', { view: 'focus' }], ['nooks_view_state', {}]]) {
    const result = await callAppTool(name, args);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'APP_ERROR');
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
  stop();
  let finish;
  const close = register(t, { present: () => new Promise(resolve => { finish = resolve; }), state: () => ({}) });
  const inFlight = callAppTool('nooks_present', { view: 'focus' });
  close(); finish({ status: 'presented' });
  assert.equal((await inFlight).structuredContent.error.code, 'APP_UNAVAILABLE');
});
