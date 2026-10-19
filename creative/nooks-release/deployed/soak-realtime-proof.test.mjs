import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assert as check} from './soak-control.mjs';
import {channelDiagnostic,recordChannelDiagnostic,isAuthorizationDenial} from './soak-realtime.mjs';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const subscribeSource=source.slice(source.indexOf('async function subscribe('),source.indexOf('async function removeChannel('));

test('denied room broadcast aborts even when fixture roomIndex equals the foreign room',async()=>{
 let broadcast,reason;const report={};const channel={on(_event,_filter,callback){broadcast=callback;return this;},subscribe(callback){callback('CHANNEL_ERROR',new Error('Unauthorized'));return this;}};
 const user={index:1,roomIndex:0,account:'b',token:'fake',channels:[],hints:0,client:{channel:()=>channel,realtime:{accessTokenValue:'fake'}}};
 const run=new AsyncFunction('user','report','stop','channelDiagnostic','recordChannelDiagnostic','isAuthorizationDenial',`const guard=()=>{},markChannels=()=>{},rooms=[{id:'room-a'}],phase='diagnostic_join',started=performance.now(),publicKey='public',cleanupMode=false;${subscribeSource};return subscribe(user,'nook:room-a',{deny:true});`);
 await run(user,report,value=>{reason=value},channelDiagnostic,recordChannelDiagnostic,isAuthorizationDenial);
 broadcast({payload:{v:1}});assert.equal(reason,'foreign_room_broadcast');assert.equal(user.hints,0);assert.equal(report.channelDiagnostics.failures.length,0);
});

const proofSource=source.slice(source.indexOf('async function realtimeProof(){'),source.indexOf('async function cleanup(){'));
async function proof({missingHeartbeat=false,tokenChanged=false}={}){
 const state={now:0,calls:[],joins:[],connections:[],report:{negativeChecks:[],releaseStart:{id:'same'}}};
 const users=[0,1].map(index=>({index,account:`account-${index}`,token:`fake-${index}`,hints:0,roomIndex:0}));
 const socket=user=>({realtime:{accessTokenValue:user.token,onHeartbeat(cb){this.heartbeat=cb;},async setAuth(token){this.accessTokenValue=token;}}});
 const deps={users,rooms:[],report:state.report,assert:check,randomUUID:()=> '00000000-0000-0000-0000-000000000000',journal:async()=>{},runId:'local-only',SOAK:{sockets:2,durationMs:35000},DB:'https://fixture.invalid',publicKey:'fake-public',clientOptions:{},createClient:()=>{},createFixtureRealtimeClient:(_c,_d,_k,u)=>socket(u),guard:()=>{},stop:code=>{throw Error(code)},performance:{now:()=>state.now},releaseIdentity:async()=>({id:'same'}),subscribe:async(u,topic,options)=>{state.joins.push({user:u.index,topic,deny:options?.deny??false});return {};},removeChannel:async()=>{},disconnect:async u=>{state.connections.push(['disconnect',u.index]);},connect:async u=>{state.connections.push(['connect',u.index]);u.client??=socket(u);u.socketHeartbeats??={sent:0,ok:0};},api:async(u,tool,args,expected)=>{state.calls.push({user:u.index,tool,args,expected});if(tool==='nook_create')return {nook:{id:'11111111-1111-1111-1111-111111111111'}};if(tool==='nook_snapshot'&&expected!==403)return {nook:{id:'11111111-1111-1111-1111-111111111111'},memberCount:1,members:[{id:'account-0',focusMinutes:0}]};if(tool==='profile_update'){u.hints++;u.lastHint=state.now;}return {};},sleep:async ms=>{state.now+=ms;if(state.now===25000){for(const u of users){if(!missingHeartbeat){u.socketHeartbeats.sent++;u.socketHeartbeats.ok++;}if(tokenChanged)u.client.realtime.accessTokenValue='fake-public';}}}};
 const run=new AsyncFunction(...Object.keys(deps),`let phase, socketCount=1,peakSockets=1,abortReason=null;${proofSource};await realtimeProof();`);
 await run(...Object.values(deps));return state;
}
test('diagnostic checks one private owner, denial, real interval requirement and one owner reconnect',async()=>{
 const state=await proof();assert.equal(state.report.passed,true);assert.equal(state.report.heartbeatProof.observedMs,35000);
 assert.deepEqual(state.connections,[['connect',0],['disconnect',0],['connect',0]]);
 assert.equal(state.calls.filter(x=>x.tool==='nook_create').length,1);assert.equal(state.calls.find(x=>x.user===1).expected,403);assert.equal(state.joins.at(-1).deny,true);assert.equal(state.report.finalIntegrity.privateRoomMembers,1);
});
test('elapsed interval alone cannot pass without heartbeat acknowledgements',async()=>{await assert.rejects(proof({missingHeartbeat:true}),/heartbeat_token_not_retained/);});
test('heartbeat acknowledgements cannot pass when fixture JWT was replaced',async()=>{await assert.rejects(proof({tokenChanged:true}),/heartbeat_token_not_retained/);});
test('diagnostic mode preserves small hard resource caps and explicit execution guard',()=>{
 assert.match(source,/users:2,rooms:1,membersPerRoom:1,sockets:2,channels:6,durationMs:35000,publicCap:40,adminCap:6,cleanupCap:30,maxActive:2,cleanupDeadlineMs:180000/);
 assert.match(source,/process\.argv\.length!==3/);assert.match(source,/diagnostic\?180000:30\*60\*1000/);
});
