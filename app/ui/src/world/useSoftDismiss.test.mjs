import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('./useSoftDismiss.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function useSoftDismiss','function useSoftDismiss');
const compiled=ts.transpileModule(`export const create=({useCallback,useEffect,useRef,window,setTimeout,clearTimeout})=>{${source};return useSoftDismiss;};`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {create}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(initial={}){
 const slots=[],effects=[],pending=[],events=[],animations=[],timers=new Map();let at=0,nextTimer=0;
 const h={options:{...initial},events,animations,timers,onDismiss:()=>events.push('dismiss'),reducedMotion:false,motionOff:false};
 const target={closest:()=>h.motionOff?{}:null,animate:(frames,options)=>{const completion=deferred();const record={frames,options,completion,cancelled:false};animations.push(record);return {finished:completion.promise,cancel:()=>{record.cancelled=true;completion.reject(new Error('cancelled'));}};}};
 h.element={current:target};
 const hook=create({
  useRef:value=>{const slot=at++;return slots[slot]??={current:value};},
  useCallback:(callback,deps)=>{const slot=at++;if(!slots[slot]||deps.some((v,i)=>v!==slots[slot].deps[i]))slots[slot]={callback,deps};return slots[slot].callback;},
  useEffect:(callback,deps)=>{const slot=at++;if(!effects[slot]||deps.some((v,i)=>v!==effects[slot].deps[i]))pending.push(()=>{effects[slot]?.cleanup?.();effects[slot]={deps,cleanup:callback()};});},
  window:{matchMedia:()=>({matches:h.reducedMotion}),getComputedStyle:()=>({opacity:'0.8',transform:'none'})},
  setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
 });
 h.render=()=>{at=0;h.dismiss=hook(h.element,h.onDismiss,h.options);pending.splice(0).forEach(run=>run());return h.dismiss;};
 h.close=()=>effects.forEach(effect=>effect?.cleanup?.());h.render();return h;
}

test('many close taps start one exit and dismiss/afterDismiss run once even when fallback also fires',async()=>{
 const h=harness();h.dismiss(()=>h.events.push('after'));h.dismiss(()=>h.events.push('second'));
 assert.equal(h.animations.length,1);assert.equal(h.animations[0].options.duration,140);assert.deepEqual(h.events,[]);
 const fallback=[...h.timers.values()][0];assert.equal(fallback.delay,190);
 h.animations[0].completion.resolve();await settle();fallback.callback();h.dismiss();
 assert.deepEqual(h.events,['dismiss','after']);assert.equal(h.timers.size,0);h.close();
});

test('queued close retains the first click until the operation becomes unblocked',async()=>{
 const h=harness({blocked:true,queueWhenBlocked:true});
 h.dismiss(()=>h.events.push('first after'));h.dismiss(()=>h.events.push('second after'));
 assert.equal(h.animations.length,0);assert.equal(h.timers.size,0);assert.deepEqual(h.events,[]);
 h.render();assert.equal(h.animations.length,0);
 h.options={blocked:false,queueWhenBlocked:true};h.render();assert.equal(h.animations.length,1);
 h.animations[0].completion.resolve();await settle();
 assert.deepEqual(h.events,['dismiss','first after']);h.close();
});

test('queued close uses the latest onDismiss callback when it becomes unblocked',async()=>{
 const h=harness({blocked:true,queueWhenBlocked:true});h.dismiss();
 h.onDismiss=()=>h.events.push('new callback');h.render();assert.deepEqual(h.events,[]);
 h.options={blocked:false,queueWhenBlocked:true};h.render();h.animations[0].completion.resolve();await settle();
 assert.deepEqual(h.events,['new callback']);h.close();
});

test('an exit already animating also uses the latest onDismiss callback',async()=>{
 const h=harness();h.dismiss();h.onDismiss=()=>h.events.push('replacement');h.render();
 h.animations[0].completion.resolve();await settle();assert.deepEqual(h.events,['replacement']);h.close();
});

test('unmount discards a queued close and its afterDismiss callback',async()=>{
 const h=harness({blocked:true,queueWhenBlocked:true});h.dismiss(()=>h.events.push('after'));h.close();
 h.dismiss();await settle();assert.equal(h.animations.length,0);assert.equal(h.timers.size,0);assert.deepEqual(h.events,[]);
});

test('unmount cancels the exit animation and prevents both completion and fallback callbacks',async()=>{
 const h=harness();h.dismiss(()=>h.events.push('after'));const fallback=[...h.timers.values()][0];h.close();
 assert.equal(h.animations[0].cancelled,true);assert.equal(h.timers.size,0);
 fallback.callback();h.animations[0].completion.resolve();await settle();assert.deepEqual(h.events,[]);
});

test('blocked close does not queue by default or when queueWhenBlocked is explicitly false',async()=>{
 for(const options of [{blocked:true},{blocked:true,queueWhenBlocked:false}]){
  const h=harness(options);h.dismiss(()=>h.events.push('discarded'));h.options={...options,blocked:false};h.render();
  assert.equal(h.animations.length,0);assert.deepEqual(h.events,[]);
  h.dismiss();h.animations[0].completion.resolve();await settle();assert.deepEqual(h.events,['dismiss']);h.close();
 }
});

test('reduced motion executes a queued close immediately and exactly once after unblock',()=>{
 const h=harness({blocked:true,queueWhenBlocked:true});h.reducedMotion=true;h.dismiss(()=>h.events.push('after'));
 h.options={blocked:false,queueWhenBlocked:true};h.render();h.dismiss();
 assert.equal(h.animations.length,0);assert.deepEqual(h.events,['dismiss','after']);h.close();
});

test('missing element and motion-off close immediately without losing afterDismiss',()=>{
 for(const mode of ['missing','motion-off']){
  const h=harness();if(mode==='missing')h.element.current=null;else h.motionOff=true;
  h.dismiss(()=>h.events.push('after'));h.dismiss();assert.equal(h.animations.length,0);assert.deepEqual(h.events,['dismiss','after']);h.close();
 }
});

test('browser animation failures still close once and fallback covers a missing completion event',()=>{
 const h=harness();h.element.current.animate=()=>{throw new Error('unsupported');};h.dismiss(()=>h.events.push('after'));assert.deepEqual(h.events,['dismiss','after']);h.close();
 const stalled=harness();stalled.dismiss(()=>stalled.events.push('after'));const fallback=[...stalled.timers.values()][0];fallback.callback();fallback.callback();
 assert.deepEqual(stalled.events,['dismiss','after']);assert.equal(stalled.timers.size,0);stalled.close();
});
