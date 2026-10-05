import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../server/supabase-store.mjs';
import { createSitesIdentityResolver } from '../server/supabase-auth.mjs';
import { communityTools } from '../server/community-tools.mjs';
const account='00000000-0000-4000-8000-000000000001', nookId='00000000-0000-4000-8000-000000000002';
test('privacy writes bind the verified actor and reject invalid settings before RPC',async()=>{
 const url='https://nooks-test.supabase.co',serviceKey='sb_secret_test';
 const identity=await createSitesIdentityResolver({url,serviceKey,namespace:'sites:test',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>new Response(JSON.stringify({id:account}))})({subject:'verified-user'});
 const calls=[];
 const store=new SupabaseStore({url,serviceKey,identity,fetchImpl:async(endpoint,options)=>{calls.push({endpoint,body:JSON.parse(options.body)});return new Response(JSON.stringify({nook:{id:nookId,visibility:'private',role:'owner'}}));}});
 for(const args of [{nookId,visibility:'hidden'},{nookId,visibility:null},{nookId:'invalid',visibility:'private'},{nookId,visibility:'private',owner_id:account}]) await assert.rejects(store.community('set_visibility',args),{code:'INVALID_INPUT'});
 assert.equal(calls.length,0);
 const result=await store.community('set_visibility',{nookId,visibility:'private',actor:'spoofed'});
 assert.equal(calls[0].endpoint,`${url}/rest/v1/rpc/nooks_set_visibility`);
 assert.deepEqual(calls[0].body,{p_actor:account,p_nook_id:nookId,p_visibility:'private'});
 assert.equal(result.recoveryScope,`account:${account}`);
 assert.equal(communityTools.find(t=>t.name==='nook_visibility_update').annotations.readOnlyHint,false);
});
