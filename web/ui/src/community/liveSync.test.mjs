import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('./liveSync.ts', import.meta.url), 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {startLiveSync}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function harness(extra={}) {
 let now=0,id=0,online=true,refreshes=0,beats=0,subscribes=0,removes=0,hint;
 const timers=new Map(), listeners=new Map();
 const events={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const doc={hidden:false,...events};
 const stop=startLiveSync({document:doc,window:events,online:()=>online,random:()=>0,now:()=>now,
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  refresh:async()=>{refreshes++;},heartbeat:async()=>{beats++;},subscribe:fn=>{hint=fn;subscribes++;return()=>removes++;},...extra});
 return {stop,doc,hint:topic=>hint(topic),get count(){return {refreshes,beats,subscribes,removes,timers:timers.size};},
  event:name=>listeners.get(name)?.(),online:value=>{online=value;listeners.get(value?'online':'offline')?.();},
  advance(ms){const end=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();}now=end;},get listeners(){return listeners.size;}};
}
test('a thousand broadcast hints become one refresh per cooldown, never one request per event',()=>{
 const h=harness();assert.equal(h.count.refreshes,1);for(let i=0;i<1000;i++)h.hint();h.advance(4999);assert.equal(h.count.refreshes,1);h.advance(1);assert.equal(h.count.refreshes,2);
 for(let i=0;i<1000;i++)h.hint();h.advance(5000);assert.equal(h.count.refreshes,3);h.stop();
});
test('reconciliation repairs lost hints and heartbeat has an independent minimum 45-second cadence',()=>{
 const h=harness();h.advance(45000);assert.equal(h.count.refreshes,2);assert.equal(h.count.beats,1);h.advance(45000);assert.equal(h.count.refreshes,3);assert.equal(h.count.beats,2);h.stop();
});
test('presence jitter spreads synchronized clients and repeats below the expiry window',()=>{
 const early=harness({random:()=>0}),late=harness({random:()=>.999});
 early.advance(45000);late.advance(45000);assert.equal(early.count.beats,1);assert.equal(late.count.beats,0);
 late.advance(9990);assert.equal(late.count.beats,1);late.advance(54990);assert.equal(late.count.beats,2);
 early.stop();late.stop();assert.equal(early.count.timers+late.count.timers,0);
});
test('hidden, offline and disposal remove channels and pending hints; resume reconciles',()=>{
 const h=harness();h.hint();h.doc.hidden=true;h.event('visibilitychange');assert.equal(h.count.removes,1);assert.equal(h.count.timers,0);h.advance(90000);h.hint();assert.equal(h.count.refreshes,1);
 h.doc.hidden=false;h.event('visibilitychange');h.advance(5000);assert.equal(h.count.refreshes,2);assert.equal(h.count.subscribes,2);
 h.online(false);assert.equal(h.count.removes,2);h.advance(90000);assert.equal(h.count.beats,0);h.online(true);h.advance(5000);assert.equal(h.count.refreshes,3);h.stop();h.hint();assert.equal(h.count.timers,0);assert.equal(h.listeners,0);
});
test('network failures do not produce unhandled rejections or tight retry loops',async()=>{
 let requests=0;const h=harness({refresh:async()=>{requests++;throw Error('offline');},heartbeat:async()=>{throw Error('offline');}});
 h.advance(90000);await Promise.resolve();await Promise.resolve();assert.equal(requests,3);h.stop();
});
test('large-room hints wait 12 seconds, and target room reads without reloading the directory',()=>{
 const reads=[];const h=harness({cooldown:()=>12000,refresh:async target=>{reads.push(target);}});
 for(let i=0;i<1000;i++)h.hint('nook:room');h.advance(11999);assert.deepEqual(reads,['all']);h.advance(1);assert.deepEqual(reads,['all','room']);
 h.hint('nooks:directory');h.advance(12000);assert.deepEqual(reads,['all','room','directory']);
 h.hint('nook:room');h.hint('account:account');h.advance(12000);assert.deepEqual(reads,['all','room','directory','all']);h.stop();
});
