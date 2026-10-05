import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
const ALICE='00000000-0000-4000-8000-000000000001';
const BOB='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://nooks-test.supabase.co',SUPABASE_SERVICE_KEY:'sb_secret_local_test_only'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const rpc=(name='workspace_get',args={},subject='trusted-alice')=>new Request('https://nooks.example/mcp',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':subject},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
function setup(t,{limit={allowed:true,retryAfter:30},outage=false}={}){
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1);const body=JSON.parse(options.body);calls.push({name,body});
  if(name==='nooks_resolve_identity')return response({id:calls.filter(x=>x.name===name).length===1?ALICE:BOB});
  if(name==='nooks_request_limit')return response(limit,outage?503:200);
  if(name==='nooks_workspace_read')return response(null);
  throw new Error(`Unexpected RPC ${name}`);
 });return calls;
}
test('native requests use verified internal actors and durable per-request quotas',async t=>{
 const calls=setup(t);
 for(const subject of ['trusted-alice','trusted-bob']){
  const result=await (await worker.fetch(rpc('workspace_get',{},subject),env)).json();
  assert.equal(result.result.isError,undefined);assert.equal(result.result.structuredContent.workspace.backend,'supabase');
 }
 assert.deepEqual(calls.map(x=>x.name),['nooks_resolve_identity','nooks_request_limit','nooks_workspace_read','nooks_resolve_identity','nooks_request_limit','nooks_workspace_read']);
 assert.deepEqual(calls.filter(x=>x.name==='nooks_request_limit').map(x=>x.body),[ALICE,BOB].map(id=>({p_account:id,p_bucket:'api',p_limit:180,p_window_seconds:60})));
});
test('native denied quota returns retry guidance and never reads or writes user data',async t=>{
 const calls=setup(t,{limit:{allowed:false,retryAfter:21}});
 const result=(await (await worker.fetch(rpc('artifact_save',{accountId:BOB,artifact:{kind:'note',title:'Test',subject:'Test',content:'Text'}}),env)).json()).result;
 assert.equal(result.isError,true);assert.equal(result.structuredContent.error.code,'RATE_LIMITED');assert.equal(result.structuredContent.error.retryAfter,21);
 assert.deepEqual(calls.map(x=>x.name),['nooks_resolve_identity','nooks_request_limit']);assert.equal(calls[1].body.p_account,ALICE);
});
test('REST tools and shared snapshots respect account quotas with HTTP 429',async t=>{
 const calls=setup(t,{limit:{allowed:false,retryAfter:999999}});
 for(const path of ['/api/tools/artifact_save','/api/shared/example']){
  const method=path.includes('/tools/')?'POST':'GET';
  const result=await worker.fetch(new Request('https://nooks.example'+path,{method,headers:{'Content-Type':'application/json','oai-authenticated-user-id':'trusted-alice'},...(method==='POST'?{body:'{}'}:{})}),env);
  assert.equal(result.status,429);assert.equal(result.headers.get('retry-after'),'60');
 }
 assert.ok(calls.every(x=>['nooks_resolve_identity','nooks_request_limit'].includes(x.name)));
});
test('quota service outage and malformed response fail closed',async t=>{
 for(const settings of [{outage:true},{limit:{}}])await t.test(JSON.stringify(settings),async t=>{
  const calls=setup(t,settings);t.mock.method(console,'error',()=>{});
  const result=(await (await worker.fetch(rpc(),env)).json()).result;
  assert.equal(result.isError,true);assert.equal(calls.length,2);assert.equal(result.structuredContent.workspace,undefined);
 });
});
test('discovery and UI resources remain free of private account and quota calls',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('Discovery must not contact account storage');});
 for(const [method,params] of [['tools/list',{}],['resources/read',{uri:'ui://notable/workspace-v2.html'}]]){
  const req=new Request('https://nooks.example/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const result=await (await worker.fetch(req,{ASSETS:{fetch:async()=>new Response('<main>Nooks</main>')}})).json();
  assert.equal(result.error,undefined);assert.ok(result.result);
 }
});
test('cloud diagnostics correlate failures without leaking user data and health never probes',async t=>{
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const calls=setup(t,{outage:true});
 const response=await worker.fetch(rpc('workspace_get',{secret:'private study payload'},'private-subject'),env);
 const result=(await response.json()).result;
 assert.match(result.structuredContent.error.requestId,/^[a-f0-9-]{36}$/);
 assert.equal(response.headers.get('x-request-id'),result.structuredContent.error.requestId);
 assert.equal(logs.at(-1).requestId,result.structuredContent.error.requestId);
 assert.equal(logs.at(-1).upstream.action,'nooks_request_limit');
 assert.doesNotMatch(JSON.stringify(logs),/private study payload|private-subject|sb_secret_local_test_only/);
 const count=calls.length;
 const health=await (await worker.fetch(new Request('https://nooks.example/health'),env)).json();
 assert.equal(calls.length,count);assert.equal(health.liveness,'alive');assert.equal(health.backend.observation,'recent_failure');
 assert.equal(health.backend.scope,'this-instance');assert.equal(health.backend.observationTtlSeconds,60);
});

// The native boundary must retain usable study data when private Storage is down.
test('native artwork outage returns saved work with bounded private-safe diagnostics',async t=>{
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const privatePath=`${ALICE}/${'a'.repeat(64)}`;
 const workspace={version:1,artifacts:[],plan:[],focusSessions:[],space:{_storedBackground:{path:privatePath,mime:'image/png'}}};
 t.mock.method(globalThis,'fetch',async url=>{
  if(url.endsWith('nooks_resolve_identity'))return response({id:ALICE});
  if(url.endsWith('nooks_request_limit'))return response({allowed:true});
  if(url.endsWith('nooks_workspace_read'))return response({revision:1,workspace});
  if(url.includes('/storage/v1/object/authenticated/'))return response({message:'private provider error'},503);
  assert.fail('Unexpected private request');
 });
 const result=(await (await worker.fetch(rpc(),env)).json()).result;
 assert.equal(result.isError,undefined);assert.equal(result.structuredContent.workspace.backend,'supabase');
 assert.equal(result._meta.notableData.workspace.artworkWarnings.length,1);
 assert.equal(logs.length,1);assert.equal(logs[0].event,'nooks.artwork_degraded');assert.equal(logs[0].affectedAppearances,1);
 assert.doesNotMatch(JSON.stringify(logs),/private provider error|sb_secret_local_test_only/);assert.equal(JSON.stringify(logs).includes(privatePath),false);
 const health=await (await worker.fetch(new Request('https://nooks.example/health'),env)).json();
 assert.equal(health.artwork.observation,'recent_degradation');assert.equal(health.backend.observation,'recent_success');
 assert.equal(health.eventDelivery.consumerConfigured,false);
});
