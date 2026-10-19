/** Actual extracted scheduler/fanout and request code with a deterministic event-loop clock. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assert as check,statistics,createHttpGate,SOAK} from './soak-control.mjs';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const fanoutCode=source.slice(source.indexOf('async function fanout(label){'),source.indexOf('\nasync function reconnect('));
const schedulerCode=source.slice(source.indexOf('  if(pending.size<(quietMutations?1:SOAK.maxActive)){'),source.indexOf('  // No catch-up burst'));
function clock(){
 let at=0,id=0;const timers=[];let ended=false,error,result;
 const now=()=>at,wait=ms=>new Promise(resolve=>timers.push({at:at+ms,id:id++,resolve}));
 return {now,wait,async run(task){task.then(value=>{ended=true;result=value},cause=>{ended=true;error=cause});for(let step=0;step<20000&&!ended;step++){
  for(let i=0;i<100;i++)await Promise.resolve();if(ended)break;
  timers.sort((a,b)=>a.at-b.at||a.id-b.id);assert.ok(timers.length,'virtual task must have a wakeup');const next=timers.shift();at=next.at;next.resolve();
 }assert.ok(ended,'virtual run bound');if(error)throw error;return result;}};
}
async function simulation({legacy=false,lastHeartbeat=0,readMs=300}={}){
 const time=clock(),users=Array.from({length:100},(_,index)=>({index,roomIndex:Math.floor(index/20),connected:true,hints:0,lastHint:0,lastHeartbeat,heartbeatPending:false}));
 const rooms=Array.from({length:5},(_,index)=>({index,members:users.filter(u=>u.roomIndex===index)}));for(const room of rooms)room.owner=room.members[0];
 const report={fanout:[]},pending=new Set(),gate=createHttpGate({now:time.now,wait:time.wait});const calls=[];
 const deps={users,rooms,report,pending,gate,SOAK,performance:{now:time.now},sleep:time.wait,assert:check,statistics,calls,readMs};
 const scheduler=legacy?schedulerCode.replace('(quietMutations?1:SOAK.maxActive)','SOAK.maxActive'):schedulerCode;
 const measuredFanout=legacy?fanoutCode.replace('performance.now()-settlingStart<2100||',''):fanoutCode;
 const run=new AsyncFunction(...Object.keys(deps),`
 let quietMutations=false,quietUntil=Infinity,profileRound=0,snapshotCursor=0,abortReason=null,done=false;const phase='plateau';
 const guard=()=>{assert(!abortReason,abortReason??'stopped')};
 function launch(work){const task=Promise.resolve().then(work).catch(error=>{abortReason??=error.message}).finally(()=>pending.delete(task));pending.add(task);return task;}
 const api=(owner,tool)=>{const queued=performance.now();return gate.run('public',async admitted=>{
  const budget=tool==='profile_update'?quietUntil-admitted:15000;calls.push({tool,queued,admitted,budget});
  const duration=tool==='profile_update'?300:readMs;
  if(budget<=duration){await sleep(Math.max(0,budget));throw Error('fanout_quiet_deadline');}
  await sleep(duration);if(tool==='profile_update')for(const user of rooms[owner.roomIndex].members){user.hints++;user.lastHint=performance.now();}
 });};
 const snapshot=user=>api(user,'nook_snapshot'),heartbeat=()=>{throw Error('heartbeat_must_pause')};
 ${measuredFanout}
 for(let i=0;i<8;i++)launch(()=>snapshot(users[i]));
 const scheduled=(async()=>{while(!done){const now=performance.now();${scheduler};await sleep(250);}})();
 let failure;try{await fanout('saturated');}catch(error){failure=error.message;}finally{done=true;await scheduled;await Promise.allSettled([...pending]);}
 // Cleanup remains admitted independently of measurement failure.
 await gate.run('cleanup',async()=>{});
 return {failure,calls,report,quietMutations,gate:{counts:gate.counts,starts:gate.starts,peak:gate.peak},heartbeatAge:Math.max(...users.map(u=>performance.now()-u.lastHeartbeat))};
 `);
 return time.run(run(...Object.values(deps)));
}

test('saturated FIFO reproduces old full-five-room quiet deadline without a slow server',async()=>{
 const state=await simulation({legacy:true});assert.equal(state.failure,'fanout_quiet_deadline');assert.equal(state.quietMutations,false);assert.equal(state.gate.counts.cleanup,1);assert.ok(state.report.fanout.length<5);
});
test('one outstanding quiet read lets all five controlled writes pass unchanged rate/deadline bounds',async()=>{
 const state=await simulation();assert.equal(state.failure,undefined);assert.equal(state.report.fanout.length,5);assert.ok(state.report.fanout.every(r=>r.received===20));
 const writes=state.calls.filter(x=>x.tool==='profile_update');assert.equal(writes.length,5);assert.ok(writes.every(x=>x.admitted-x.queued<=500));
 assert.ok(state.report.mutationQuietWindows[0].durationMs<15000);assert.ok(state.heartbeatAge<70000);assert.equal(state.quietMutations,false);
 assert.ok(state.calls.some(x=>x.tool==='nook_snapshot'&&x.admitted>writes[0].admitted&&x.admitted<writes.at(-1).admitted));
 assert.ok(state.gate.starts.slice(1).every((x,i)=>x.at-state.gate.starts[i].at>=250));assert.ok(state.gate.peak<=8);assert.equal(state.gate.counts.cleanup,1);
 // All drained requests finish by2050ms; the first write must wait beyond the actual2s throttle.
 assert.ok(writes[0].admitted>=4150);
});
test('post-settling heartbeat margin prevents writes and still releases quiet mode/cleanup',async()=>{
 const state=await simulation({lastHeartbeat:-52000});assert.equal(state.failure,'fanout_heartbeat_margin');assert.equal(state.calls.filter(x=>x.tool==='profile_update').length,0);assert.equal(state.quietMutations,false);assert.equal(state.gate.counts.cleanup,1);
});

const requestCode=source.slice(source.indexOf('async function publicRequest('),source.indexOf('\nconst api='));
async function request({quiet=true,delay=500,timeout=false,networkFailure=false}={}){
 let now=100;const samples=[],report={},observed={};const deps={samples,report,performance:{now:()=>now},assert:check,gate:{run:async(_bucket,task)=>{now+=delay;return task(now)}},AbortSignal:{timeout:ms=>{observed.timeoutMs=ms;return {aborted:timeout,reason:timeout?{name:'TimeoutError'}:undefined}}},fetch:async()=>{observed.fetches=(observed.fetches??0)+1;now+=20;if(timeout||networkFailure)throw Error('private provider message');return {status:200,headers:{get:()=>null}}},readBounded:async()=>'{"ok":true}',quiet};
 const run=new AsyncFunction(...Object.keys(deps),`const phase='plateau',started=0,PUBLIC='https://fixture.invalid',quietMutations=quiet,quietUntil=1000;let stopped;const safeCode=error=>/^[a-z0-9_]{1,80}$/.test(error?.message??'')?error.message:'operation_failed',stop=code=>{stopped=code};${requestCode};let failure;try{await publicRequest('/api/tools/profile_update',{tool:'profile_update',args:{}})}catch(error){failure=error.message};return {failure,stopped};`);
 return {...await run(...Object.values(deps)),samples,observed};
}
test('clipped timeout has safe explicit classification and queue/budget telemetry',async()=>{
 const state=await request({timeout:true});assert.equal(state.failure,'fanout_quiet_deadline');assert.equal(state.stopped,state.failure);assert.equal(state.samples[0].queueWaitMs,500);assert.equal(state.samples[0].requestBudgetMs,400);assert.equal(state.samples[0].quietBudgetRemainingMs,400);assert.equal(state.samples[0].failureCode,'fanout_quiet_deadline');assert.ok(!JSON.stringify(state).includes('private provider'));
});
test('admission after quiet deadline starts no fetch; unrelated failures retain safe generic code',async()=>{
 const late=await request({delay:1000});assert.equal(late.failure,'fanout_quiet_deadline');assert.equal(late.observed.fetches,undefined);
 const other=await request({networkFailure:true});assert.equal(other.failure,'operation_failed');assert.equal(other.samples[0].failureCode,'operation_failed');
 const normal=await request({quiet:false});assert.equal(normal.observed.timeoutMs,15000);assert.equal(normal.samples[0].quietBudgetRemainingMs,null);assert.equal(normal.samples[0].ok,true);
});
