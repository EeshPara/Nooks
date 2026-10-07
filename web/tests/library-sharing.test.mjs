import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeLibrarySharing} from '../server/library-sharing.mjs';
const sid='12345678-1234-4234-8234-123456789012';
const identity={id:'verified-owner'};
test('share publication hashes secret and uses verified actor',async()=>{
 let request;const store={rpc:async(name,args)=>{request={name,args};return {share:{id:sid}};}};
 const result=await invokeLibrarySharing(store,identity,'library_share_create',{kind:'course',targetId:'biology',permission:'view'},'https://nooks-study-space.vercel.app/');
 assert.equal(request.args.p_account,identity.id);assert.match(request.args.p_args.tokenHash,/^[a-f0-9]{64}$/);assert.match(result.share.url,/library-share=/);assert.ok(!result.share.url.includes(request.args.p_args.tokenHash));
});
test('caller cannot supply account or permission through save',async()=>{
 const store={rpc:()=>{throw Error('Unexpected database call');}};
 await assert.rejects(invokeLibrarySharing(store,identity,'library_share_save',{shareId:sid,accountId:'someone',artifact:{}},'https://example.com'),/Unexpected/);
 await assert.rejects(invokeLibrarySharing(store,identity,'library_share_get',{shareId:'invalid'},'https://example.com'),/Invalid/);
});
test('material edit validates complete educational content before database write',async()=>{
 const store={rpc:()=>{throw Error('Unexpected database call');}};
 await assert.rejects(invokeLibrarySharing(store,identity,'library_share_save',{shareId:sid,artifact:{id:'note',kind:'note',title:'Test',content:123},expectedRevision:1},'https://example.com'),/content/);
});
test('join does not transmit raw invitation secret to database',async()=>{
 let args;const store={rpc:async(n,a)=>{args=a;return {};}};
 await invokeLibrarySharing(store,identity,'library_share_join',{shareId:sid,token:'a'.repeat(64)},'https://example.com');
 assert.equal(args.p_args.token,undefined);assert.match(args.p_args.tokenHash,/^[a-f0-9]{64}$/);
});
