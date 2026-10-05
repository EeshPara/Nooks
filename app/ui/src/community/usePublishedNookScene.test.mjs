import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./usePublishedNookScene.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const appearanceSource = fs.readFileSync(new URL('../personalization/types.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('types.ts', appearanceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const actual = name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(ast).replace(/^export /, '');
const code = ts.transpileModule(`export const create=({useCallback,useEffect,useRef,useState,callTool,document})=>{const accents=[{value:'#e9ab86'}],roomScenes=[{id:'rainy-library'}];${actual('safeBackgroundImage')};${source};return usePublishedNookScene;};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { create } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const ALICE = 'account:11111111-1111-4111-8111-111111111111', BOB = 'account:22222222-2222-4222-8222-222222222222';
const NOOK = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444', SCENE = '55555555-5555-4555-8555-555555555555';
const image = 'data:image/png;base64,iVBORw0KGgo=';
const scene = {id:SCENE,snapshotHash:'a'.repeat(64)};
const nook = id => ({id,title:'Bookshop',joined:true,visibility:'private',roomId:'custom',scene});
const appearance = () => ({name:'Bookshop',tagline:'Quiet',theme:'moonlight',accent:'#e9ab86',companion:'none',layout:'calm',decorations:[],room:'rainy-library',backgroundImage:image});
const result = (id=NOOK,scope=ALICE) => ({nookId:id,scene,recoveryScope:scope,appearance:appearance()});
const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const settle = async () => {for(let i=0;i<12;i++)await Promise.resolve();};
function harness(handler,options={}) {
  const states=[],effects=[],pending=[],listeners=new Map(),calls=[];let at=0;
  const hooks={
    useState(value){const slot=at++;if(!Object.hasOwn(states,slot))states[slot]=typeof value==='function'?value():value;return [states[slot],next=>{states[slot]=typeof next==='function'?next(states[slot]):next;}];},
    useRef(value){const slot=at++;return states[slot]??={current:value};},
    useCallback(fn,deps){const slot=at++;if(!states[slot]||deps.some((v,i)=>v!==states[slot].deps[i]))states[slot]={fn,deps};return states[slot].fn;},
    useEffect(fn,deps){const slot=at++;if(!effects[slot]||deps.some((v,i)=>v!==effects[slot].deps[i]))pending.push(()=>{effects[slot]?.cleanup?.();effects[slot]={deps,cleanup:fn()};});},
  };
  const h={options:{enabled:true,recoveryScope:ALICE,nook:nook(NOOK),...options},calls,document:{hidden:false,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:(key,fn)=>{if(listeners.get(key)===fn)listeners.delete(key);}}};
  const hook=create({...hooks,document:h.document,callTool:async(name,args)=>{calls.push({name,args});return handler(name,args);}});
  h.render=()=>{at=0;h.current=hook(h.options);pending.splice(0).forEach(fn=>fn());return h.current;};
  h.tick=async()=>{await settle();h.render();await settle();h.render();return h.current;};
  h.visibility=hidden=>{h.document.hidden=hidden;listeners.get('visibilitychange')?.();};
  h.close=()=>effects.forEach(e=>e?.cleanup?.());h.render();return h;
}

test('loads authorized immutable artwork once and does not refetch image bytes during presence snapshots',async()=>{
  const h=harness(()=>result());await h.tick();assert.equal(h.current.appearance.backgroundImage,image);assert.equal(h.current.loading,false);
  h.options.nook={...nook(NOOK),onlineCount:25};h.render();await h.tick();
  assert.deepEqual(h.calls,[{name:'nook_scene_get',args:{nookId:NOOK}}]);assert.deepEqual(h.current.scene,scene);h.close();
});
test('leave clears rendered artwork immediately and re-entry requires fresh authorization',async()=>{
  let revoked=false;const h=harness(()=>{if(revoked)throw Object.assign(new Error('Membership ended'),{code:'FORBIDDEN'});return result();});await h.tick();
  h.options.nook=null;assert.equal(h.render().appearance,undefined);await h.tick();assert.equal(h.current.isCustom,false);
  revoked=true;h.options.nook=nook(NOOK);h.render();await h.tick();assert.equal(h.calls.length,2);assert.equal(h.current.appearance,undefined);assert.match(h.current.error,/Membership ended/);h.close();
});
test('account changes hide old artwork synchronously and drop late responses from the previous account',async()=>{
  const old=deferred();let first=true;const h=harness(()=>{if(first){first=false;return old.promise;}return result(NOOK,BOB);});
  h.options.recoveryScope=BOB;assert.equal(h.render().appearance,undefined);await h.tick();assert.equal(h.current.appearance.name,'Bookshop');
  old.resolve({...result(),appearance:{...appearance(),name:'Old private scene'}});await h.tick();assert.equal(h.current.appearance.name,'Bookshop');assert.equal(h.current.error,undefined);h.close();
});
test('changing selection while artwork is loading never displays the previous nook',async()=>{
  const old=deferred();const h=harness((name,args)=>args.nookId===NOOK?old.promise:{...result(OTHER),appearance:{...appearance(),name:'Other'}});
  h.options.nook=nook(OTHER);assert.equal(h.render().appearance,undefined);await h.tick();
  old.resolve(result());await h.tick();assert.equal(h.current.appearance.name,'Other');assert.equal(h.current.nookId,OTHER);h.close();
});
test('scene identity and verified owner must match; malformed or remote images never render',async()=>{
  for(const patch of [{recoveryScope:BOB},{nookId:OTHER},{scene:{...scene,snapshotHash:'b'.repeat(64)}},{scene:null},{appearance:{...appearance(),backgroundImage:'https://example.com/private.png'}},{appearance:{...appearance(),room:'https://bad.invalid'}}]) {
    const h=harness(()=>({...result(),...patch}));await h.tick();assert.equal(h.current.appearance,undefined);assert.ok(h.current.error);assert.equal(h.current.loading,false);h.close();
  }
});
test('copies only display fields and never holds foreign storage locators in appearance',async()=>{
  const h=harness(()=>({...result(),appearance:{...appearance(),_storedBackground:{path:'foreign/private.png'},accountId:'foreign',generation:SCENE,token:'secret'}}));await h.tick();
  assert.deepEqual(h.current.appearance,appearance());assert.equal(JSON.stringify(h.current.appearance).includes('foreign'),false);h.close();
});
test('tab resume reauthorizes and revocation clears cached bytes instead of retaining an old background',async()=>{
  let revoked=false;const h=harness(()=>{if(revoked)throw new Error('Nook unavailable');return result();});await h.tick();
  h.visibility(true);await h.tick();assert.equal(h.calls.length,1);revoked=true;h.visibility(false);h.render();assert.equal(h.current.appearance,undefined);
  await h.tick();assert.equal(h.current.appearance,undefined);assert.match(h.current.error,/Nook unavailable/);assert.equal(h.calls.length,2);h.close();
});
test('manual retry recovers a failed authorized read and latest concurrent response wins',async()=>{
  let fail=true;const older=deferred(),newer=deferred();let read=0;
  const h=harness(()=>{if(fail)throw new Error('Offline');return ++read===1?older.promise:newer.promise;});await h.tick();assert.match(h.current.error,/Offline/);
  fail=false;const a=h.current.refresh(),b=h.current.refresh();newer.resolve(result());await b;await h.tick();assert.equal(h.current.appearance.backgroundImage,image);
  older.reject(new Error('Late outage'));await a;await h.tick();assert.equal(h.current.error,undefined);assert.equal(h.current.appearance.backgroundImage,image);h.close();
});
test('invalid scope, unknown scene, curated nook, and non-membership never read private artwork',async()=>{
  for(const options of [{recoveryScope:undefined},{recoveryScope:'device'},{enabled:false},{nook:{...nook(NOOK),scene:undefined}},{nook:{...nook(NOOK),roomId:'rainy-library'}},{nook:{...nook(NOOK),joined:false}}]) {
    const h=harness(()=>assert.fail('must not read'),options);await h.tick();assert.equal(h.calls.length,0);assert.equal(h.current.appearance,undefined);h.close();
  }
});
