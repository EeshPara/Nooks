import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = async source => import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function declaration(file, name) {
 const ast=ts.createSourceFile(file,fs.readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast).replace(/^export (default )?/,'');ts.forEachChild(node,visit);}visit(ast);assert.ok(found);return found;
}
const {createPendingStudyStore}=await load(fs.readFileSync(new URL('./pendingStudyStore.ts',import.meta.url),'utf8'));
const {validPracticeCheckpoint}=await load(fs.readFileSync(new URL('./practiceCheckpointValidation.ts',import.meta.url),'utf8'));
const hook=declaration('./usePracticeCheckpoint.ts','usePracticeCheckpoint');
const {create}=await load(`export const create=({useRef,useState,useEffect,useCallback,callTool,window,document,createPendingStudyStore,validPracticeCheckpoint,writes=new Map(),scope=()=> 'host'})=>{${hook};return usePracticeCheckpoint;};`);
function harness(saved, options={}) {
 const calls=[],slots=[],effects=[];let cursor=0;
 const useState=initial=>{const at=cursor++;if(!(at in slots))slots[at]=initial;return [slots[at],value=>{slots[at]=typeof value==='function'?value(slots[at]):value;}];};
 const useRef=initial=>{const at=cursor++;return slots[at]??(slots[at]={current:initial});};
 const useEffect=(effect,deps)=>{const at=cursor++,old=slots[at];if(old&&deps.every((v,i)=>Object.is(v,old.deps[i])))return;effects.push(()=>{old?.cleanup?.();slots[at]={deps,cleanup:effect()};});};
 const useCallback=(fn,deps)=>{const at=cursor++,old=slots[at];if(old&&deps.every((v,i)=>Object.is(v,old.deps[i])))return old.fn;slots[at]={deps,fn};return fn;};
 const run=create({useRef,useState,useEffect,useCallback,createPendingStudyStore:options.store??((scope,category)=>createPendingStudyStore(scope,category,undefined,new Map())),validPracticeCheckpoint,writes:options.writes,scope:options.scope,callTool:async(name,args)=>{calls.push({name,args});if(options.call)return options.call(name,args);return name==='practice_checkpoint_get'?{checkpoint:saved}:{};},window:{addEventListener(){},removeEventListener(){}},document:{hidden:false,addEventListener(){},removeEventListener(){}}});
 // No section element means the visibility observer has no ancestors to observe.
 const oldObserver=globalThis.MutationObserver;globalThis.MutationObserver=class{observe(){}disconnect(){}};
 let restored;const artifact={id:'preview-deck',kind:'flashcards',revision:1,cards:[{id:'a'},{id:'b'},{id:'c'}]};
 return {calls,get restored(){return restored;},render(snapshot,enabled){cursor=0;const result=run(artifact,snapshot,value=>{restored=value;},undefined,enabled);while(effects.length)effects.shift()();return result;},async unmount(){for(const slot of slots)slot?.cleanup?.();await new Promise(resolve=>setImmediate(resolve));globalThis.MutationObserver=oldObserver;}};
}
const snapshot={version:1,kind:'flashcards',artifactRevision:1,sessionId:'session-preview',elapsedSeconds:0,state:{queue:[0,1,2],known:[],firstAnswers:{},flipped:false,showHint:false,complete:false,duration:0}};

test('unsaved preview is immediately playable and never reads or writes nonexistent checkpoints',async()=>{
 const h=harness();
 try{
  let result=h.render(snapshot,false);assert.equal(result.ready,true);assert.equal(result.error,'');
  result=h.render({...snapshot,state:{queue:[1,2]},elapsedSeconds:30},false);
  await result.flush();result.retry();assert.deepEqual(h.calls,[]);
 }finally{await h.unmount();}
 assert.deepEqual(h.calls,[],'unmount does not create a checkpoint for an unsaved artifact');
});

test('saved study sets still restore and persist through server checkpoints',async()=>{
 const existing={...snapshot,state:{...snapshot.state,queue:[2],known:[0,1],firstAnswers:{0:true,1:true}}};const h=harness(existing);
 try{
  assert.equal(h.render(snapshot,true).ready,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.restored,existing);
  const result=h.render({...existing,elapsedSeconds:45},true);assert.equal(result.ready,true);
  await result.flush();
  assert.equal(h.calls[0].name,'practice_checkpoint_get');
  assert.equal(h.calls[1].name,'practice_checkpoint_save');
  assert.equal(h.calls[1].args.artifactId,'preview-deck');
  assert.equal(h.calls[1].args.checkpoint.elapsedSeconds,45);
 }finally{await h.unmount();}
});

test('failed checkpoint survives practice unmount and restores the newest answers on return',async()=>{
 const memory=new Map(),writes=new Map();
 const store=(scope,category)=>createPendingStudyStore(scope,category,undefined,memory);
 const newest={...snapshot,elapsedSeconds:22,state:{...snapshot.state,queue:[1,2],known:[0],firstAnswers:{0:true}}};
 const first=harness(null,{store,writes,call:async name=>{if(name==='practice_checkpoint_save')throw new Error('Offline');return {checkpoint:null};}});
 try{
  first.render(snapshot,true);await new Promise(resolve=>setImmediate(resolve));
  const state=first.render(newest,true);await state.flush();
  assert.match(first.render(newest,true).error,/Offline/);
 }finally{await first.unmount();}
 const second=harness(snapshot,{store,writes});
 try{
  second.render(snapshot,true);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(second.restored,newest);
  const state=second.render(newest,true);assert.equal(state.ready,true);await state.flush();
  assert.equal(store('host','checkpoints').get('preview-deck:1'),undefined);
 }finally{await second.unmount();}
});

test('account changes during an outstanding checkpoint never send it to the next account',async()=>{
 let workspace='account:alice',finish;
 const writes=new Map([['account:alice:preview-deck',new Promise(resolve=>{finish=resolve;})]]);
 const h=harness(null,{scope:()=>workspace,writes});
 try{
  h.render(snapshot,true);workspace='account:bob';finish();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.calls,[]);assert.equal(h.restored,undefined);
 }finally{await h.unmount();}
});

test('malformed saved checkpoint stays retryable instead of opening a broken quiz or card player',async()=>{
 const h=harness({...snapshot,state:{queue:[999]}});
 try{
  h.render(snapshot,true);await new Promise(resolve=>setImmediate(resolve));
  const state=h.render(snapshot,true);assert.equal(state.ready,false);assert.match(state.error,/could not be read safely/);assert.equal(h.restored,undefined);
 }finally{await h.unmount();}
});

for(const [file,kind] of [['./FlashcardsSession.tsx','flashcards'],['./QuizSession.tsx','quiz']]){
 const emit=declaration(file,'emitProgress');
 const {createEmit}=await load(`export const createEmit=({saved,onProgress})=>{const artifact={id:'preview'},cards=[{id:'a'}],questions=[{id:'a'}],sessionId={current:'s'},sessionRoomId={current:'garden'},isExam=false,isCorrectAnswer=()=>true,hasAnswer=()=>true;${emit};return emitProgress;};`);
 test(`${kind} completion shows local results without submitting awards for an unsaved set`,()=>{
  const calls=[];createEmit({saved:false,onProgress:value=>calls.push(value)})({0:true},10);assert.deepEqual(calls,[]);
  createEmit({saved:true,onProgress:value=>calls.push(value)})({0:true},10);assert.equal(calls.length,1);assert.equal(calls[0].artifactId,'preview');assert.equal(calls[0].kind,kind);
 });
}
