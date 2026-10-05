import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createBrowserApiHandler, browserBackendConfig } from '../server/browser-api.mjs';
const ALICE='00000000-0000-4000-8000-000000000001',BOB='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://nooks-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SERVICE_KEY:'sb_secret_test',NOOKS_PUBLIC_URL:'https://nooks.example'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
function backend(extraEnv={}) {
 const records=new Map(),calls=[];let limited=false;let now=new Date('2026-10-02T00:00:00Z');
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user')){const token=options.headers.Authorization.split(' ')[1];return ['alice','bob'].includes(token)?response({id:token==='alice'?ALICE:BOB}):response({},401);}
  const args=JSON.parse(options.body);
  if(url.endsWith('nooks_resolve_identity'))return response({id:args.p_auth_user_id});
  if(url.endsWith('nooks_request_limit'))return response({allowed:limited!==true&&limited!==args.p_bucket,retryAfter:42});
  if(url.endsWith('nooks_workspace_read'))return response(records.get(args.p_account)??null);
  if(url.endsWith('nooks_workspace_commit')){
   const old=records.get(args.p_account);if((old?.revision??0)!==args.p_expected_revision)return response({committed:false});
   records.set(args.p_account,{revision:args.p_expected_revision+1,workspace:structuredClone(args.p_workspace)});return response({committed:true});
  }
  if(url.endsWith('nooks_community'))return response({actor:args.p_actor,arguments:args.p_args});
  throw new Error('Unexpected request '+url);
 };
 return {handler:createBrowserApiHandler({env:{...env,...extraEnv},fetchImpl,clock:()=>now}),calls,records,setLimited:value=>{limited=value},advance:ms=>{now=new Date(now.valueOf()+ms)}};
}
async function invoke(handler,path,{method='GET',token,body,headers={}}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url=path;req.method=method;req.headers={origin:'https://nooks.example',...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`} :{}),...headers};req.socket={remoteAddress:'127.0.0.1'};
 let status,output,responseHeaders;const res={writeHead(s,h){status=s;responseHeaders=h},end(data){output=JSON.parse(data)}};
 await handler(req,res);return {status,body:output,headers:responseHeaders};
}
test('public config exposes only verified public key and fails closed on missing or unsafe config',async()=>{
 const b=backend();const result=await invoke(b.handler,'/api/config');assert.equal(result.status,200);assert.equal(result.body.backend,'supabase');assert.equal(result.body.generation,false);assert.ok(!JSON.stringify(result.body).includes(env.SUPABASE_SERVICE_KEY));assert.equal(b.calls.length,0);
 assert.equal(browserBackendConfig({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_wrong'}),null);
 const jwt=role=>`header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
 assert.equal(browserBackendConfig({...env,SUPABASE_PUBLISHABLE_KEY:jwt('service_role')}),null);
 assert.ok(browserBackendConfig({...env,SUPABASE_PUBLISHABLE_KEY:jwt('anon')}));
 const missing=await invoke(createBrowserApiHandler({env:{},allowedOrigins:['https://nooks.example']}),'/api/config');assert.equal(missing.body.backend,'unconfigured');assert.equal(missing.body.publishableKey,undefined);
});
test('unauthenticated, forged, cross-origin, and cross-site requests cannot reach account data',async()=>{
 const b=backend();assert.equal((await invoke(b.handler,'/api/workspace')).status,401);
 assert.equal((await invoke(b.handler,'/api/workspace',{token:'forged',headers:{'x-user-id':ALICE}})).status,401);
 assert.equal((await invoke(b.handler,'/api/workspace',{token:'alice',headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await invoke(b.handler,'/api/workspace',{token:'alice',headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal(b.calls.filter(call=>call.url.endsWith('nooks_workspace_read')).length,0);
});
test('real engine over request-scoped adapter isolates accounts and rejects stale note edits',async()=>{
 const b=backend();const create=await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{id:'same-id',kind:'note',title:'Private',content:'Alice only'}}});assert.equal(create.status,200);assert.equal(create.body.workspace.backend,'supabase');assert.equal(create.body.artifact.revision,1);
 const bob=await invoke(b.handler,'/api/tools/artifact_get',{method:'POST',token:'bob',body:{artifactId:'same-id'}});assert.equal(bob.status,404);
 const owned=await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'bob',body:{artifact:{id:'same-id',kind:'note',title:'Bob',content:'Different note'}}});assert.equal(owned.status,200);
 const update=await invoke(b.handler,'/api/tools/note_update',{method:'POST',token:'alice',body:{artifactId:'same-id',expectedRevision:1,content:'Alice edit'}});assert.equal(update.status,200);
 const stale=await invoke(b.handler,'/api/tools/note_update',{method:'POST',token:'alice',body:{artifactId:'same-id',expectedRevision:1,content:'Stale'}});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'REVISION_CONFLICT');
 assert.equal(b.records.get(ALICE).workspace.artifacts[0].content,'Alice edit');assert.equal(b.records.get(BOB).workspace.artifacts[0].content,'Different note');
});
test('nook membership actions ignore forged actors; quotas fail closed before writes',async()=>{
 const b=backend();const membership=await invoke(b.handler,'/api/tools/nook_join',{method:'POST',token:'alice',body:{nookId:BOB,actor:BOB,userId:BOB,accountId:BOB}});assert.equal(membership.body.actor,ALICE);assert.deepEqual(membership.body.arguments,{nookId:BOB});
 b.setLimited(true);const blocked=await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{kind:'note',title:'No',content:'No'}}});assert.equal(blocked.status,429);assert.equal(blocked.headers['Retry-After'],'42');assert.equal(b.records.size,0);
});
test('focus time and reward credit come from server clock and completion retry credits once',async()=>{
 const b=backend();const start=await invoke(b.handler,'/api/tools/focus_start',{method:'POST',token:'alice',body:{minutes:1}});assert.equal(start.status,200);
 b.advance(70_000);const body={sessionId:start.body.focusSession.id};const done=await invoke(b.handler,'/api/tools/focus_complete',{method:'POST',token:'alice',body});const retry=await invoke(b.handler,'/api/tools/focus_complete',{method:'POST',token:'alice',body});assert.equal(done.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.workspace.stats.focusMinutes,1);assert.equal(retry.body.workspace.roomProgress['rainy-library'].focusSeconds,60);
});
test('unknown actions, oversize payloads and missing generation configuration have explicit errors',async()=>{
 const b=backend();assert.equal((await invoke(b.handler,'/api/tools/admin_reset',{method:'POST',token:'alice',body:{}})).status,404);
 assert.equal((await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{},headers:{'content-length':'3000000'}})).status,413);
 const generation=await invoke(b.handler,'/api/generate',{method:'POST',token:'alice',body:{kind:'note'}});assert.equal(generation.status,503);assert.equal(generation.body.error.code,'GENERATION_UNAVAILABLE');
});
test('focus links only owned work and preserves the starting material when resumed',async()=>{
 const b=backend();await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{id:'note',kind:'note',title:'Cell notes',content:'DNA'}}});
 const foreign=await invoke(b.handler,'/api/tools/focus_start',{method:'POST',token:'bob',body:{artifactId:'note'}});assert.equal(foreign.status,404);
 const start=await invoke(b.handler,'/api/tools/focus_start',{method:'POST',token:'alice',body:{artifactId:'note'}});assert.equal(start.body.focusSession.artifactId,'note');assert.equal(start.body.focusSession.artifactRevision,1);assert.equal(start.body.focusSession.artifactTitle,'Cell notes');
 const retry=await invoke(b.handler,'/api/tools/focus_start',{method:'POST',token:'alice',body:{}});assert.equal(retry.body.focusSession.id,start.body.focusSession.id);assert.equal(retry.body.focusSession.artifactId,'note');
});
test('saved generation retries remain recoverable after hourly quota exhaustion or removed model key',async()=>{
 for(const extraEnv of [{OPENAI_API_KEY:'configured-key'},{}]){
  const b=backend(extraEnv),requestId='10000000-0000-4000-8000-000000000001';
  await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{id:`generated-${requestId}`,kind:'note',title:'Saved result',content:'Already generated'}}});b.setLimited('generation');
  const retry=await invoke(b.handler,'/api/generate',{method:'POST',token:'alice',body:{requestId,kind:'note',instruction:'Same request'}});assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.artifact.content,'Already generated');
  assert.equal(b.calls.filter(call=>call.url.endsWith('nooks_request_limit')&&JSON.parse(call.options.body).p_bucket==='generation').length,0);
 }
});

test('request media type must be JSON rather than a matching prefix',async()=>{
 const b=backend();
 for(const contentType of ['application/jsonp','application/json-malformed','text/plain']) {
  const result=await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{kind:'note',title:'Note',content:'Private'}},headers:{'content-type':contentType}});
  assert.equal(result.status,400);assert.equal(result.body.error.code,'INVALID_INPUT');
 }
 assert.equal(b.records.size,0);
 const valid=await invoke(b.handler,'/api/tools/artifact_save',{method:'POST',token:'alice',body:{artifact:{kind:'note',title:'Note',content:'Private'}},headers:{'content-type':'application/json; charset=utf-8'}});
 assert.equal(valid.status,200);
});

test('layout route accepts account-bound patches and reports auth, quota and missing configuration failures',async()=>{
 const b=backend(),path='/api/tools/workspace_layout_update',body={id:'spotify',position:{x:0.25,y:0.75}};
 assert.equal((await invoke(b.handler,path,{method:'POST',body})).status,401);
 const saved=await invoke(b.handler,path,{method:'POST',token:'alice',body});
 assert.equal(saved.status,200);assert.deepEqual(saved.body.workspaceLayout,{version:1,positions:{spotify:body.position}});
 assert.deepEqual((await invoke(b.handler,'/api/workspace',{token:'alice'})).body.workspace.workspaceLayout,saved.body.workspaceLayout);
 assert.deepEqual((await invoke(b.handler,'/api/workspace',{token:'bob'})).body.workspace.workspaceLayout,{version:1,positions:{}});
 const revision=b.records.get(ALICE).revision;
 const forged=await invoke(b.handler,path,{method:'POST',token:'alice',body:{...body,accountId:BOB}});
 assert.equal(forged.status,400);assert.equal(forged.body.error.code,'INVALID_INPUT');assert.equal(b.records.get(ALICE).revision,revision);
 b.setLimited(true);
 const quota=await invoke(b.handler,path,{method:'POST',token:'alice',body:{reset:true}});
 assert.equal(quota.status,429);assert.equal(quota.body.error.code,'RATE_LIMITED');assert.equal(b.records.get(ALICE).revision,revision);
 const unavailable=createBrowserApiHandler({env:{},allowedOrigins:['https://nooks.example'],logger:()=>{},fetchImpl:()=>assert.fail('An unconfigured save cannot contact a backend')});
 const blocked=await invoke(unavailable,path,{method:'POST',token:'alice',body});
 assert.equal(blocked.status,503);assert.equal(blocked.body.error.code,'BACKEND_UNAVAILABLE');assert.equal(blocked.body.workspace,undefined);
});
