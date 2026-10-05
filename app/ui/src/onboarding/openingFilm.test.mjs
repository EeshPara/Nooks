import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function compile(source){const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const historySource=fs.readFileSync(new URL('./openingFilmHistory.ts',import.meta.url),'utf8');
const {createOpeningHistory,openingHistoryKey}=await compile(historySource);
const {createOpeningPlayback}=await compile(fs.readFileSync(new URL('./openingFilmPlayback.ts',import.meta.url),'utf8'));
const {createOpeningDismiss,OPENING_DISSOLVE_MS}=await compile(fs.readFileSync(new URL('./openingFilmDismiss.ts',import.meta.url),'utf8'));
const ALICE='account:11111111-1111-4111-8111-111111111111',BOB='account:22222222-2222-4222-8222-222222222222';
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function player(options={}) {
 let now=0,id=0;const timers=new Map(),phases=[],state={plays:0,pauses:0,finishes:0};
 const video={muted:false,play(){state.plays++;return Promise.resolve();},pause(){state.pauses++;}};
 const lifecycle=createOpeningPlayback({video,reducedMotion:false,hidden:false,onPhase:p=>phases.push(p),onFinish:()=>state.finishes++,schedule:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},cancel:id=>timers.delete(id),...options});
 function advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}
 return {lifecycle,state,video,phases,advance,timers};
}
function dismissal(options={}) {
 let now=0,id=0;const timers=new Map(),classes=new Set(),reasons=[];
 const surface={classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name))}};
 const lifecycle=createOpeningDismiss({surface,reducedMotion:false,hidden:false,onDismiss:reason=>reasons.push(reason),now:()=>now,schedule:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},cancel:id=>timers.delete(id),...options});
 function advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}
 return {lifecycle,classes,reasons,timers,advance};
}

test('first-visit marker is versioned and owner-scoped, without storing artwork or study data',()=>{
 const records=new Map(),storage={getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)};
 const history=createOpeningHistory(()=>storage);assert.equal(history.hasSeen(ALICE,'journey-v1'),false);history.markSeen(ALICE,'journey-v1');
 assert.equal(history.hasSeen(ALICE,'journey-v1'),true);assert.equal(history.hasSeen(BOB,'journey-v1'),false);assert.equal(history.hasSeen(ALICE,'journey-v2'),false);
 assert.deepEqual([...records.values()],['1']);assert.equal(createOpeningHistory(()=>storage).hasSeen(ALICE,'journey-v1'),true);
 assert.equal(openingHistoryKey('host','journey-v1'),undefined);assert.equal(openingHistoryKey(ALICE,'../invalid'),undefined);
});
test('blocked storage cannot replay the opening repeatedly within this session',()=>{
 const history=createOpeningHistory(()=>{throw new Error('Storage disabled');});assert.equal(history.hasSeen('device','v1'),false);history.markSeen('device','v1');assert.equal(history.hasSeen('device','v1'),true);
});
test('autoplay always starts muted and only an explicit sound action unmutes',()=>{
 const h=player();assert.equal(h.state.plays,1);assert.equal(h.video.muted,true);assert.deepEqual(h.phases,['loading']);h.lifecycle.playing();assert.equal(h.lifecycle.sound(true),true);assert.equal(h.video.muted,false);h.lifecycle.sound(false);assert.equal(h.video.muted,true);h.lifecycle.dispose();
});
test('slow loading or repeated stalls fall back after a bounded deadline',()=>{
 const h=player();h.advance(1500);h.lifecycle.waiting();h.advance(1000);assert.equal(h.phases.at(-1),'still');assert.equal(h.state.finishes,0);assert.equal(h.lifecycle.sound(true),false);
 const running=player();running.lifecycle.playing();running.advance(4000);assert.equal(running.phases.at(-1),'playing');running.lifecycle.waiting();running.advance(2500);assert.equal(running.phases.at(-1),'still');running.lifecycle.dispose();
});
test('autoplay rejection or playback error becomes a usable still without retries',async()=>{
 const rejected=player({video:{muted:false,play:()=>Promise.reject(new Error('Autoplay blocked')),pause(){}}});await tick();assert.equal(rejected.phases.at(-1),'still');
 const failed=player();failed.lifecycle.failed();failed.lifecycle.visibility(false);assert.equal(failed.state.plays,1);assert.equal(failed.phases.at(-1),'still');assert.equal(failed.timers.size,0);
});
test('reduced motion and missing video never start playback or delayed automatic entry',()=>{
 for(const options of [{reducedMotion:true},{video:null}]){const h=player(options);assert.equal(h.state.plays,0);assert.equal(h.phases.at(-1),'still');h.advance(60000);assert.equal(h.state.finishes,0);h.lifecycle.dispose();}
});
test('hidden tabs pause immediately and do not consume the loading timeout',()=>{
 const h=player({hidden:true});assert.equal(h.state.plays,0);h.advance(30000);assert.equal(h.phases.at(-1),'loading');h.lifecycle.visibility(false);assert.equal(h.state.plays,1);h.lifecycle.playing();h.lifecycle.visibility(true);assert.equal(h.state.pauses,1);h.advance(30000);assert.equal(h.phases.at(-1),'playing');h.lifecycle.visibility(false);assert.equal(h.state.plays,2);h.lifecycle.dispose();
});
test('the end card exits once, waits while hidden, and dismissal cancels all late completion',()=>{
 const h=player();h.lifecycle.playing();h.lifecycle.ended();assert.equal(h.phases.at(-1),'ending');h.lifecycle.visibility(true);h.advance(9000);assert.equal(h.state.finishes,0);h.lifecycle.visibility(false);h.advance(1100);assert.equal(h.state.finishes,1);h.lifecycle.ended();h.advance(9000);assert.equal(h.state.finishes,1);
 const closed=player();closed.lifecycle.ended();closed.lifecycle.dispose();closed.advance(9000);assert.equal(closed.state.finishes,0);assert.equal(closed.timers.size,0);
});
test('a baked-in closing card finishes immediately without an overlay phase or added delay',()=>{
 const h=player({endCardMode:'baked-in',endCardMs:3000});h.lifecycle.playing();h.lifecycle.ended();
 assert.equal(h.state.finishes,1);assert.deepEqual(h.phases,['loading','playing']);assert.equal(h.timers.size,0);
 h.lifecycle.ended();h.lifecycle.waiting();h.lifecycle.failed();h.lifecycle.visibility(false);h.advance(9000);
 assert.equal(h.state.finishes,1);assert.equal(h.state.plays,1);assert.equal(h.lifecycle.sound(true),false);assert.equal(h.timers.size,0);assert.deepEqual(h.phases,['loading','playing']);
});
test('a baked-in ending received while hidden finishes on return without replay or a closing overlay',()=>{
 const h=player({endCardMode:'baked-in'});h.lifecycle.playing();h.lifecycle.visibility(true);h.lifecycle.ended();
 h.lifecycle.waiting();h.lifecycle.failed();h.lifecycle.ended();h.advance(30000);
 assert.equal(h.state.finishes,0);assert.equal(h.timers.size,0);assert.deepEqual(h.phases,['loading','playing']);
 h.lifecycle.visibility(false);assert.equal(h.state.finishes,1);assert.equal(h.state.plays,1);assert.deepEqual(h.phases,['loading','playing']);
 h.lifecycle.visibility(false);assert.equal(h.state.finishes,1);
});
test('closing before a hidden baked-in completion cancels late dismissal',()=>{
 const h=player({endCardMode:'baked-in'});h.lifecycle.playing();h.lifecycle.visibility(true);h.lifecycle.ended();h.lifecycle.dispose();h.lifecycle.visibility(false);h.advance(9000);
 assert.equal(h.state.finishes,0);assert.equal(h.state.plays,1);assert.equal(h.timers.size,0);assert.deepEqual(h.phases,['loading','playing']);
});
test('baked-in mode preserves manual-entry stills for reduced motion, missing media, and playback failure',()=>{
 for(const options of [{reducedMotion:true},{video:null},{}]){
  const h=player({endCardMode:'baked-in',...options});if(!options.reducedMotion&&options.video!==null)h.lifecycle.failed();
  assert.equal(h.phases.at(-1),'still');h.lifecycle.ended();h.lifecycle.visibility(false);h.advance(30000);assert.equal(h.state.finishes,0);assert.equal(h.timers.size,0);h.lifecycle.dispose();
 }
 const stalled=player({endCardMode:'baked-in'});stalled.advance(2500);stalled.lifecycle.ended();assert.equal(stalled.phases.at(-1),'still');assert.equal(stalled.state.finishes,0);
 const reduced=player({endCardMode:'baked-in'});reduced.lifecycle.playing();reduced.lifecycle.visibility(true);reduced.lifecycle.ended();reduced.lifecycle.reduceMotion();reduced.lifecycle.visibility(false);assert.equal(reduced.phases.at(-1),'still');assert.equal(reduced.state.finishes,0);
});
test('an explicit overlay mode retains the full default end-card duration',()=>{
 const h=player({endCardMode:'overlay'});h.lifecycle.playing();h.lifecycle.ended();h.advance(1099);assert.equal(h.state.finishes,0);assert.equal(h.phases.at(-1),'ending');h.advance(1);assert.equal(h.state.finishes,1);
});
test('a live reduced-motion preference stops the film without another network/play attempt',()=>{
 const h=player();h.lifecycle.playing();h.lifecycle.reduceMotion();assert.equal(h.phases.at(-1),'still');h.lifecycle.visibility(false);assert.equal(h.state.plays,1);h.lifecycle.dispose();
});

test('automatic completion gives the full frame a 700 ms dissolve and reports exactly once',()=>{
 const h=dismissal();h.lifecycle.dismiss('finished');assert.equal(h.classes.has('is-dissolving'),true);assert.deepEqual(h.reasons,[]);
 h.advance(699);assert.deepEqual(h.reasons,[]);h.lifecycle.dismiss('finished');h.advance(1);assert.deepEqual(h.reasons,['finished']);
 h.lifecycle.dismiss('close');h.advance(5000);assert.deepEqual(h.reasons,['finished']);assert.equal(h.timers.size,0);
});
test('both the visual dissolve and completion clock pause while hidden, preserving remaining time',()=>{
 const h=dismissal();h.lifecycle.dismiss('finished');h.advance(200);h.lifecycle.visibility(true);h.lifecycle.visibility(true);
 assert.equal(h.classes.has('is-dismiss-paused'),true);assert.equal(h.timers.size,0);h.advance(30000);assert.deepEqual(h.reasons,[]);
 h.lifecycle.visibility(false);assert.equal(h.classes.has('is-dismiss-paused'),false);h.advance(499);assert.deepEqual(h.reasons,[]);h.advance(1);assert.deepEqual(h.reasons,['finished']);
 const hidden=dismissal({hidden:true});hidden.lifecycle.dismiss('finished');hidden.advance(30000);assert.equal(hidden.timers.size,0);assert.deepEqual(hidden.reasons,[]);hidden.lifecycle.visibility(false);hidden.advance(699);assert.deepEqual(hidden.reasons,[]);hidden.advance(1);assert.deepEqual(hidden.reasons,['finished']);
});
test('enter, X, Escape and outside dismissal interrupt a dissolve immediately, including while hidden',()=>{
 for(const reason of ['enter','close','escape','outside']){
  const h=dismissal();h.lifecycle.dismiss('finished');h.advance(120);h.lifecycle.visibility(true);h.lifecycle.dismiss(reason);
  assert.deepEqual(h.reasons,[reason]);assert.equal(h.timers.size,0);h.lifecycle.visibility(false);h.advance(5000);assert.deepEqual(h.reasons,[reason]);
  const skipped=dismissal();skipped.lifecycle.dismiss(reason);assert.deepEqual(skipped.reasons,[reason]);assert.equal(skipped.classes.has('is-dissolving'),false);
 }
});
test('reduced motion closes immediately and unmount cancels a pending dissolve and clears its classes',()=>{
 for(const options of [{reducedMotion:true},{surface:null}]){const h=dismissal(options);h.lifecycle.dismiss('finished');assert.deepEqual(h.reasons,['finished']);assert.equal(h.timers.size,0);assert.equal(h.classes.has('is-dissolving'),false);}
 const reduced=dismissal();reduced.lifecycle.dismiss('finished');reduced.advance(100);reduced.lifecycle.reduceMotion();assert.deepEqual(reduced.reasons,['finished']);assert.equal(reduced.timers.size,0);
 const disposed=dismissal();disposed.lifecycle.dismiss('finished');disposed.lifecycle.visibility(true);disposed.lifecycle.dispose();disposed.lifecycle.visibility(false);disposed.lifecycle.dismiss('close');disposed.advance(5000);assert.deepEqual(disposed.reasons,[]);assert.equal(disposed.classes.size,0);assert.equal(disposed.timers.size,0);
});
test('the native backdrop shares the film opacity dissolve and its pause state, with no image translation',()=>{
 const css=fs.readFileSync(new URL('./OpeningFilm.css',import.meta.url),'utf8');
 const filmAndBackdrop=/\.nooks-opening-film\.is-dissolving\s*,\s*\.nooks-opening-film\.is-dissolving::backdrop\s*\{([^}]+)\}/.exec(css)?.[1];
 assert.ok(filmAndBackdrop,'an opaque native backdrop would otherwise hide the nook during the fade');assert.match(filmAndBackdrop,new RegExp(`animation:nooks-opening-dissolve ${OPENING_DISSOLVE_MS}ms`));
 assert.match(css,/\.nooks-opening-film\.is-dissolving\.is-dismiss-paused\s*,\s*\.nooks-opening-film\.is-dissolving\.is-dismiss-paused::backdrop\s*\{animation-play-state:paused\}/);
 assert.match(css,/@keyframes nooks-opening-dissolve\s*\{from\{opacity:1\}to\{opacity:0\}\}/);
 const component=fs.readFileSync(new URL('./OpeningFilm.tsx',import.meta.url),'utf8');assert.doesNotMatch(component,/useSoftDismiss/,'film completion must not inherit popup translation or scale');
});

const hookSource=fs.readFileSync(new URL('./useOpeningFilm.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('const history = createOpeningHistory();','');
const {createHook}=await compile(`export const createHook=({useState,useRef,useEffect,useCallback,history,openingHistoryKey})=>{${hookSource.replace(/export /g,'')};return useOpeningFilm;};`);
function hookHarness(options={},seen=new Map()){
 const states=[],effects=[],pending=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!Object.hasOwn(states,i))states[i]=typeof initial==='function'?initial():initial;return[states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useRef(value){return states[cursor++]??={current:value};},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});},useCallback(fn,deps){const i=cursor++;if(!states[i]||deps.some((v,j)=>v!==states[i].deps[j]))states[i]={fn,deps};return states[i].fn;}};
 const history=createOpeningHistory(()=>({getItem:k=>seen.get(k),setItem:(k,v)=>seen.set(k,v)}));const hook=createHook({...hooks,history,openingHistoryKey});
 const h={options:{scopeKey:ALICE,eligible:true,safeToOpen:true,...options}};h.render=()=>{cursor=0;h.current=hook(h.options);pending.splice(0).forEach(fn=>fn());return h.current;};h.render();h.render();return h;
}
test('returning visitors remain closed and explicit replay is the only way to mount again',()=>{
 const seen=new Map([[openingHistoryKey(ALICE,'journey-v1'),'1']]);const h=hookHarness({},seen);assert.equal(h.current.open,false);assert.equal(h.current.replay(),true);h.render();assert.equal(h.current.open,true);assert.equal(h.current.mode,'replay');h.current.dismiss('close');h.render();assert.equal(h.current.open,false);
});
test('a fresh safe visit opens once; skipping and reopening the app stays closed',()=>{
 const seen=new Map();const h=hookHarness({},seen);assert.equal(h.current.open,true);assert.equal(h.current.mode,'first-visit');h.current.dismiss('enter');h.render();assert.equal(h.current.open,false);assert.equal(hookHarness({},seen).current.open,false);
});
test('unknown owners, existing sessions, and unsaved work cannot automatically open a film',()=>{
 for(const options of [{scopeKey:undefined},{scopeKey:'host'},{eligible:false},{safeToOpen:false}]){const h=hookHarness(options);assert.equal(h.current.open,false);if(!h.options.safeToOpen||!openingHistoryKey(h.options.scopeKey,'journey-v1'))assert.equal(h.current.replay(),false);}
});
test('new work interrupts the opening and closing that work does not bring it back',()=>{
 const h=hookHarness();assert.equal(h.current.open,true);h.options.safeToOpen=false;assert.equal(h.render().open,false);h.options.safeToOpen=true;h.render();assert.equal(h.current.open,false);
});
test('account changes hide an earlier owner’s active presentation before effects run',()=>{
 const h=hookHarness();assert.equal(h.current.open,true);h.options.scopeKey=BOB;h.options.eligible=false;assert.equal(h.render().open,false);h.render();assert.equal(h.current.open,false);assert.equal(h.current.replay(),true);h.render();assert.equal(h.current.open,true);
});

test('the real closed component returns null instead of constructing any media surface',async()=>{
 const source=fs.readFileSync(new URL('./OpeningFilm.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('OpeningFilm.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='OpeningFilm').getText(ast);
 const {OpeningFilm,constructed}=await compile(`export const constructed=[];const React={createElement:(...args)=>{constructed.push(args);return args;}};const OpeningFilmSurface=()=>{};${component.replace('export default function','export function')}`);
 assert.equal(OpeningFilm({open:false,videoSrc:'/movie.mp4',posterSrc:'/poster.webp'}),null);assert.equal(constructed.length,0);OpeningFilm({open:true,videoSrc:'/movie.mp4',endCardMode:'baked-in'});assert.equal(constructed.length,1);assert.equal(constructed[0][1].endCardMode,'baked-in');
});

test('portrait and narrow film frames retain the complete landscape image with matching poster geometry',()=>{
 const css=fs.readFileSync(new URL('./OpeningFilm.css',import.meta.url),'utf8');
 const marker='@media(max-width:760px),(orientation:portrait)';
 const start=css.indexOf(marker);assert.ok(start>=0,'both narrow landscape phones and portrait tablets need letterboxing');
 let at=css.indexOf('{',start)+1,depth=1;const bodyStart=at;
 for(;at<css.length&&depth;at++){if(css[at]==='{')depth++;else if(css[at]==='}')depth--;}
 const rules=css.slice(bodyStart,at-1);
 assert.match(rules,/\.nooks-opening-scene\s*\{[^}]*background:\s*#181713\s*[;}]/,'unused frame space uses the intended dark backdrop');
 const shared=rules.match(/\.nooks-opening-poster\s*,\s*\.nooks-opening-video\s*\{([^}]+)\}/)?.[1];
 assert.ok(shared,'poster and moving image must share one framing rule');
 assert.match(shared,/object-fit:\s*contain\s*[;}]/,'cover must not crop the creatures from a portrait view');
 assert.match(shared,/object-position:\s*center\s*(?:;|$)/,'the poster must not jump when playback starts');
 assert.doesNotMatch(rules,/object-fit:\s*cover|background-image:|filter:\s*blur/,'letterboxing must not introduce a cropped or blurred duplicate');
 // Both layers already share the full viewport rectangle; contain preserves its
 // complete 16:9 source (393×221.06 on the reported 393×852 phone viewport).
 const sharedBounds=css.match(/\.nooks-opening-scene,\.nooks-opening-poster,\.nooks-opening-video,[^{]+\{([^}]+)\}/)?.[1];
 assert.ok(sharedBounds);assert.match(sharedBounds,/inset:0/);assert.match(sharedBounds,/width:100%/);assert.match(sharedBounds,/height:100%/);
});
