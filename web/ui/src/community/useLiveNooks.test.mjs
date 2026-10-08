import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./useLiveNooks.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const code = ts.transpileModule(`export const create=({useCallback,useEffect,useRef,useState,callTool,document,window,isEmbedded,nooksAccount,startLiveSync})=>{${source};return useLiveNooks;};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { create } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
const ALICE = 'account:11111111-1111-4111-8111-111111111111', BOB = 'account:22222222-2222-4222-8222-222222222222';
const SELECTED = '33333333-3333-4333-8333-333333333333', OWNED = '44444444-4444-4444-8444-444444444444';
function harness(handler, initial = {}, storage = new Map()) {
  const states=[], effects=[], pending=[], calls=[]; let at=0;
  const hooks = {
    useState(value) { const slot=at++; if (!Object.hasOwn(states,slot)) states[slot]=value; return [states[slot], next => { states[slot]=typeof next==='function'?next(states[slot]):next; }]; },
    useRef(value) { const slot=at++; return states[slot]??={current:value}; },
    useCallback(fn,deps) { const slot=at++; if (!states[slot] || deps.some((v,i)=>v!==states[slot].deps[i])) states[slot]={fn,deps}; return states[slot].fn; },
    useEffect(fn,deps) { const slot=at++; if (!effects[slot] || deps.some((v,i)=>v!==effects[slot].deps[i])) pending.push(()=>{effects[slot]?.cleanup?.();effects[slot]={deps,cleanup:fn()};}); },
  };
  const h={options:{enabled:true,recoveryScope:ALICE,...initial},calls,document:{hidden:false,addEventListener(){},removeEventListener(){}}};
  const hook=create({...hooks,isEmbedded:true,nooksAccount:{},startLiveSync:()=>()=>{},document:h.document,window:{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setInterval(){return 1;},clearInterval(){}},callTool:async(name,args)=>{calls.push({name,args});const scope=h.options.recoveryScope;const value=await handler(name,args);return {recoveryScope:scope,...(name==='nooks_list'?{profile:{id:scope?.slice(8),displayName:'Saved learner',avatar:3}}:{}),...value};}});
  h.render=()=>{at=0;h.current=hook(h.options);pending.splice(0).forEach(fn=>fn());return h.current;};
  h.tick=async()=>{await settle();h.render();await settle();h.render();return h.current;};
  h.close=()=>effects.forEach(e=>e?.cleanup?.());h.render();return h;
}
const nook = id => ({id,title:id,role:'owner',joined:true,visibility:'private',roomId:'rainy-library',memberCount:1,onlineCount:1});
const snapshot = id => ({nook:nook(id),members:[],leaderboard:[],memberCount:1,onlineCount:1});

test('directory paging and Joined filter reach older nooks without losing the selected lobby', async () => {
  const h=harness((name,args)=>name==='nooks_list'?{nooks:[nook(args.joinedOnly?'old-private':`page-${args.offset}`)],hasMore:args.offset===0}:name==='nook_snapshot'?snapshot(args.nookId):{});
  await h.tick();h.current.select(SELECTED);await h.tick();h.current.browse(50);await h.tick();
  assert.equal(h.current.nooks[0].id,'page-50');assert.equal(h.current.snapshot.nook.id,SELECTED);
  h.current.browse(0,true);await h.tick();assert.equal(h.current.nooks[0].id,'old-private');assert.equal(h.current.directory.joinedOnly,true);
  assert.deepEqual(h.calls.filter(c=>c.name==='nooks_list').at(-1).args,{offset:0,joinedOnly:true,limit:50});h.close();
});
test('a slow previous page cannot overwrite a newly selected filter', async () => {
  const slow=deferred();let first=true;
  const h=harness((name,args)=>{if(name==='nooks_list'){if(first){first=false;return slow.promise;}return {nooks:[nook('joined')],hasMore:false};}return {};});
  h.current.browse(0,true);slow.resolve({nooks:[nook('stale-public')],hasMore:true});await h.tick();
  assert.equal(h.current.nooks[0].id,'joined');assert.equal(h.current.directory.joinedOnly,true);assert.equal(h.current.directory.hasMore,false);h.close();
});
test('archiving preserves the current nook on failure and clears it only after confirmed success', async () => {
  let fails=true,archived=false;
  const h=harness((name,args)=>{
    if(name==='nooks_list')return {nooks:archived?[]:[nook('owned')],hasMore:false};
    if(name==='nook_snapshot')return snapshot(args.nookId);
    if(name==='nook_archive'){if(fails)throw new Error('Offline');archived=true;return {archived:true};}return {};
  },{activeNookId:OWNED});
  await h.tick();await assert.rejects(h.current.archive(OWNED),/Offline/);await h.tick();assert.equal(h.current.activeNookId,OWNED);
  fails=false;await h.current.archive(OWNED);await h.tick();assert.equal(h.current.activeNookId,undefined);assert.equal(h.current.snapshot,null);assert.deepEqual(h.current.nooks,[]);h.close();
});
test('an emptied last page retreats, and invitation results cannot report a false revoke as success', async () => {
  const h=harness((name,args)=>name==='nooks_list'?{nooks:args.offset===50?[]:[nook('first')],hasMore:false}:name==='nook_invite_revoke'?{revoked:false}:{});
  await h.tick();h.current.browse(50);await h.tick();assert.equal(h.current.directory.offset,0);assert.equal(h.current.nooks[0].id,'first');
  await assert.rejects(h.current.revokeInvite('first','missing'),/unavailable/);h.close();
});
test('disconnect drops a pending private invitation response and clears directory data', async () => {
  const pending=deferred();const h=harness(name=>name==='nooks_list'?{nooks:[nook('private')],hasMore:false}:pending.promise);
  await h.tick();const read=h.current.listInvites('private',50);h.options.enabled=false;h.render();pending.resolve({invites:[{id:'secret-metadata'}]});
  await assert.rejects(read,/view changed/);await h.tick();assert.deepEqual(h.current.nooks,[]);h.close();
});

test('reload restores an account-scoped lobby only after membership read, then resumes presence and saved profile', async () => {
  const storage = new Map(), respond = (name,args) => name==='nooks_list'?{nooks:[],hasMore:false}:name==='nook_snapshot'?snapshot(args.nookId):{};
  const first=harness(respond,{},storage);await first.tick();first.current.select(SELECTED);await first.tick();
  assert.equal(first.current.activeNookId,SELECTED);first.close();
  const restored=harness(respond,{},storage);await restored.tick();
  assert.equal(restored.current.activeNookId,SELECTED);assert.equal(restored.current.profile.displayName,'Saved learner');assert.equal(restored.current.profile.avatar,3);
  assert.deepEqual(restored.calls.map(call=>call.name),['nooks_list','nook_snapshot','nook_presence']);
  assert.equal(restored.calls.some(call=>call.name==='nook_join'),false);restored.close();
});

test('authoritative active focus restores the correct lobby ahead of an older local selection', async () => {
  const storage=new Map([[`nooks:community-selection:v1:${ALICE}`,OWNED]]);
  const h=harness((name,args)=>name==='nooks_list'?{nooks:[]}:name==='nook_snapshot'?snapshot(args.nookId):{}, {activeNookId:SELECTED}, storage);
  await h.tick();assert.equal(h.current.activeNookId,SELECTED);assert.equal(storage.get(`nooks:community-selection:v1:${ALICE}`),SELECTED);
  h.options.activeNookId=undefined;h.render();await h.tick();assert.equal(h.current.activeNookId,SELECTED);h.close();
});

test('late focus hydration can restore membership and completing focus does not leave the nook', async () => {
  const h=harness((name,args)=>name==='nooks_list'?{nooks:[]}:name==='nook_snapshot'?snapshot(args.nookId):{});
  await h.tick();h.options.activeNookId=SELECTED;h.render();await h.tick();assert.equal(h.current.activeNookId,SELECTED);h.close();
});

test('revoked or archived membership clears recovery without joining or heartbeating', async () => {
  const storage=new Map([[`nooks:community-selection:v1:${ALICE}`,SELECTED]]);
  const h=harness((name)=>{if(name==='nooks_list')return {nooks:[]};throw Object.assign(new Error('No access'),{code:'FORBIDDEN'});},{},storage);
  await h.tick();assert.equal(h.current.activeNookId,undefined);assert.equal(h.current.snapshot,null);assert.equal(storage.size,0);
  assert.deepEqual(h.calls.map(call=>call.name),['nooks_list','nook_snapshot']);h.close();
});

test('network failure retains a recovery hint and can retry without granting membership', async () => {
  const storage=new Map([[`nooks:community-selection:v1:${ALICE}`,SELECTED]]);let offline=true;
  const h=harness((name,args)=>{if(name==='nooks_list')return {nooks:[]};if(name==='nook_snapshot'){if(offline)throw new Error('Offline');return snapshot(args.nookId);}return {};},{},storage);
  await h.tick();assert.equal(h.current.activeNookId,undefined);assert.equal(storage.size,1);assert.equal(h.calls.some(call=>call.name==='nook_presence'),false);
  offline=false;await h.current.refresh();await h.tick();assert.equal(h.current.activeNookId,SELECTED);h.close();
});

test('account switch clears previous selection and profile, including a late old-account read', async () => {
  const old=deferred(),storage=new Map([[`nooks:community-selection:v1:${ALICE}`,SELECTED]]);let first=true;
  const h=harness((name,args)=>{if(name==='nooks_list'){if(first){first=false;return old.promise;}return {nooks:[],profile:{id:BOB.slice(8),displayName:'Other learner',avatar:1}};}return snapshot(args.nookId);},{},storage);
  h.options.recoveryScope=BOB;h.render();assert.equal(h.current.profile,undefined);assert.equal(h.current.activeNookId,undefined);
  old.resolve({nooks:[nook(SELECTED)],profile:{id:ALICE.slice(8),displayName:'Old learner',avatar:2}});await h.tick();
  assert.deepEqual(h.current.nooks,[]);assert.equal(h.current.profile.id,BOB.slice(8));assert.equal(h.current.profile.displayName,'Other learner');assert.equal(h.calls.some(call=>call.name==='nook_presence'),false);h.close();
});

test('mismatched or missing verified owner prevents recovery and presence', async () => {
  for (const recoveryScope of [BOB,undefined]) {
    const storage=new Map([[`nooks:community-selection:v1:${ALICE}`,SELECTED]]);
    const h=harness(()=>({nooks:[nook(SELECTED)],recoveryScope}),{},storage);await h.tick();
    assert.equal(h.current.profile,undefined);assert.deepEqual(h.current.nooks,[]);assert.equal(h.current.activeNookId,undefined);assert.equal(h.calls.length,1);assert.match(h.current.error,/account changed/);h.close();
  }
});

test('missing verified workspace scope disables community reads and never uses another account hint', async () => {
  const h=harness(()=>{throw new Error('Must not call');},{recoveryScope:undefined});await h.tick();assert.equal(h.current.enabled,false);assert.equal(h.calls.length,0);h.close();
});

test('unchanged authoritative profile keeps its identity so polling does not erase profile form edits', async () => {
  const h=harness(()=>({nooks:[]}));await h.tick();const profile=h.current.profile;await h.current.refresh();await h.tick();assert.equal(h.current.profile,profile);h.close();
});

test('privacy changes retain the selected lobby and reject unverified responses',async()=>{
 let visibility='public',fail=false;
 const h=harness((name,args)=>{
  if(name==='nooks_list')return {nooks:[{...nook(SELECTED),visibility}]};
  if(name==='nook_snapshot')return {...snapshot(SELECTED),nook:{...nook(SELECTED),visibility}};
  if(name==='nook_visibility_update'){if(fail)throw new Error('Owner required');visibility=args.visibility;return {nook:{...nook(SELECTED),visibility}};}
  return {};
 },{activeNookId:SELECTED});
 await h.tick();await h.current.updateVisibility(SELECTED,'private');await h.tick();
 assert.equal(h.current.activeNookId,SELECTED);assert.equal(h.current.snapshot.nook.visibility,'private');
 assert.deepEqual(h.calls.find(c=>c.name==='nook_visibility_update').args,{nookId:SELECTED,visibility:'private'});
 fail=true;await assert.rejects(h.current.updateVisibility(SELECTED,'public'),/Owner required/);await h.tick();assert.equal(h.current.snapshot.nook.visibility,'private');h.close();
});

test('room hints fetch only the selected snapshot and directory hints avoid snapshot/presence reads',async()=>{
 const h=harness((name,args)=>name==='nooks_list'?{nooks:[nook(SELECTED)]}:name==='nook_snapshot'?snapshot(args.nookId):{}, {activeNookId:SELECTED});
 await h.tick();h.calls.length=0;await h.current.refresh('room');await h.tick();assert.deepEqual(h.calls.map(c=>c.name),['nook_snapshot']);
 h.calls.length=0;await h.current.refresh('directory');await h.tick();assert.deepEqual(h.calls.map(c=>c.name),['nooks_list']);assert.equal(h.current.snapshot.nook.id,SELECTED);h.close();
});
