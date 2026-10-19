/** Exercise the actual prepared cleanup function with an in-memory SDK; never execute the harness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SOAK,assert as check} from './soak-control.mjs';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function cleanup(){'),source.indexOf("\nfor(const sig of ['SIGINT','SIGTERM'])"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('users','rooms','admin','report','journal','runId','SOAK','assert',"let cleanupMode=false,phase,cleanupDeadline;const pending=new Set(),background=new Set();const disconnect=async()=>{};const safeCode=e=>e.message;"+code+';await cleanup();');
function fixture({revokeFails=false,accountDeleteFails=false,lookupFails=false,wrongOwner=false,contradictoryAccount=false}={}){
 const user={id:'fixture-auth',email:'fixture@example.invalid',account:'fixture-account',creation:'confirmed',index:0,token:'memory-only'};
 const room={id:'fixture-room',index:0,owner:user,requestId:'fixture-request'};const calls=[];
 let authPresent=true,accountPresent=true,roomPresent=true,accountAuth=user.id;
 const admin={auth:{admin:{
  async getUserById(id){assert.equal(id,user.id);return authPresent?{data:{user:{id,email:wrongOwner?'unrelated@example.invalid':user.email,app_metadata:{nooks_qa_run:'fixture-run'}}}}:{error:{status:404},data:{user:null}}},
  async signOut(token,scope){assert.equal(token,user.token);assert.equal(scope,'global');calls.push('revoke');return revokeFails?{error:{status:401}}:{}},
  async deleteUser(id){assert.equal(id,user.id);calls.push('auth_delete');authPresent=false;accountAuth=null;return {}},
 }},from(table){const filters={};let op='select';return {
  select(){return this},delete(){op='delete';return this},eq(key,value){filters[key]=value;return this},limit(){return this},retry(value){assert.equal(value,false);return this},
  then(resolve){
   if(table==='nooks_rooms'){
    assert.equal(filters.owner_id,user.account);assert.equal(filters.request_id,room.requestId);
    if(op==='delete'){assert.equal(filters.id,room.id);calls.push('room_delete');roomPresent=false;return Promise.resolve({data:[],error:null}).then(resolve);}
    return Promise.resolve({data:roomPresent?[{id:room.id,owner_id:user.account,request_id:room.requestId,visibility:'private'}]:[],error:null}).then(resolve);
   }
   assert.equal(table,'nooks_accounts');assert.ok(filters.auth_user_id===user.id||filters.id===user.account);
   if(op==='delete'){assert.equal(filters.id,user.account);assert.equal(filters.auth_user_id,user.id);calls.push('account_delete');if(accountDeleteFails)return Promise.resolve({error:{status:503}}).then(resolve);accountPresent=false;return Promise.resolve({data:[],error:null}).then(resolve);}
   if(lookupFails&&filters.auth_user_id)return Promise.resolve({error:{status:503}}).then(resolve);
   if(contradictoryAccount&&filters.auth_user_id)return Promise.resolve({data:[{id:'unexpected-account'}],error:null}).then(resolve);
   const matches=accountPresent&&(filters.id===user.account||filters.auth_user_id===accountAuth);
   return Promise.resolve({data:matches?[{id:user.account}]:[],error:null}).then(resolve);
  },
 }} };
 return {user,room,admin,calls,get remaining(){return {authPresent,accountPresent,roomPresent}}};
}

test('persistent checkpoint failure does not stop exact scoped room/account/Auth cleanup',async()=>{
 const f=fixture(),report={cleanup:[]};let attempts=0;
 await execute([f.user],[f.room],f.admin,report,async()=>{attempts++;throw Error('disk_failed')},'fixture-run',SOAK,check);
 assert.ok(attempts>=4);assert.equal(report.journalFailed,true);assert.deepEqual(f.remaining,{authPresent:false,accountPresent:false,roomPresent:false});assert.equal(report.cleanupVerification.allAbsent,true);
 assert.deepEqual(f.calls,['room_delete','revoke','account_delete','auth_delete']);
});

test('revoke failure is recorded but cannot prevent guarded account/Auth deletion and absence checks',async()=>{
 const f=fixture({revokeFails:true}),report={cleanup:[]};
 await execute([f.user],[f.room],f.admin,report,async()=>{},'fixture-run',SOAK,check);
 assert.ok(report.cleanup.some(row=>row.type==='session'&&!row.ok));assert.equal(report.cleanupVerification.allAbsent,true);assert.deepEqual(f.remaining,{authPresent:false,accountPresent:false,roomPresent:false});
});

test('account delete failure cannot hide an orphan after Auth deletion sets its link NULL',async()=>{
 const f=fixture({accountDeleteFails:true}),report={cleanup:[]};
 await execute([f.user],[f.room],f.admin,report,async()=>{},'fixture-run',SOAK,check);
 assert.equal(f.remaining.authPresent,false);assert.equal(f.remaining.accountPresent,true);assert.equal(report.cleanupVerification.allAbsent,false);assert.ok(report.cleanup.some(row=>row.type==='account_absent'&&!row.ok));
});

test('unknown account after failed lookup preserves Auth link for exact recovery',async()=>{
 const f=fixture({lookupFails:true}),report={cleanup:[]};f.user.account=undefined;
 await execute([f.user],[],f.admin,report,async()=>{},'fixture-run',SOAK,check);
 assert.equal(f.remaining.authPresent,true);assert.ok(!f.calls.includes('auth_delete'));assert.ok(report.cleanup.some(row=>row.code==='cleanup_auth_withheld_unknown_account'));assert.equal(report.cleanupVerification.allAbsent,false);
});

test('mismatched Auth marker/email prevents identity or account mutations',async()=>{
 const f=fixture({wrongOwner:true}),report={cleanup:[]};
 await execute([f.user],[],f.admin,report,async()=>{},'fixture-run',SOAK,check);
 assert.deepEqual(f.calls,[]);assert.equal(f.remaining.authPresent,true);assert.equal(report.cleanupVerification.allAbsent,false);
});


test('contradictory account mapping withholds Auth deletion rather than orphaning an unknown row',async()=>{
 const f=fixture({contradictoryAccount:true}),report={cleanup:[]};
 await execute([f.user],[],f.admin,report,async()=>{},'fixture-run',SOAK,check);
 assert.equal(f.remaining.authPresent,true);assert.ok(!f.calls.includes('auth_delete'));assert.ok(!f.calls.includes('account_delete'));
 assert.ok(report.cleanup.some(row=>row.code==='cleanup_auth_withheld_contradiction'));assert.equal(report.cleanupVerification.allAbsent,false);
});
