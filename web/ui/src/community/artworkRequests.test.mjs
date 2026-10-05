import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('./artworkRequests.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {createArtworkRequestController,mergeCompletedArtwork,artworkIntent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const image='data:image/png;base64,iVBORw0KGgo=';
const draft=(status='pending')=>({id:'draft-a',revision:1,title:'My nook',description:'Quiet',style:'anime',artworkMode:'chatgpt',scenePrompt:'A reading room',visibility:'private',space:{room:'rainy-library',theme:'botanical'},artworkRequest:{requestId:'server-issued-request',status,createdAt:'2026-10-04T00:00:00.000Z',expiresAt:'2026-10-05T00:00:00.000Z',...(status==='received'?{file:{fileId:'file-a',downloadUrl:'https://files.oaiusercontent.com/image'}}:{})}});
function harness(initial=draft()){
 const h={remote:initial,current:true,hidden:false,blocked:false,reads:0,imports:0,completes:0,accepted:[],states:[],timers:[],now:Date.parse('2026-10-04T01:00:00Z')};
 h.options={draftId:'draft-a',requestId:'server-issued-request',current:()=>h.current,hidden:()=>h.hidden,blocked:()=>h.blocked,now:()=>h.now,read:async()=>{h.reads++;return structuredClone(h.remote);},importFile:async()=>{h.imports++;return image;},complete:async()=>{h.completes++;h.remote={...h.remote,revision:2,space:{...h.remote.space,backgroundImage:image},artworkRequest:{...h.remote.artworkRequest,status:'completed'}};return structuredClone(h.remote);},accept:value=>{h.accepted.push(value);return true;},state:value=>h.states.push(value),setTimer:(fn,delay)=>{const token={fn,delay};h.timers.push(token);return token;},clearTimer:token=>{h.timers=h.timers.filter(value=>value!==token);}};
 h.start=()=>{h.controller=createArtworkRequestController(h.options);h.controller.start();return h.controller;};h.next=async()=>{const timer=h.timers.shift();assert.ok(timer);timer.fn();await tick();return timer.delay;};return h;
}
test('visible pending polling backs off, pauses while hidden/busy and never claims generation progress',async()=>{
 const h=harness();h.hidden=true;h.start();await tick();assert.equal(h.reads,0);assert.equal(h.timers[0].delay,30000);
 h.hidden=false;h.controller.wake();await tick();assert.equal(h.reads,1);assert.equal(h.states.at(-1).phase,'waiting');
 await h.next();await h.next();await h.next();assert.equal(h.timers[0].delay,8000);
 h.blocked=true;await h.next();assert.equal(h.reads,4);assert.equal(h.timers[0].delay,2000);h.controller.stop();assert.equal(h.timers.length,0);
});
test('received file completes once and accepts only the confirmed saved draft',async()=>{
 const h=harness(draft('received'));h.start();await tick();assert.equal(h.imports,1);assert.equal(h.completes,1);assert.equal(h.accepted.length,1);assert.equal(h.states.at(-1).phase,'complete');assert.equal(h.accepted[0].space.backgroundImage,image);assert.equal(h.timers.length,0);
});
test('owner, selected request or artwork intent changes during read/import cannot save or adopt late bytes',async()=>{
 for(const stage of ['read','import']){
  const h=harness(draft('received')),pending=deferred();if(stage==='read')h.options.read=()=>pending.promise;else h.options.importFile=()=>pending.promise;
  h.start();await tick();h.current=false;pending.resolve(stage==='read'?draft('received'):image);await tick();assert.equal(h.completes,0);assert.equal(h.accepted.length,0);h.controller.stop();
 }
});
test('stopping a request aborts its import and stale completion cannot show another owner success',async()=>{
 const h=harness(draft('received')),pending=deferred();let signal;
 h.options.importFile=(_,value)=>{signal=value;return pending.promise;};h.start();await tick();h.controller.stop();assert.equal(signal.aborted,true);pending.resolve(image);await tick();assert.equal(h.completes,0);
 const late=harness(draft('received')),save=deferred();late.options.complete=()=>save.promise;late.start();await tick();late.current=false;save.resolve(draft('completed'));await tick();assert.equal(late.accepted.length,0);assert.notEqual(late.states.at(-1).phase,'complete');
});
test('unknown completion result reconciles the same request without another image upload',async()=>{
 const h=harness(draft('received'));h.options.complete=async()=>{h.completes++;h.remote={...draft('completed'),revision:2,space:{backgroundImage:image}};throw new Error('Response lost');};
 h.start();await tick();assert.equal(h.completes,1);assert.equal(h.imports,1);assert.equal(h.reads,2);assert.equal(h.accepted.length,1);
});
test('failed import/save pauses until retry and cached bytes are reused for the same file',async()=>{
 const h=harness(draft('received'));let fail=true;h.options.complete=async()=>{h.completes++;if(fail)throw new Error('Artwork quota reached');return{...draft('completed'),revision:2,space:{backgroundImage:image}};};
 h.start();await tick();assert.equal(h.states.at(-1).phase,'error');assert.match(h.states.at(-1).message,/quota/);assert.equal(h.timers.length,0);assert.equal(h.completes,1);
 fail=false;h.controller.retry();await tick();assert.equal(h.completes,2);assert.equal(h.imports,1);assert.equal(h.accepted.length,1);
});
test('expired/canceled/wrong requests never download or complete; read failures stop after four tries',async()=>{
 for(const status of ['expired','canceled']){const h=harness(draft(status));h.start();await tick();assert.equal(h.imports,0);assert.equal(h.completes,0);assert.equal(h.timers.length,0);}
 const h=harness();h.options.read=async()=>{h.reads++;throw new Error('Offline');};h.start();await tick();await h.next();await h.next();await h.next();assert.equal(h.reads,4);assert.equal(h.timers.length,0);
});
test('completed artwork preserves local metadata and refuses changed artwork or conflicting remote edits',()=>{
 const base=draft(),local={...base,title:'Unsaved title',description:'Unsaved description'},incoming={...draft('completed'),revision:2,space:{backgroundImage:image}};
 const merged=mergeCompletedArtwork(local,base,incoming);assert.equal(merged.title,local.title);assert.equal(merged.description,local.description);assert.equal(merged.space.backgroundImage,image);assert.equal(merged.revision,2);
 for(const change of [{scenePrompt:'Different image'},{style:'watercolor'},{artworkMode:'curated'},{space:{backgroundImage:'different'}},{id:'other-draft'},{artworkRequest:{...base.artworkRequest,requestId:'other-request'}}])assert.equal(mergeCompletedArtwork({...local,...change},base,incoming),null);
 assert.equal(mergeCompletedArtwork(local,base,{...incoming,title:'Conflicting remote title'}),null);
 assert.equal(artworkIntent({...base,title:'Rename'}),artworkIntent(base));
});
test('saved artwork requiring review never emits a complete preview status',async()=>{
 const h=harness({...draft('completed'),space:{backgroundImage:image}});h.options.accept=()=>false;h.start();await tick();assert.equal(h.states.at(-1).phase,'error');assert.match(h.states.at(-1).message,/Review/);assert.equal(h.timers.length,0);
});
test('completed request with temporarily unavailable stored pixels does not claim its preview is ready',async()=>{
 const h=harness(draft('completed'));h.start();await tick();assert.equal(h.accepted.length,0);assert.equal(h.states.at(-1).phase,'error');assert.match(h.states.at(-1).message,/preview could not be loaded/);h.controller.stop();
});
