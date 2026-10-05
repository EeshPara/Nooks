import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { listTools, toolNames } from '../server/tools.mjs';
import { WORKSPACE_SESSION_TTL_MS, WORKSPACE_SESSION_LIMIT, openWorkspaceSession, navigateWorkspaceSession } from '../server/workspace-session.mjs';

const alice = { id:'alice',scopes:['notable.read','notable.write'] };
const bob = { id:'bob',scopes:['notable.read','notable.write'] };
const session = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const note = id => ({id,kind:'note',title:'Private title',subject:'Biology',content:'PRIVATE_STUDY_CONTENT_DO_NOT_LEAK'});
const quiz = (id,kind='quiz') => ({id,kind,title:'Private quiz',subject:'Biology',questions:[{prompt:'One?',options:['1','2'],correctIndex:0}]});
const cards = id => ({id,kind:'flashcards',title:'Private cards',subject:'Biology',cards:[{front:'front',back:'back'}]});
const code = expected => error => error?.code===expected;
async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'nooks-navigation-'));
  let time=Date.parse('2026-10-04T10:00:00Z');
  const clock=()=>new Date(time),store=new WorkspaceStore(directory,{clock,seeded:false}),engine=new StudyEngine(store,{clock});
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return {store,engine,clock,advance:ms=>{time+=ms;},call:(name,args={},user=alice)=>engine.call(name,args,user)};
}

test('session commands remain account-isolated even when two accounts register the same UUID', async t => {
  const {call}=await fixture(t);
  await call('artifact_save',{artifact:note('alice-note')});
  await call('artifact_save',{artifact:note('bob-note')},bob);
  await call('workspace_session_open',{sessionId:session(1)});
  await call('workspace_session_open',{sessionId:session(1)},bob);
  const queued=await call('workspace_navigate',{sessionId:session(1),artifactId:'alice-note'});
  assert.equal(queued.queued,true);assert.equal(queued.sequence,1);
  assert.equal(queued.workspace,undefined);assert.equal(queued.artifact,undefined);assert.equal(queued.viewed,undefined);
  const theirs=await call('workspace_session_poll',{sessionId:session(1),afterSequence:0},bob);
  assert.equal(theirs.sequence,0);assert.equal(theirs.command,null);
  const mine=await call('workspace_session_poll',{sessionId:session(1),afterSequence:0});
  assert.deepEqual(mine.command,{sequence:1,artifactId:'alice-note'});
  assert.doesNotMatch(JSON.stringify(mine),/PRIVATE_STUDY_CONTENT|Private title|artifacts|workspaceSessions/);
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),artifactId:'bob-note'}),code('NOT_FOUND'));
  await assert.rejects(call('workspace_session_poll',{sessionId:session(2),afterSequence:0},bob),code('SESSION_EXPIRED'));
});

test('latest command wins, polls never write, duplicate registration returns current sequence without replay', async t => {
  const {call,store,engine}=await fixture(t);
  const opened=await call('workspace_session_open',{sessionId:session(1)});
  assert.equal(opened.sequence,0);assert.equal(opened.command,undefined);assert.equal(opened.workspace,undefined);
  await call('workspace_navigate',{sessionId:session(1),view:'library'});
  await call('workspace_navigate',{sessionId:session(1),view:'focus'});
  const before=await store.read(alice.id);
  const result=await call('workspace_session_poll',{sessionId:session(1),afterSequence:0});
  assert.deepEqual(result.command,{sequence:2,view:'focus'});
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:2})).command,null);
  assert.deepEqual(await store.read(alice.id),before);
  const remounted=await call('workspace_session_open',{sessionId:session(1).toUpperCase()});
  assert.equal(remounted.sequence,2);assert.equal(remounted.command,undefined);
  assert.equal((await store.read(alice.id)).workspaceSessions.length,1);
  assert.equal((await engine.call('workspace_session_poll',{sessionId:session(1),afterSequence:remounted.sequence},alice)).command,null);
  await assert.rejects(call('workspace_session_poll',{sessionId:session(1),afterSequence:3}),code('INVALID_INPUT'));
});

test('only explicit open renews TTL, expired sessions reject commands and are pruned for a new tab', async t => {
  const {call,store,advance,clock}=await fixture(t);
  const opened=await call('workspace_session_open',{sessionId:session(1)});
  assert.equal(Date.parse(opened.expiresAt)-clock().getTime(),WORKSPACE_SESSION_TTL_MS);
  advance(5*60*1000);
  const renewed=await call('workspace_session_open',{sessionId:session(1)});
  assert.equal(Date.parse(renewed.expiresAt)-Date.parse(opened.expiresAt),5*60*1000);
  advance(10*60*1000);
  assert.equal((await call('workspace_navigate',{sessionId:session(1),view:'plan'})).expiresAt,renewed.expiresAt);
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:0})).expiresAt,renewed.expiresAt);
  advance(20*60*1000);
  const before=await store.read(alice.id);
  await assert.rejects(call('workspace_session_poll',{sessionId:session(1),afterSequence:0}),code('SESSION_EXPIRED'));
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),view:'study'}),code('SESSION_EXPIRED'));
  await assert.rejects(call('workspace_session_open',{sessionId:session(1)}),code('SESSION_EXPIRED'));
  assert.deepEqual(await store.read(alice.id),before);
  await call('workspace_session_open',{sessionId:session(2)});
  assert.deepEqual((await store.read(alice.id)).workspaceSessions.map(item=>item.sessionId),[session(2)]);
});

test('twelve active sessions are bounded without evicting a live tab or accumulating commands', async t => {
  const {call,store}=await fixture(t);
  for(let i=1;i<=WORKSPACE_SESSION_LIMIT;i++)await call('workspace_session_open',{sessionId:session(i)});
  const before=await store.read(alice.id);
  await assert.rejects(call('workspace_session_open',{sessionId:session(13)}),code('SESSION_LIMIT'));
  assert.deepEqual(await store.read(alice.id),before);
  for(let i=0;i<20;i++)await call('workspace_navigate',{sessionId:session(1),view:i%2?'plan':'study'});
  const saved=(await store.read(alice.id)).workspaceSessions;
  assert.equal(saved.length,12);assert.equal(saved[0].sequence,20);
  assert.equal(saved[0].command.sequence,20);assert.ok(JSON.stringify(saved).length<3000);
  assert.equal((await call('workspace_session_open',{sessionId:session(1)})).sequence,20);
});

test('concurrent registrations and commands preserve separate tabs and increasing sequences', async t => {
  const {call,store}=await fixture(t);
  await Promise.all([1,2,3].map(n=>call('workspace_session_open',{sessionId:session(n)})));
  const results=await Promise.all(Array.from({length:8},(_,n)=>call('workspace_navigate',{sessionId:session(1),view:n%2?'plan':'study'})));
  assert.deepEqual(results.map(result=>result.sequence).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
  assert.equal((await store.read(alice.id)).workspaceSessions.length,3);
  assert.equal((await call('workspace_session_poll',{sessionId:session(2),afterSequence:0})).command,null);
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:0})).sequence,8);
});

test('alongside navigation accepts only owned practice material with an owned note reference', async t => {
  const {call}=await fixture(t);
  for(const artifact of [note('reference'),note('other-note'),quiz('quiz'),quiz('exam','exam'),cards('cards')])await call('artifact_save',{artifact});
  await call('artifact_save',{artifact:note('foreign-reference')},bob);
  await call('workspace_session_open',{sessionId:session(1)});
  for(const artifactId of ['quiz','exam','cards']) {
    const queued=await call('workspace_navigate',{sessionId:session(1),artifactId,alongsideArtifactId:'reference'});
    const result=await call('workspace_session_poll',{sessionId:session(1),afterSequence:queued.sequence-1});
    assert.deepEqual(result.command,{sequence:queued.sequence,artifactId,alongsideArtifactId:'reference'});
  }
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),artifactId:'reference',alongsideArtifactId:'other-note'}),code('INVALID_INPUT'));
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),artifactId:'quiz',alongsideArtifactId:'cards'}),code('INVALID_INPUT'));
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),artifactId:'quiz',alongsideArtifactId:'foreign-reference'}),code('NOT_FOUND'));
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),artifactId:'foreign-reference'}),code('NOT_FOUND'));
});

test('deleted or changed pending targets are revalidated without breaking an already-consumed cursor', async t => {
  const {call,store}=await fixture(t);
  await call('artifact_save',{artifact:note('reference')});
  await call('artifact_save',{artifact:quiz('quiz')});
  await call('workspace_session_open',{sessionId:session(1)});
  await call('workspace_navigate',{sessionId:session(1),artifactId:'quiz',alongsideArtifactId:'reference'});
  await store.transact(alice.id,workspace=>{workspace.artifacts.find(item=>item.id==='reference').kind='flashcards';return {};});
  await assert.rejects(call('workspace_session_poll',{sessionId:session(1),afterSequence:0}),code('INVALID_INPUT'));
  await call('artifact_delete',{artifactId:'reference'});
  await assert.rejects(call('workspace_session_poll',{sessionId:session(1),afterSequence:0}),code('NOT_FOUND'));
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:1})).command,null);
  await call('workspace_navigate',{sessionId:session(1),view:'library'});
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:1})).command.view,'library');
});

test('session tools require actual account read permission and writes also need write permission', async t => {
  const {call,store}=await fixture(t);
  await call('workspace_session_open',{sessionId:session(1)});
  const actions=[['workspace_session_open',{sessionId:session(2)}],['workspace_session_poll',{sessionId:session(1),afterSequence:0}],['workspace_navigate',{sessionId:session(1),view:'study'}]];
  const before=await store.read(alice.id);
  for(const [name,args] of actions) {
    await assert.rejects(call(name,args,null),code('AUTH_REQUIRED'));
    await assert.rejects(call(name,args,{id:alice.id,scopes:['notable.write']}),code('INSUFFICIENT_SCOPE'));
    await assert.rejects(call(name,args,{id:alice.id}),code('INSUFFICIENT_SCOPE'));
  }
  const readOnly={id:alice.id,scopes:['notable.read']};
  assert.equal((await call('workspace_session_poll',{sessionId:session(1),afterSequence:0},readOnly)).command,null);
  await assert.rejects(call('workspace_session_open',{sessionId:session(1)},readOnly),code('INSUFFICIENT_SCOPE'));
  await assert.rejects(call('workspace_navigate',{sessionId:session(1),view:'study'},readOnly),code('INSUFFICIENT_SCOPE'));
  assert.deepEqual(await store.read(alice.id),before);
});

test('invalid session, cursor and target arguments cannot mutate a session or carry extra content', async t => {
  const {call,store}=await fixture(t);
  await call('workspace_session_open',{sessionId:session(1)});
  const before=await store.read(alice.id);
  for(const bad of [undefined,null,'not-a-uuid','__proto__',1])await assert.rejects(call('workspace_session_open',{sessionId:bad}),code('INVALID_INPUT'));
  for(const bad of [undefined,null,-1,1.5,Number.MAX_SAFE_INTEGER+1,'0'])await assert.rejects(call('workspace_session_poll',{sessionId:session(1),afterSequence:bad}),code('INVALID_INPUT'));
  for(const target of [{},{view:'unknown'},{view:'study',artifactId:'reference'},{view:'study',alongsideArtifactId:'reference'},
    {alongsideArtifactId:'reference'},{artifactId:''},{artifactId:'x'.repeat(129)},{artifactId:'__proto__'},
    {view:'plan',content:'PRIVATE_CONTENT'},{view:'plan',accountId:bob.id}]) {
    await assert.rejects(call('workspace_navigate',{sessionId:session(1),...target}),code('INVALID_INPUT'));
  }
  assert.deepEqual(await store.read(alice.id),before);
});

test('session tools are app-only where required and navigation never advertises a rendering entrypoint', () => {
  const tools=listTools({oauthConfigured:true});
  for(const name of ['workspace_session_open','workspace_session_poll']) {
    const tool=tools.find(tool=>tool.name===name);assert.ok(toolNames.has(name));
    assert.deepEqual(tool._meta.ui,{visibility:['app']});assert.equal(tool._meta['openai/outputTemplate'],undefined);
  }
  assert.equal(tools.find(tool=>tool.name==='workspace_session_poll').annotations.readOnlyHint,true);
  const navigate=tools.find(tool=>tool.name==='workspace_navigate');
  assert.equal(navigate._meta.ui,undefined);assert.equal(navigate._meta['openai/ui'],undefined);
  assert.equal(navigate._meta['openai/outputTemplate'],undefined);assert.equal(navigate.icons,undefined);
  assert.equal(navigate.annotations.idempotentHint,false);
});

test('Supabase unchanged polls read only session JSON; pending targets fetch bounded metadata without hydration', async () => {
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const origin='https://nooks-test.supabase.co',serviceKey='sb_secret_local_test_only';
  const identity=await createSitesIdentityResolver({url:origin,serviceKey,namespace:'sites:test',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>Response.json({id:owner})})({subject:'verified-host-user'});
  const now='2026-10-04T10:00:00.000Z',state={artifacts:[{id:'quiz',kind:'quiz'},{id:'reference',kind:'note'}]};
  openWorkspaceSession(state,{sessionId:session(1)},now);
  const requests=[];
  const store=new SupabaseStore({url:origin,serviceKey,identity,fetchImpl:async (input,init)=>{
    assert.equal(init.redirect,'manual','Navigation polling must use a Workers-supported redirect mode without forwarding credentials');
    const url=new URL(input);requests.push(url);
    assert.equal(url.searchParams.get('account_id'),`eq.${owner}`);
    if(url.pathname==='/rest/v1/nooks_workspaces') {
      assert.equal(url.searchParams.get('select'),'sessions:document->workspaceSessions');assert.equal(url.searchParams.get('limit'),'1');
      return Response.json([{sessions:state.workspaceSessions}]);
    }
    if(url.pathname==='/rest/v1/nooks_artifacts') {
      assert.equal(url.searchParams.get('select'),'id,kind');assert.equal(url.searchParams.get('limit'),'1001');
      return Response.json(state.artifacts.map(item=>({...item,content:'IGNORED_PRIVATE_TEXT'})));
    }
    assert.fail(`Unexpected full workspace or image request: ${url.pathname}`);
  }});
  store.read=async()=>assert.fail('Poll must not hydrate the workspace');
  store.transact=async()=>assert.fail('Poll must not write');
  const engine=new StudyEngine(store,{clock:()=>new Date(now)});
  const unchanged=await engine.call('workspace_session_poll',{sessionId:session(1),afterSequence:0},identity);
  assert.equal(unchanged.command,null);assert.equal(requests.length,1);
  navigateWorkspaceSession(state,{sessionId:session(1),artifactId:'quiz',alongsideArtifactId:'reference'},now);
  const pending=await engine.call('workspace_session_poll',{sessionId:session(1),afterSequence:0},identity);
  assert.deepEqual(pending.command,{sequence:1,artifactId:'quiz',alongsideArtifactId:'reference'});
  assert.equal(requests.filter(url=>url.pathname.endsWith('nooks_artifacts')).length,1);
  assert.doesNotMatch(JSON.stringify(pending),/IGNORED_PRIVATE_TEXT|artifacts|workspace/);
  const requestCount=requests.length;
  await assert.rejects(store.readNavigationState(other),code('FORBIDDEN'));
  assert.equal(requests.length,requestCount);
  state.artifacts=[];
  await assert.rejects(engine.call('workspace_session_poll',{sessionId:session(1),afterSequence:0},identity),code('NOT_FOUND'));
});
