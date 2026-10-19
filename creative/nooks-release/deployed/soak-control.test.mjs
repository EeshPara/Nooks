import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpGate,readBounded,checkSnapshot,statistics,SOAK,runSettledBatch} from './soak-control.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('public starts include probes/negative checks; cap leaves a separate paced cleanup budget',async()=>{
 let time=0;const gate=createHttpGate({minGapMs:250,caps:{public:3,admin:1,cleanup:2},now:()=>time,wait:async ms=>{time+=ms}});
 for(let i=0;i<3;i++)await gate.run('public',async()=>{});
 await assert.rejects(gate.run('public',async()=>assert.fail('Cap must stop transport')),/http_cap_reached/);
 await gate.run('cleanup',async()=>{});assert.deepEqual(gate.counts,{public:3,admin:0,cleanup:1});
 assert.ok(gate.starts.slice(1).every((row,i)=>row.at-gate.starts[i].at>=250));
});

test('eight active slots remain occupied through body consumption, without a ninth fetch start',async()=>{
 const release=deferred(),entered=deferred();let calls=0;
 const gate=createHttpGate({minGapMs:0,maxActive:8});
 const tasks=Array.from({length:9},()=>gate.run('public',async()=>{calls++;if(calls===8)entered.resolve();await release.promise;}));
 await entered.promise;await tick();assert.equal(calls,8);assert.equal(gate.active,8);release.resolve();await Promise.all(tasks);assert.equal(calls,9);assert.equal(gate.peak,8);
});

test('body rejection releases slot; oversized response is cancelled',async()=>{
 const gate=createHttpGate({minGapMs:0,maxActive:1});let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5));},cancel(){cancelled=true}});
 await assert.rejects(gate.run('public',()=>readBounded(new Response(stream),4)),/response_too_large/);
 assert.equal(cancelled,true);assert.equal(gate.active,0);await gate.run('public',async()=>{});
});

test('circuit breaker rejects queued work while allowing guarded cleanup',async()=>{
 let stopped=false;const gate=createHttpGate({minGapMs:0,check:bucket=>{if(stopped&&bucket!=='cleanup')throw Error('stopped')}});
 stopped=true;await assert.rejects(gate.run('public',async()=>assert.fail()),/stopped/);
 await gate.run('cleanup',async()=>{});assert.equal(gate.counts.public,0);assert.equal(gate.counts.cleanup,1);
});

test('rate gate never catches up after delayed scheduling',async()=>{
 let now=0;const gate=createHttpGate({now:()=>now,wait:async ms=>{now+=ms}});
 await gate.run('public',async()=>{});now+=10000;
 await Promise.all([gate.run('public',async()=>{}),gate.run('public',async()=>{})]);
 assert.deepEqual(gate.starts.map(row=>row.at),[0,10000,10250]);
});

test('room validation rejects foreign members, missing membership, false focus credit and offline presence',()=>{
 const room={id:'room',members:Array.from({length:20},(_,i)=>({account:`fixture-${i}`}))};
 const body={nook:{id:'room'},memberCount:20,onlineCount:20,members:room.members.map(u=>({id:u.account,online:true,focusMinutes:0})),leaderboard:room.members.map(u=>({id:u.account,focusMinutes:0}))};
 checkSnapshot(body,room,{online:true});
 for(const mutate of [value=>value.members[0].id='foreign',value=>value.members.pop(),value=>value.members[0].focusMinutes=1,value=>value.onlineCount=19]){
  const copy=structuredClone(body);mutate(copy);assert.throws(()=>checkSnapshot(copy,room,{online:true}));
 }
});

test('expected 403s are counted separately from unexpected errors',()=>{
 const rows=[{ok:true,expectedDenial:true,durationMs:100},{ok:false,durationMs:200},{ok:true,durationMs:50}];
 assert.deepEqual(statistics(rows),{requests:3,unexpectedErrors:1,expectedDenials:1,p50Ms:100,p95Ms:200,p99Ms:200,maxMs:200});
 assert.equal(SOAK.publicCap,4200);assert.equal(SOAK.cleanupCap,800);
});

test('plateau reserve rejects further work while leaving final checks and cleanup available',async()=>{
 let phase='setup';let gate;
 gate=createHttpGate({minGapMs:0,caps:{public:6,admin:1,cleanup:1},check:bucket=>{if(bucket==='public'&&phase==='plateau'&&gate.counts.public>=4)throw Error('final_check_reserve_reached')}});
 await gate.run('public',async()=>{});phase='plateau';
 for(let i=0;i<3;i++)await gate.run('public',async()=>{});
 await assert.rejects(gate.run('public',async()=>assert.fail()),/final_check_reserve_reached/);
 phase='final_checks';for(let i=0;i<2;i++)await gate.run('public',async()=>{});await gate.run('cleanup',async()=>{});
 assert.equal(gate.counts.public,6);assert.equal(gate.counts.cleanup,1);
});

test('failed connection batch stops promptly but delayed siblings settle before cleanup can start',async()=>{
 const release=deferred(),entered=deferred();let stopped=false,settled=false,siblingFinished=false;
 const batch=runSettledBatch([0,1],async index=>{if(index===0)throw Error('connection_failed');entered.resolve();await release.promise;siblingFinished=true;},()=>{stopped=true}).finally(()=>{settled=true});
 const rejection=assert.rejects(batch,/connection_failed/);await entered.promise;await tick();
 assert.equal(stopped,true);assert.equal(settled,false);assert.equal(siblingFinished,false);
 release.resolve();await rejection;assert.equal(siblingFinished,true);assert.equal(settled,true);
});

test('password-grant not-before pacing occurs at actual gate admission and preserves overall spacing',async()=>{
 let time=0;const gate=createHttpGate({now:()=>time,wait:async ms=>{time+=ms}});let lastGrant;
 await gate.run('admin',async at=>{lastGrant=at});time+=100;
 await gate.run('admin',async()=>{});
 await gate.run('admin',async at=>{assert.ok(at-lastGrant>=2500);lastGrant=at},{notBefore:lastGrant+2500});
 await gate.run('public',async()=>{});
 assert.ok(gate.starts.slice(1).every((row,index)=>row.at-gate.starts[index].at>=250));
});
