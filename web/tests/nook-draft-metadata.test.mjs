import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { NookCreator } from '../server/nook-creator.mjs';
import { createSitesIdentityResolver, sha256 } from '../server/supabase-auth.mjs';

const ALICE='00000000-0000-4000-8000-000000000001',BOB='00000000-0000-4000-8000-000000000002';
const DRAFT='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002';
const origin='https://nooks-test.supabase.co',serviceKey='sb_secret_test_only';
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgo=','base64')),image='data:image/png;base64,iVBORw0KGgo=';
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const clock=()=>new Date('2026-10-08T00:00:00Z');
async function fixture({artwork='valid',modify=()=>{}}={}){
 const resolver=createSitesIdentityResolver({url:origin,serviceKey,namespace:'sites:test-project',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>json({id:ALICE})});
 const identity=await resolver({subject:'verified-alice'}),ref={path:`${ALICE}/${await sha256(bytes)}`,mime:'image/png'};
 const draft=id=>({id,title:'Quiet corner',description:'Rest and study',revision:2,style:'illustration',artworkMode:'upload',visibility:'public',scenePrompt:'PRIVATE PROMPT',pathTemplate:'none',space:{room:'rainy-library',theme:'botanical',_storedBackground:ref},createdAt:clock().toISOString(),updatedAt:clock().toISOString()});
 const record={revision:7,workspace:{version:1,revision:999,space:{_storedBackground:ref},artifacts:[],plan:{tasks:[]},nookCreator:{schemaVersion:1,drafts:[draft(DRAFT),draft(OTHER)],publicationIntents:[{id:OTHER,draftId:DRAFT,draftRevision:1,status:'published',visibility:'public',nookId:BOB,createdAt:clock().toISOString()}]}}};
 modify(record);const calls=[],warnings=[],commits=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity,clock,onArtworkUnavailable:value=>warnings.push(value),fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('nooks_workspace_read')){assert.equal(JSON.parse(options.body).p_account,ALICE);return json(record);}
  if(url.endsWith('nooks_workspace_commit')){commits.push(JSON.parse(options.body));return json({committed:true});}
  if(url.includes('/storage/v1/object/authenticated/nooks-private/')){
   if(artwork==='missing')return new Response('Object not found',{status:404});
   if(artwork==='corrupt')return new Response('wrong bytes');
   return new Response(bytes);
  }
  assert.fail(`Unexpected fixture request: ${url}`);
 }});
 return {identity,store,record,calls,warnings,commits,creator:new NookCreator(store,{clock}),storageCalls:()=>calls.filter(call=>call.url.includes('/storage/'))};
}

for(const artwork of ['valid','missing','corrupt'])test(`list preserves hydrated output for ${artwork} duplicate artwork without fetching pixels`,async()=>{
 const metadata=await fixture({artwork}),baseline=await fixture({artwork});
 const hydratedCreator=new NookCreator({read:id=>baseline.store.read(id)},{clock});
 const expected=await hydratedCreator.call('nook_drafts_list',{},baseline.identity);
 const actual=await metadata.creator.call('nook_drafts_list',{hydrateArtwork:true},metadata.identity);
 assert.deepEqual(actual,expected);assert.equal(metadata.calls.length,1);assert.equal(metadata.storageCalls().length,0);
 assert.equal(baseline.storageCalls().length,1,'full read still deduplicates three appearances');
 assert.deepEqual(metadata.warnings,[]);assert.equal(baseline.warnings.length,artwork==='valid'?0:1);
 assert.equal(actual.drafts[0].roomId,'custom');assert.equal(actual.drafts[0].hasArtwork,true);assert.equal(actual.recoveryScope,`account:${ALICE}`);
 const serialized=JSON.stringify(actual);assert.doesNotMatch(serialized,/data:image|_storedBackground|PRIVATE PROMPT/);assert.ok(!serialized.includes(metadata.record.workspace.space._storedBackground.path));
 assert.deepEqual(metadata.record.workspace.nookCreator.drafts[0].space,baseline.record.workspace.nookCreator.drafts[0].space,'reads do not clear stored references');
});

test('metadata lists validate every appearance reference before returning any draft',async()=>{
 for(const location of ['workspace','other-draft'])for(const bad of [{path:`${BOB}/${'a'.repeat(64)}`,mime:'image/png'},{path:`${ALICE}/invalid`,mime:'image/png'},{path:`${ALICE}/${'a'.repeat(64)}`,mime:'image/svg+xml'}]){
  const f=await fixture({modify:record=>{const space=location==='workspace'?record.workspace.space:record.workspace.nookCreator.drafts[1].space;space._storedBackground=bad;}});
  await assert.rejects(f.creator.call('nook_drafts_list',{},f.identity),/Invalid private artwork reference/);assert.equal(f.storageCalls().length,0);
 }
});

test('metadata mode preserves verified identity, account binding and read-scope enforcement',async()=>{
 assert.throws(()=>new SupabaseStore({url:origin,serviceKey,identity:{id:ALICE,scopes:['notable.read']}}),/verified/);
 const f=await fixture();await assert.rejects(f.store.read(BOB,{hydrateArtwork:false}),{code:'FORBIDDEN'});
 await assert.rejects(f.creator.call('nook_drafts_list',{},null),{code:'AUTH_REQUIRED'});
 await assert.rejects(f.creator.call('nook_drafts_list',{}, {...f.identity,scopes:['notable.write']}),{code:'INSUFFICIENT_SCOPE'});
 assert.equal(f.calls.length,0);
});

test('metadata reads enforce authoritative revisions and preserve empty/invalid creator states',async()=>{
 for(const revision of [-1,1.5,'7',null]){
  const f=await fixture({modify:record=>record.revision=revision});await assert.rejects(f.creator.call('nook_drafts_list',{},f.identity),/authoritative workspace revision/);assert.equal(f.storageCalls().length,0);
 }
 const f=await fixture();assert.equal((await f.store.read(ALICE,{hydrateArtwork:false})).revision,7);
 const empty=await fixture({modify:record=>{delete record.workspace;}});assert.deepEqual((await empty.creator.call('nook_drafts_list',{},empty.identity)).drafts,[]);
 const malformed=await fixture({modify:record=>record.workspace.nookCreator={schemaVersion:2}});await assert.rejects(malformed.creator.call('nook_drafts_list',{},malformed.identity),{code:'STORAGE_INVALID'});
});

for(const tool of ['nook_draft_get','nook_draft_preview'])test(`${tool} still hydrates even when caller asks to disable artwork`,async()=>{
 const f=await fixture();const result=await f.creator.call(tool,{draftId:DRAFT,hydrateArtwork:false},f.identity);
 assert.equal(result.draft.space.backgroundImage,image);assert.equal(f.storageCalls().length,1);
});

test('metadata then full read on one store still hydrates, and later lists never expose cached pixels',async()=>{
 const f=await fixture();const before=await f.creator.call('nook_drafts_list',{},f.identity);
 assert.equal(f.storageCalls().length,0);assert.equal(f.store.hydratedImages.size,0);
 const full=await f.store.read(ALICE);assert.equal(full.space.backgroundImage,image);assert.equal(f.storageCalls().length,1);
 assert.deepEqual(await f.creator.call('nook_drafts_list',{},f.identity),before);assert.equal(f.storageCalls().length,1);
});

test('default full read still warns and preserves missing artwork, while writes hydrate before mutation',async()=>{
 const missing=await fixture({artwork:'missing'});const result=await missing.store.read(ALICE);
 assert.equal(result.artworkWarnings[0].code,'ARTWORK_UNAVAILABLE');assert.equal(result.space.backgroundImage,undefined);assert.equal(result.space._storedBackground.path,missing.record.workspace.space._storedBackground.path);
 const writing=await fixture();await writing.store.transact(ALICE,workspace=>{assert.equal(workspace.nookCreator.drafts[0].space.backgroundImage,image);workspace.nookCreator.drafts[0].title='Updated';return{saved:true};});
 assert.equal(writing.storageCalls().length,1);assert.equal(writing.commits.length,1);assert.equal(writing.commits[0].p_expected_revision,7);assert.equal(writing.commits[0].p_workspace.nookCreator.drafts[0].title,'Updated');
 assert.equal(writing.commits[0].p_workspace.nookCreator.drafts[0].space.backgroundImage,undefined);assert.equal(writing.commits[0].p_workspace.nookCreator.drafts[0].space._storedBackground.path,writing.record.workspace.space._storedBackground.path);
});
