import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore, createSupabaseOutbox } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver, createSupabaseIdentityVerifier, verifySupabaseWebhook, sha256, serviceHeaders } from '../server/supabase-auth.mjs';
import { StudyEngine } from '../server/engine.mjs';
const ALICE='00000000-0000-4000-8000-000000000001',BOB='00000000-0000-4000-8000-000000000002';
const origin='https://nooks-test.supabase.co',serviceKey='sb_secret_local_test_only';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function identity(id=ALICE){const resolver=createSitesIdentityResolver({url:origin,serviceKey,namespace:'sites:test-project',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>response({id})});return resolver({subject:'verified-'+id});}
function artworkRpc(url, options) {
 if(url.endsWith('nooks_artwork_reserve')){const args=JSON.parse(options.body);return response({path:`${args.p_account}/${args.p_hash}/${args.p_request_id}`,mime:args.p_mime,generation:args.p_request_id,pinToken:ALICE,pinUntil:new Date(Date.now()+900000).toISOString(),state:'reserved'});}
 if(url.endsWith('nooks_artwork_complete'))return response({accepted:true,state:'ready'});
}

test('adapter requires an issued identity proof and refuses account substitution',async()=>{
 assert.throws(()=>new SupabaseStore({url:origin,serviceKey,identity:{id:ALICE,scopes:['notable.write']}}),/verified/);
 const issued=await identity();let requested=false;
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async()=>{requested=true;return response(null)}});
 await assert.rejects(store.read(BOB),{code:'FORBIDDEN'});assert.equal(requested,false);
 assert.throws(()=>createSitesIdentityResolver({url:origin,serviceKey,namespace:'sites:test'}),/trusted/);
 assert.throws(()=>serviceHeaders('sb_publishable_client_key'),/publishable/);
});

test('Supabase bearer identity is verified remotely, not decoded from client claims',async()=>{
 const calls=[];const verify=createSupabaseIdentityVerifier({url:origin,publishableKey:'sb_publishable_test',serviceKey,fetchImpl:async(url,options)=>{
  calls.push({url,options});return url.endsWith('/auth/v1/user')?response({id:ALICE}):response({id:BOB});
 }});
 const result=await verify('a.b.c');assert.equal(result.id,BOB);assert.equal(result.provider,'supabase');
 assert.equal(calls[0].options.headers.Authorization,'Bearer a.b.c');
 const body=JSON.parse(calls[1].options.body);assert.equal(body.p_auth_user_id,ALICE);assert.equal(body.p_subject_hash,await sha256(ALICE));
 const denied=createSupabaseIdentityVerifier({url:origin,publishableKey:'public',serviceKey,fetchImpl:async()=>response({},401)});assert.equal(await denied('invalid'),null);
});

test('new cloud account has no sample notes/tasks/progress',async()=>{
 const issued=await identity();const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async()=>response(null)});
 const result=await new StudyEngine(store).call('workspace_get',{},issued);
 assert.deepEqual(result.workspace.artifacts,[]);assert.deepEqual(result.workspace.plan.tasks,[]);assert.deepEqual(result.workspace.progress,[]);assert.equal(result.workspace.stats.xp,0);
});

test('CAS retry reloads concurrent state rather than overwriting it',async()=>{
 const issued=await identity();let reads=0,writes=0;const sent=[];
 const initial={version:1,artifacts:[],progress:[],focusSessions:[],roomProgress:{},reviews:{},plan:{tasks:[]},stats:{xp:0}};
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);if(url.endsWith('nooks_workspace_read')){reads++;return response({revision:reads===1?0:1,workspace:{...initial,plan:{tasks:reads===1?[]:[{id:'concurrent',title:'Existing task'}]}}});}
  writes++;sent.push(body);return response({committed:writes>1,revision:writes});
 }});
 const result=await store.transact(issued.id,workspace=>{workspace.plan.tasks.push({id:'mine',title:'New task'});return {saved:true}});
 assert.equal(reads,2);assert.equal(sent[1].p_expected_revision,1);assert.deepEqual(result.workspace.plan.tasks.map(x=>x.id),['concurrent','mine']);assert.equal(result.saved,true);
 assert.equal(result.workspace.revision,2);assert.equal(sent[0].p_workspace.revision,1);assert.equal(sent[1].p_workspace.revision,2);
});

test('chat plan revision guard stops a stale replacement on a Supabase CAS retry',async()=>{
 const issued=await identity();let reads=0,writes=0;
 const initial={version:1,artifacts:[],progress:[],focusSessions:[],roomProgress:{},reviews:{},plan:{tasks:[{id:'original',title:'Keep this task',subject:'General',done:false}]},stats:{xp:0}};
 const concurrentTask={id:'another-tab',title:'Concurrent task',subject:'General',done:false};
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{
  if(url.endsWith('nooks_workspace_read')){reads++;return response({revision:reads===1?4:5,workspace:{...initial,plan:{tasks:reads===1?initial.plan.tasks:[...initial.plan.tasks,concurrentTask]}}});}
  const body=JSON.parse(options.body);writes++;assert.equal(body.p_expected_revision,4);return response({committed:false,revision:5});
 }});
 const engine=new StudyEngine(store);
 await assert.rejects(engine.call('plan_save',{expectedRevision:4,plan:{tasks:[...initial.plan.tasks,{title:'Chat addition'}]}},issued),{code:'REVISION_CONFLICT'});
 assert.equal(reads,2);assert.equal(writes,1); // Reloaded revision is rejected before any second write.
 const current=await engine.call('plan_get',{},issued);
 assert.equal(current.workspaceRevision,5);assert.deepEqual(current.plan.tasks,[...initial.plan.tasks,concurrentTask]);
});

test('database revisions override document/client fields and commits expose the authoritative next revision',async()=>{
 const issued=await identity();let record=null,revision=0;const commits=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,clock:()=>new Date('2026-10-01T00:00:00Z'),fetchImpl:async(url,options)=>{
  if(url.endsWith('nooks_workspace_read'))return response(record?{revision,workspace:{...record,revision:9999}}:null);
  const body=JSON.parse(options.body);commits.push(body);record=structuredClone(body.p_workspace);return response({committed:true,revision:++revision});
 }});
 assert.equal((await store.read(issued.id)).revision,0);
 const first=await store.transact(issued.id,workspace=>{workspace.revision=-50;return {workspace:{revision:123},saved:true};});
 assert.equal(first.workspace.revision,1);assert.equal(first.saved,true);assert.equal(commits[0].p_expected_revision,0);assert.equal(commits[0].p_workspace.revision,1);
 assert.equal((await store.read(issued.id)).revision,1);
 const second=await store.transact(issued.id,workspace=>{workspace.revision=5000;return {};});
 assert.equal(second.workspace.revision,2);assert.equal(commits[1].p_expected_revision,1);assert.equal(commits[1].p_workspace.revision,2);
 assert.equal(first.workspace.updatedAt,second.workspace.updatedAt);
});

test('invalid authoritative database revisions fail before mutation or commit',async()=>{
 const issued=await identity();let called=false;
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async()=>response({revision:-1,workspace:{version:1,artifacts:[]}})});
 await assert.rejects(store.transact(issued.id,()=>{called=true;return {};}),/authoritative workspace revision/);
 assert.equal(called,false);
});

test('share publication is staged with winning commit and private note fields are rejected',async()=>{
 const issued=await identity();const calls=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response(url.endsWith('nooks_workspace_read')?null:{committed:true});}});
 const snapshot={id:'10000000-0000-4000-8000-000000000001',space:{name:'My nook',theme:'botanical'},description:'A shared look'};
 await store.transact(issued.id,async()=>{await store.publishShare(issued.id,snapshot);return {share:snapshot}});
 assert.equal(calls.length,2);assert.equal(calls[1].body.p_share_operations[0].snapshot.description,'A shared look');
 await assert.rejects(store.transact(issued.id,async()=>store.publishShare(issued.id,{...snapshot,artifacts:[{content:'private'}]})),/appearance/);
 assert.equal(calls.length,3);
});

test('packed workspace byte limit fails before any private image upload or commit',async()=>{
 const issued=await identity();const calls=[];const png='data:image/png;base64,iVBORw0KGgo=';
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,maxWorkspaceBytes:200,fetchImpl:async(url,options)=>{calls.push({url,options});return response(url.includes('nooks_workspace_read')?null:{ok:true});}});
 await assert.rejects(store.transact(issued.id,workspace=>{workspace.space={name:'Private room',theme:'botanical',backgroundImage:png};workspace.artifacts=[{content:'x'.repeat(1000)}];return {}}),{code:'STORAGE_FULL'});
 assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('nooks_workspace_read'));
 await assert.rejects(store.unpack({space:{_storedBackground:{path:BOB+'/abc',mime:'image/png'}}}),/Invalid private artwork/);
});

test('all artwork validates before uploads and packed image references count toward the workspace budget',async()=>{
 const issued=await identity(),calls=[],png='data:image/png;base64,iVBORw0KGgo=';
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{calls.push({url,options});return artworkRpc(url,options)??response(url.endsWith('nooks_workspace_read')?null:{committed:true});}});
 await assert.rejects(store.pack({space:{backgroundImage:png},nookCreator:{drafts:[{space:{backgroundImage:'data:image/png;base64,YmFk'}}]}}),/do not match/);
 assert.equal(calls.length,0,'invalid later artwork must not leave an earlier uploaded object');
 // A data URL can exceed the document budget while its stored address fits it.
 const image=`data:image/png;base64,${btoa(atob('iVBORw0KGgo=')+'x'.repeat(6000))}`;
 store.maxWorkspaceBytes=4000;
 const result=await store.transact(issued.id,workspace=>{workspace.space={name:'Packed image',theme:'botanical',backgroundImage:image};return {};});
 assert.equal(result.workspace.space.backgroundImage,image);
 const uploads=calls.filter(call=>call.url.includes('/storage/'));
 assert.equal(uploads.length,1);assert.ok(uploads[0].url.includes(`/nooks-private/${ALICE}/`));
 const commit=JSON.parse(calls.find(call=>call.url.endsWith('nooks_workspace_commit')).options.body);
 assert.equal(commit.p_workspace.space.backgroundImage,undefined);assert.ok(commit.p_workspace.space._storedBackground.path.startsWith(`${ALICE}/`));
});

test('invalid staged share artwork fails before an otherwise valid workspace image uploads',async()=>{
 const issued=await identity(),calls=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{calls.push(url);return response(url.endsWith('nooks_workspace_read')?null:{committed:true});}});
 await assert.rejects(store.transact(issued.id,async workspace=>{
  workspace.space={name:'Private room',backgroundImage:'data:image/png;base64,iVBORw0KGgo='};
  await store.publishShare(issued.id,{id:'10000000-0000-4000-8000-000000000001',space:{backgroundImage:'data:image/png;base64,YmFk'}});
  return {};
 }),/do not match/);
 assert.equal(calls.length,1);assert.ok(calls[0].endsWith('nooks_workspace_read'));
});

test('community actor comes from bound proof; invite token is hashed before RPC',async()=>{
 const issued=await identity();const sent=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{if(!options.body)return response([{account_id:ALICE,display_name:'Saved student',avatar:2}]);sent.push(JSON.parse(options.body));return response({nooks:[]});}});
 await store.community('list_nooks',{actor:BOB,userId:BOB,accountId:BOB});assert.equal(sent[0].p_actor,ALICE);assert.deepEqual(sent[0].p_args,{});
 const token='a'.repeat(64);await store.community('accept_invite',{token});assert.equal(sent[1].p_args.token,undefined);assert.equal(sent[1].p_args.tokenHash,await sha256(token));
 await assert.rejects(store.community('create_nook',{requestId:crypto.randomUUID(),roomId:'invented-scene'}),/scene/);
});

test('unchanged hydrated artwork avoids repeated uploads and verifies its content address',async()=>{
 const issued=await identity(),bytes=Uint8Array.from(atob('iVBORw0KGgo='),c=>c.charCodeAt(0)),hash=await sha256(bytes),calls=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(bytes);}});
 const artwork=await store.unpack({space:{name:'My space',theme:'botanical',_storedBackground:{path:`${ALICE}/${hash}`,mime:'image/png'}}});
 const saved=await store.pack(artwork);assert.equal(saved.space._storedBackground.path,`${ALICE}/${hash}`);assert.equal(calls.length,1);
 const corrupt=await store.unpack({space:{_storedBackground:{path:`${ALICE}/${'a'.repeat(64)}`,mime:'image/png'}}});
 assert.equal(corrupt.artworkWarnings[0].code,'ARTWORK_UNAVAILABLE');assert.equal(corrupt.space.backgroundImage,undefined);assert.equal(corrupt.space._storedBackground.path,`${ALICE}/${'a'.repeat(64)}`);
});

test('creator draft images use private owned Storage rather than database blobs or other-account references',async()=>{
 const issued=await identity(),png='data:image/png;base64,iVBORw0KGgo=',calls=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{calls.push({url,options});return artworkRpc(url,options)??response({ok:true});}});
 const packed=await store.pack({space:{backgroundImage:png},nookCreator:{drafts:[{id:'private-draft',space:{backgroundImage:png}}]},artifacts:[{content:'Do not rewrite backgroundImage text.'}]});
 assert.equal(calls.length,3);assert.ok(calls[1].url.includes(`/nooks-private/${ALICE}/`));assert.equal(calls[1].options.headers['x-upsert'],'false');
 assert.equal(packed.nookCreator.drafts[0].space.backgroundImage,undefined);assert.ok(packed.nookCreator.drafts[0].space._storedBackground.path.startsWith(ALICE+'/'));
 const reopened=await store.unpack(packed);assert.equal(reopened.nookCreator.drafts[0].space.backgroundImage,png);assert.equal(calls.length,3);
 await assert.rejects(store.unpack({nookCreator:{drafts:[{space:{_storedBackground:{path:`${BOB}/${'b'.repeat(64)}`,mime:'image/png'}}}]}}),/Invalid private artwork/);
 assert.equal(reopened.artifacts[0].content,'Do not rewrite backgroundImage text.');
});

test('concurrent engine focus starts and completions recover through CAS without double XP or room credit',async()=>{
 const issued=await identity();let record=null,revision=0,readCount=0,conflicts=0,now=new Date('2026-10-01T00:00:00Z');
 let startReady,completeReady;const startBarrier=new Promise(resolve=>{startReady=resolve}),completeBarrier=new Promise(resolve=>{completeReady=resolve});
 const fake=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('nooks_workspace_read')){
   const snapshot=record?{revision,workspace:structuredClone(record)}:null,index=readCount++;
   if(index===0)await startBarrier;else if(index===1)startReady();
   if(index===3)await completeBarrier;else if(index===4)completeReady();
   return response(snapshot);
  }
  if(body.p_expected_revision!==revision){conflicts++;return response({committed:false,revision});}
  record=structuredClone(body.p_workspace);return response({committed:true,revision:++revision});
 };
 const engine=()=>new StudyEngine(new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:fake,clock:()=>now}),{clock:()=>now});
 const [first,second]=await Promise.all([engine().call('focus_start',{minutes:1},issued),engine().call('focus_start',{minutes:1},issued)]);
 assert.equal(first.focusSession.id,second.focusSession.id);assert.equal(record.focusSessions.length,1);
 now=new Date(now.valueOf()+70_000);
 const [done,retry]=await Promise.all([engine().call('focus_complete',{sessionId:first.focusSession.id},issued),engine().call('focus_complete',{sessionId:first.focusSession.id},issued)]);
 assert.equal(done.focusSession.id,retry.focusSession.id);assert.ok(done.duplicate||retry.duplicate);assert.ok(conflicts>=2);
 assert.equal(record.stats.xp,2);assert.equal(record.stats.focusMinutes,1);assert.equal(record.roomProgress['rainy-library'].focusSeconds,60);assert.equal(record.roomProgress['rainy-library'].sessions,1);
});

test('webhook verification rejects tampering, stale messages, and oversized bodies',async()=>{
 const secret='a'.repeat(40),timestamp='1790880000',eventId='evt_1',rawBody='{"type":"test"}';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${eventId}.${rawBody}`));
 const signature='sha256='+[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const args={secret,timestamp,eventId,signature,rawBody,now:Number(timestamp)*1000};
 assert.equal((await verifySupabaseWebhook(args)).eventId,eventId);
 assert.equal(await verifySupabaseWebhook({...args,rawBody:'{"type":"changed"}'}),null);
 assert.equal(await verifySupabaseWebhook({...args,now:args.now+400000}),null);
 assert.equal(await verifySupabaseWebhook({...args,rawBody:'x'.repeat(131073)}),null);
});

test('outbox lease tokens are passed through and service secret is not a browser token',async()=>{
 const calls=[];const outbox=createSupabaseOutbox({url:origin,serviceKey,fetchImpl:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return response({events:[]});}});
 await outbox.claim();await outbox.acknowledge({id:crypto.randomUUID(),leaseToken:'lease',success:false,error:'retry'});
 assert.equal(calls[1].body.p_lease_token,'lease');assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(calls[0].options.headers.apikey,serviceKey);
});

test('community refresh reads only the bound owner profile and returns a verified UI recovery scope',async()=>{
 const issued=await identity(),calls=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return response(options.body?{nooks:[],hasMore:false}:[{account_id:ALICE,display_name:'My chosen name',avatar:6}]);
 }});
 const result=await store.community('list_nooks',{actor:BOB});
 assert.equal(result.recoveryScope,`account:${ALICE}`);assert.deepEqual(result.profile,{id:ALICE,displayName:'My chosen name',avatar:6});
 const read=calls.find(call=>!call.options.body),url=new URL(read.url);
 assert.equal(url.pathname,'/rest/v1/nooks_profiles');assert.equal(url.searchParams.get('account_id'),`eq.${ALICE}`);assert.equal(url.searchParams.get('limit'),'1');assert.equal(url.searchParams.get('select'),'account_id,display_name,avatar');assert.equal(read.options.redirect,'manual');
});

test('community profile recovery rejects foreign rows, oversized results and failed reads',async()=>{
 const issued=await identity();
 for(const rows of [[{account_id:BOB,display_name:'Other owner',avatar:0}],[],[{account_id:ALICE,display_name:'One',avatar:0},{account_id:ALICE,display_name:'Two',avatar:0}],null]){
  const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>options.body?response({nooks:[]}):rows===null?new Response('',{status:503}):response(rows)});
  await assert.rejects(store.community('list_nooks'),/profile/);
 }
});

test('community recovery scope stays in UI metadata rather than model context',async()=>{
 const {modelSafeResult}=await import('../server/model-result.mjs');
 const issued=await identity();
 const store=new SupabaseStore({url:origin,serviceKey,identity:issued,fetchImpl:async(url,options)=>response(options.body?{nooks:[]}:[{account_id:ALICE,display_name:'Learner',avatar:1}])});
 const data=await store.community('list_nooks'),result=modelSafeResult({structuredContent:data});
 assert.equal(result.structuredContent.recoveryScope,undefined);assert.equal(result._meta.notableData.recoveryScope,`account:${ALICE}`);
 assert.deepEqual(result._meta.notableData.profile,{id:ALICE,displayName:'Learner',avatar:1});
});
