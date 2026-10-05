import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('./CreateMaterial.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('CreateMaterial.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(predicate){let found;function visit(node){if(predicate(node))found=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(found);return found;}
const named=name=>extract(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
const settle=extract(node=>ts.isArrowFunction(node)&&node.body.getText(ast).includes('if (!pending && !busy.current && closeRequested.current)'));
const code=ts.transpileModule(`export function harness(){
 let pending=false,closing=false;const busy={current:false},completed={current:false},closeRequested={current:false},isClosing={current:false},closeTimer={current:null},mounted={current:true};
 const state={closed:0,kept:0},onClose=()=>state.closed++,keepDraft=()=>state.kept++,setClosing=value=>closing=value;
 const window={matchMedia:()=>({matches:true})};
 const setPending=value=>pending=value;
 ${named('dismiss')}
 ${named('finishPending')}
 return {state,dismiss,settle:${settle},start:()=>{busy.current=true;pending=true;},finish:success=>{completed.current=success;finishPending();},unmount:()=>{mounted.current=false;}};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {harness}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('creating material queues close during generation and retains a failed draft before closing',()=>{
 const h=harness();h.start();h.dismiss();h.dismiss();h.settle();assert.deepEqual(h.state,{closed:0,kept:0});
 h.finish(false);h.settle();assert.deepEqual(h.state,{closed:1,kept:1});h.dismiss();h.settle();assert.deepEqual(h.state,{closed:1,kept:1});
});
test('closing after confirmed creation does not restore an already-saved draft for duplicate generation',()=>{
 const h=harness();h.start();h.dismiss();h.finish(true);h.settle();assert.deepEqual(h.state,{closed:1,kept:0});
});
test('normal dismissal keeps writing and reduced-motion double activation closes only once',()=>{
 const h=harness();h.dismiss();h.dismiss();assert.deepEqual(h.state,{closed:1,kept:1});
});
test('a fast batched response still honors the queued close and an old response never closes a replacement',()=>{
 const h=harness();h.start();h.dismiss();h.finish(false);assert.deepEqual(h.state,{closed:1,kept:1});
 const old=harness();old.start();old.dismiss();old.unmount();old.finish(false);assert.deepEqual(old.state,{closed:0,kept:0});
});

const requestCode=ts.transpileModule(`export function requestHarness(mode,write,read){
 const mounted={current:true},busy={current:false},completed={current:false},closeRequested={current:false};
 const cacheKey='same-request',dismissedDrafts=new Map(),updates=[],writes=[];
 const setPending=value=>updates.push(['pending',value]),setStatus=value=>updates.push(['status',value]),setErrors=value=>updates.push(['errors',value]);
 const kind='flashcards',title='Cells',subject='Biology',cards=[{id:'one',front:'Question',back:'Answer'}],questions=[];
 const artifactId={current:'set'},createdAt={current:'2026-10-04'},generationAttempt={current:undefined},colorFor={flashcards:'peach'};
 const suggestedStudyTitle=()=>title,validateStudyArtifact=()=>[],openNote=()=>{},dismiss=()=>updates.push(['closed']),clearFeedback=()=>{},alert={current:null};
 const onSave=artifact=>{writes.push(['save',artifact]);return write;},onGenerate=attempt=>{writes.push(['generate',attempt]);return write;},onAsk=prompt=>{writes.push(['ask',prompt]);return write;};
 const canAsk=true,canGenerateHere=mode==='direct',isEmbedded=mode==='chat',selectedIds=[],materials=[],onReadMaterial=undefined,idea='Study cells',source='',useConversation=false;
 const readSelectedMaterials=()=>read??Promise.resolve([]),buildDirectStudyGenerationInput=()=>({kind}),stableStudyGenerationRequest=()=>({requestId:'old'}),buildStudyCreationPrompt=()=>'Create flashcards';
 ${named('finishPending')}
 ${named('clearCompletedDraft')}
 ${named('save')}
 ${named('ask')}
 return {run:mode==='manual'?save:ask,mounted,completed,generationAttempt,dismissedDrafts,updates,writes,cacheKey};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {requestHarness}=await import('data:text/javascript;base64,'+Buffer.from(requestCode).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
for(const mode of ['manual','direct','chat'])test(`late ${mode} creation success preserves a newer same-key dismissed draft`,async()=>{
 const write=deferred(),h=requestHarness(mode,write.promise),work=h.run();
 await Promise.resolve();await Promise.resolve();assert.equal(h.writes.length,1);
 h.mounted.current=false;const newer={title:'New student draft'};h.dismissedDrafts.set(h.cacheKey,newer);h.updates.length=0;
 write.resolve();await work;
 assert.equal(h.dismissedDrafts.get(h.cacheKey),newer);assert.equal(h.completed.current,false);assert.deepEqual(h.updates,[],'no stale completion may change UI state');
});
for(const mode of ['manual','direct','chat'])test(`${mode} creation clears only its saved draft after the parent intentionally unmounts it`,async()=>{
 const write=deferred(),h=requestHarness(mode,write.promise);h.dismissedDrafts.set(h.cacheKey,{title:'Previously restored draft'});
 const work=h.run();await Promise.resolve();await Promise.resolve();assert.equal(h.writes.length,1);
 h.mounted.current=false;h.updates.length=0;write.resolve();await work;
 assert.equal(h.dismissedDrafts.has(h.cacheKey),false,'confirmed work must not reappear as an unfinished duplicate');assert.deepEqual(h.updates,[]);
});
test('material reads finishing after dismissal cannot start generation or replace request context',async()=>{
 const read=deferred(),h=requestHarness('direct',Promise.resolve(),read.promise),work=h.run();
 h.mounted.current=false;read.resolve([]);await work;
 assert.equal(h.writes.length,0);assert.equal(h.generationAttempt.current,undefined);
});
test('a late failed request does not surface an error in replacement material creation',async()=>{
 const write=deferred(),h=requestHarness('manual',write.promise),work=h.run();h.mounted.current=false;h.updates.length=0;
 write.reject(new Error('Offline'));await work;assert.deepEqual(h.updates,[]);
});
