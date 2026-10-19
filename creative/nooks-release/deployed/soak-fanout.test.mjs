/** Injected clock/transport evaluation of the prepared fanout function, no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assert as check,statistics} from './soak-control.mjs';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function fanout(label){'),source.indexOf('\nasync function reconnect('));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('users','rooms','report','pending','performance','sleep','fakeApi','assert','statistics',"let quietMutations=false,quietUntil=Infinity,profileRound=0;const phase='plateau',guard=()=>{};const api=(...args)=>{assert(quietMutations,'mutation_pause_required');return fakeApi(...args)};"+code+";await fanout('fixture');return quietMutations;");
function setup(){let time=10000;const users=Array.from({length:100},(_,index)=>({index,roomIndex:Math.floor(index/20),connected:true,hints:0,lastHint:0,lastHeartbeat:0}));const rooms=Array.from({length:5},(_,index)=>({index,members:users.filter(u=>u.roomIndex===index)}));for(const room of rooms)room.owner=room.members[0];const report={fanout:[]};return {users,rooms,report,clock:{now:()=>time},sleep:async ms=>{time+=ms},advance:ms=>{time+=ms},api:async owner=>{time+=100;for(const u of rooms[owner.roomIndex].members){u.hints++;u.lastHint=time;}}};}

test('controlled room hints are measured only while mutations are paused and include settling time',async()=>{
 const f=setup();const quiet=await execute(f.users,f.rooms,f.report,new Set(),f.clock,f.sleep,f.api,check,statistics);
 assert.equal(quiet,false);assert.equal(f.report.fanout.length,5);assert.ok(f.report.fanout.every(row=>row.received===20&&row.foreignRoomHints===0));assert.ok(f.report.mutationQuietWindows[0].durationMs>=4000);
});

test('deadline includes pending-write drain, not only the later observation window',async()=>{
 const f=setup(),pending=new Set([Promise.resolve().then(()=>f.advance(16000))]);
 await assert.rejects(execute(f.users,f.rooms,f.report,pending,f.clock,f.sleep,f.api,check,statistics),/fanout_quiet_deadline/);
 assert.equal(f.report.fanout.length,0);
});

test('unattributable other-room hints fail as inconclusive rather than an asserted security leak',async()=>{
 const f=setup();const api=async owner=>{await f.api(owner);f.users[20].hints++;};
 await assert.rejects(execute(f.users,f.rooms,f.report,new Set(),f.clock,f.sleep,api,check,statistics),/room_hint_attribution_inconclusive/);
 assert.equal(f.report.fanout[0].inconclusive,true);assert.equal(f.report.fanout[0].otherRoomHints,1);
});
