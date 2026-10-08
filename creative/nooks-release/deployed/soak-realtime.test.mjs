import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createFixtureRealtimeClient,channelDiagnostic,recordChannelDiagnostic,isAuthorizationDenial} from './soak-realtime.mjs';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const PUBLIC='sb_publishable_fake_fixture',TOKEN='synthetic-fixture-token',url='https://fixture.invalid';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:()=>assert.fail('No network allowed')}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
// Acknowledge the actual SDK channel join without creating a WebSocket or contacting any server.
async function acknowledgeJoin(client,topic){
 client.realtime.isConnected=()=>true;
 const channel=client.channel(topic,{config:{private:true}});
 channel.channelAdapter.subscribe=()=>({receive(status,callback){if(status==='ok')queueMicrotask(()=>callback({}));return this}});
 await new Promise(resolve=>channel.subscribe(status=>{if(status==='SUBSCRIBED')resolve()}));await settle();
}

test('old sessionless-client setup loses fixture token on the SDK join callback refresh',async()=>{
 const client=createClient(url,PUBLIC,options);await client.realtime.setAuth(TOKEN);
 assert.equal(client.realtime.accessTokenValue,TOKEN);assert.equal(client.realtime._isManualToken(),false);
 await acknowledgeJoin(client,'nooks:directory');assert.equal(client.realtime.accessTokenValue,PUBLIC);
});

test('fixture accessToken callback survives actual SDK join refresh and repeated refresh/reconnect calls',async()=>{
 const user={token:TOKEN},client=createFixtureRealtimeClient(createClient,url,PUBLIC,user,options);
 await client.realtime.setAuth(user.token);await acknowledgeJoin(client,'nooks:directory');assert.equal(client.realtime.accessTokenValue,TOKEN);
 await acknowledgeJoin(client,'account:fixture');assert.equal(client.realtime.accessTokenValue,TOKEN);
 await client.realtime.setAuth();await client.realtime.setAuth();assert.equal(client.realtime.accessTokenValue,TOKEN);
 assert.throws(()=>client.auth.getSession(),/accessToken option/); // socket client cannot accidentally run login/refresh
});

test('diagnostics categorize provider failures without exposing message/cause/topic/credentials',()=>{
 const secret='Bearer private-token https://fixture.invalid/private?token=secret';
 for(const [status,error,expected] of [['CHANNEL_ERROR',Error('Unauthorized: permissions '+secret),'authorization'],['CHANNEL_ERROR',Error('Invalid JWT '+secret),'authentication'],['TIMED_OUT',Error(secret),'timeout'],['CLOSED',null,'closed'],['CHANNEL_ERROR',Error('too many connections '+secret),'capacity']]){
  const row=channelDiagnostic({status,error,kind:'own_account',userIndex:0,phase:'diagnostic_join',elapsedMs:10,tokenMatches:true,publicKeyMatches:false});
  assert.equal(row.category,expected);assert.ok(!JSON.stringify(row).includes('private-token'));assert.ok(!JSON.stringify(row).includes('https://'));assert.equal(row.fixtureTokenCurrent,true);
 }
 const report={};for(let i=0;i<100;i++)recordChannelDiagnostic(report,channelDiagnostic({status:'CHANNEL_ERROR',error:Error(secret),kind:secret,phase:secret,userIndex:1000,elapsedMs:Infinity}));
 assert.equal(report.channelDiagnostics.events.length,40);assert.equal(report.channelDiagnostics.failures.length,40);assert.equal(report.channelDiagnostics.suppressedFailures,60);assert.ok(!JSON.stringify(report).includes(secret));
});

test('only recognized authorization denial is expected; denied-topic auth/transport errors remain failures',()=>{
 for(const message of ['Invalid JWT','socket disconnected','unrecognized provider error']){const error=Error(message),report={};assert.equal(isAuthorizationDenial('CHANNEL_ERROR',error),false);recordChannelDiagnostic(report,channelDiagnostic({status:'CHANNEL_ERROR',error,kind:'foreign_room',expectedDenial:isAuthorizationDenial('CHANNEL_ERROR',error),elapsedMs:0}));assert.equal(report.channelDiagnostics.failures.length,1);}
 assert.equal(isAuthorizationDenial('CHANNEL_ERROR',Error('Unauthorized: no permissions')),true);
});
