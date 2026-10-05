import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { StudyEngine } from '../server/engine.mjs';
import { WorkspaceStore } from '../server/store.mjs';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { createWorkspace } from '../server/seed.mjs';
import { modelSafeResult } from '../server/model-result.mjs';
import { listTools, toolNames } from '../server/tools.mjs';
import { normalizeWorkspaceLayout, validateWorkspaceLayoutChange, WORKSPACE_WIDGET_IDS } from '../server/workspace-layout.mjs';
import { createNotableServer } from '../server/index.mjs';
import { createPreviewTools } from '../ui/src/preview/browser-tools.mjs';
import { BrowserPreviewStore } from '../ui/src/preview/browser-store.mjs';

const alice={id:'verified-alice',scopes:['notable.read','notable.write']};
const bob={...alice,id:'verified-bob'};
const empty={version:1,positions:{}};
async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'nooks-layout-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new WorkspaceStore(directory,{seeded:false});
  return {directory,store,engine:new StudyEngine(store)};
}

test('concurrent widget patches merge, survive a restart and unrelated note saves, and stay owner private',async t=>{
  const {directory,store,engine}=await fixture(t);
  assert.deepEqual((await engine.call('workspace_get',{},alice)).workspace.workspaceLayout,empty);
  await Promise.all(WORKSPACE_WIDGET_IDS.map((id,index)=>engine.call('workspace_layout_update',{id,position:{x:index/5,y:1-index/5}},alice)));
  const expected={version:1,positions:Object.fromEntries(WORKSPACE_WIDGET_IDS.map((id,index)=>[id,{x:index/5,y:1-index/5}]))};
  assert.deepEqual((await store.read(alice.id)).workspaceLayout,expected);
  assert.deepEqual((await engine.call('workspace_get',{},bob)).workspace.workspaceLayout,empty);
  const restarted=new StudyEngine(new WorkspaceStore(directory,{seeded:false}));
  await restarted.call('artifact_save',{artifact:{kind:'note',title:'Keep my note',content:'Private study content'}},alice);
  const loaded=(await restarted.call('workspace_get',{},alice)).workspace;
  assert.deepEqual(loaded.workspaceLayout,expected);assert.equal(loaded.artifacts.length,1);
  const share=(await restarted.call('space_share',{},alice)).share;
  assert.equal(share.workspaceLayout,undefined);assert.equal(share.space.workspaceLayout,undefined);
  assert.equal((await store.readShare(share.id)).workspaceLayout,undefined);
  assert.deepEqual((await store.read(alice.id)).workspaceLayout,expected);
});

test('individual and full resets preserve study data and the remaining widget overrides',async t=>{
  const {engine,store}=await fixture(t);
  await engine.call('workspace_layout_update',{id:'spotify',position:{x:0,y:1}},alice);
  await engine.call('workspace_layout_update',{id:'timer',position:{x:1,y:0}},alice);
  const before=await store.read(alice.id);
  const one=await engine.call('workspace_layout_update',{id:'spotify',position:null},alice);
  assert.deepEqual(one.workspaceLayout,{version:1,positions:{timer:{x:1,y:0}}});
  assert.deepEqual(one.workspace.artifacts,before.artifacts);
  const all=await engine.call('workspace_layout_update',{reset:true},alice);
  assert.deepEqual(all.workspaceLayout,empty);assert.deepEqual(all.workspace.plan,before.plan);
  assert.deepEqual(all.workspace.space,before.space);
  assert.deepEqual((await engine.call('workspace_layout_update',{reset:true},alice)).workspaceLayout,empty);
});

test('layout writes require a connected account and both scopes before reading or changing state',async t=>{
  const {engine,store}=await fixture(t);
  await assert.rejects(engine.call('workspace_layout_update',{reset:true}),{code:'AUTH_REQUIRED'});
  for(const scopes of [[],['notable.read'],['notable.write']])await assert.rejects(engine.call('workspace_layout_update',{reset:true},{...alice,scopes}),{code:'INSUFFICIENT_SCOPE'});
  assert.equal((await store.read(alice.id)).revision,0);
});

test('malformed or owner-selecting layout input fails before any transaction',async()=>{
  const engine=new StudyEngine({transact:()=>assert.fail('Invalid input cannot begin a transaction')});
  const bad=[{},[],null,{reset:false},{reset:true,id:'timer'},{reset:true,position:null},{reset:true,accountId:bob.id},
    {id:'timer'},{position:null},{id:'unknown',position:null},{id:'__proto__',position:null},
    {id:'timer',position:undefined},{id:'timer',position:[]},{id:'timer',position:{x:0,y:0,z:1}},
    {id:'timer',position:{x:0}},{id:'timer',position:{x:0,y:0},userId:bob.id},
    {id:'timer',position:{x:0,y:0},positions:{people:{x:1,y:1}}},
    Object.create({reset:true}),{id:'timer',position:Object.create({x:0,y:0})}];
  for(const coordinate of [-0.1,1.1,Infinity,-Infinity,NaN,'0',null,true])for(const axis of ['x','y'])bad.push({id:'timer',position:{x:0,y:0,[axis]:coordinate}});
  for(const input of bad)await assert.rejects(engine.call('workspace_layout_update',input,alice),{code:'INVALID_INPUT'});
  assert.throws(()=>validateWorkspaceLayoutChange({reset:true,[Symbol('extra')]:1}),{code:'INVALID_INPUT'});
});

test('old or malformed saved layouts load safely and normalize only bounded known positions',async()=>{
  const valid={x:0.25,y:0.75};
  assert.deepEqual(normalizeWorkspaceLayout({version:1,positions:{spotify:valid,timer:{x:2,y:0},tasks:{x:0,y:Infinity},unknown:valid,people:{...valid,ignored:'content'}}}),{version:1,positions:{spotify:valid,people:valid}});
  for(const value of [undefined,null,[],{version:2,positions:{spotify:valid}},{version:1,positions:null}])assert.deepEqual(normalizeWorkspaceLayout(value),empty);
  const legacy=createWorkspace();delete legacy.workspaceLayout;
  const engine=new StudyEngine({read:async()=>structuredClone(legacy),transact:()=>assert.fail('Layout defaults cannot cause a write on read')});
  assert.deepEqual((await engine.call('workspace_get',{},alice)).workspace.workspaceLayout,empty);
});

test('Supabase CAS retries merge another tab position and later full commits retain the arrangement',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const url='https://nooks-test.supabase.co',serviceKey='sb_secret_local_test_only';
  const identity=await createSitesIdentityResolver({url,serviceKey,namespace:'sites:layout-test',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>Response.json({id:owner})})({subject:'layout-owner'});
  let record=createWorkspace(),revision=0,conflict=true;const commits=[];
  record.artifacts=[];
  const store=new SupabaseStore({url,serviceKey,identity,fetchImpl:async(endpoint,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.p_account,owner);
    if(endpoint.endsWith('nooks_workspace_read'))return Response.json({revision,workspace:record});
    assert.ok(endpoint.endsWith('nooks_workspace_commit'));commits.push(body);
    if(conflict){conflict=false;record.workspaceLayout={version:1,positions:{timer:{x:0.7,y:0.3}}};revision++;return Response.json({committed:false,revision});}
    assert.equal(body.p_expected_revision,revision);record=structuredClone(body.p_workspace);return Response.json({committed:true,revision:++revision});
  }});
  const engine=new StudyEngine(store);
  const saved=await engine.call('workspace_layout_update',{id:'spotify',position:{x:0.2,y:0.8}},identity);
  const expected={version:1,positions:{timer:{x:0.7,y:0.3},spotify:{x:0.2,y:0.8}}};
  assert.equal(commits.length,2);assert.deepEqual(saved.workspaceLayout,expected);assert.deepEqual(record.workspaceLayout,expected);
  assert.equal(saved.recoveryScope,`account:${owner}`);
  await engine.call('artifact_save',{artifact:{kind:'note',title:'After moving',content:'Keep the positions'}},identity);
  assert.deepEqual((await engine.call('workspace_get',{},identity)).workspace.workspaceLayout,expected);
  assert.deepEqual(commits.at(-1).p_workspace.workspaceLayout,expected);
  const count=commits.length;
  await assert.rejects(store.transact(other,()=>({})),{code:'FORBIDDEN'});assert.equal(commits.length,count);
});

test('layout tool is app-only and layout results are kept in private UI metadata',()=>{
  const tool=listTools({oauthConfigured:true}).find(tool=>tool.name==='workspace_layout_update');
  assert.ok(toolNames.has(tool.name));assert.deepEqual(tool._meta.ui,{visibility:['app']});
  assert.equal(tool._meta['openai/outputTemplate'],undefined);assert.equal(tool.annotations.readOnlyHint,false);
  assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:['notable.read','notable.write']}]);
  assert.equal(tool.inputSchema.additionalProperties,false);assert.equal(tool.inputSchema.oneOf.length,2);
  const data={workspaceLayout:{version:1,positions:{spotify:{x:0.2,y:0.8}}},workspace:{...createWorkspace(),workspaceLayout:{version:1,positions:{timer:{x:1,y:0}}}}};
  const result=modelSafeResult({structuredContent:data});
  assert.equal(result.structuredContent.workspaceLayout,undefined);assert.equal(result.structuredContent.workspace.workspaceLayout,undefined);
  assert.deepEqual(result._meta.notableData,data);
});

test('device preview layout tool needs no cloud configuration and unavailable storage cannot fake a save',async t=>{
  const {store}=await fixture(t),call=createPreviewTools({store});
  const result=await call('workspace_layout_update',{id:'spotify',position:{x:0.4,y:0.6}});
  assert.equal(result.authenticated,false);assert.equal(result.mode,'browser-preview');assert.equal(result.storage,'this-browser');
  assert.equal(result.workspace.backend,'browser-preview');
  assert.deepEqual((await createPreviewTools({store})('workspace_get')).workspace.workspaceLayout,result.workspaceLayout);
  const unavailable=createPreviewTools({store:new BrowserPreviewStore({indexedDB:null})});
  await assert.rejects(unavailable('workspace_layout_update',{reset:true}),{code:'STORAGE_UNAVAILABLE'});
});

test('local demo REST and native MCP route layout updates and preserve the private UI result',async t=>{
  const {store}=await fixture(t);
  const {server}=createNotableServer({demo:true,store,logger:()=>{}});
  // Exercise the HTTP handler without opening a listener or contacting any service.
  function request(path,body) {
    return new Promise((resolve,reject)=>{
      const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
      req.url=path;req.method=body===undefined?'GET':'POST';req.headers={host:'127.0.0.1:8787','content-type':'application/json'};req.socket={remoteAddress:'127.0.0.1'};
      const headers={};let status;
      req.on('error',reject);
      server.emit('request',req,{setHeader(key,value){headers[key]=value;},writeHead(value,extra){status=value;Object.assign(headers,extra);},end(value){try{resolve({status,headers,body:JSON.parse(value)});}catch(error){reject(error);}}});
    });
  }
  const rest=await request('/api/tools/workspace_layout_update',{id:'spotify',position:{x:0.1,y:0.9}});
  assert.equal(rest.status,200);assert.equal(rest.body.mode,'local-demo');
  const native=await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'workspace_layout_update',arguments:{id:'timer',position:{x:0.8,y:0.2}}}});
  assert.equal(native.status,200);assert.equal(native.body.result.isError,undefined);
  assert.equal(native.body.result.structuredContent.workspaceLayout,undefined);
  const expected={version:1,positions:{spotify:{x:0.1,y:0.9},timer:{x:0.8,y:0.2}}};
  assert.deepEqual(native.body.result._meta.notableData.workspaceLayout,expected);
  assert.deepEqual((await request('/api/workspace')).body.workspace.workspaceLayout,expected);
  const rejected=await request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'workspace_layout_update',arguments:{id:'timer',position:{x:2,y:0}}}});
  assert.equal(rejected.body.result.isError,true);assert.equal(rejected.body.result.structuredContent.error.code,'INVALID_INPUT');
});
