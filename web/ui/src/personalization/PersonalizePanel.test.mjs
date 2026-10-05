import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const text=fs.readFileSync(new URL('./PersonalizePanel.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('PersonalizePanel.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const panel=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='PersonalizePanel');
const body=panel.body.statements.filter(node=>!ts.isReturnStatement(node)).map(node=>node.getText(ast)).join('\n');
const helpers=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['appearanceDraftKey','retainFailedAppearance'].includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');
const code=`const failedAppearanceDrafts=new Map();${helpers};export const create=({useContext,useEffect,useRef,useState,useCrashDraft,useSoftDismiss,useBackdropDismiss,useModalFocus,defaultSpace,DraftRecoveryScope,roomScenes=[],getRoomScene=()=>({})})=>function render({space,onSave,onClose,onAskChatGPT}){${body};return {draft,setDraft,save,dismiss,error,saving,origin};};export const reset=()=>failedAppearanceDrafts.clear();export const entries=()=>[...failedAppearanceDrafts.entries()];`;
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {create,reset,entries}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const original={name:'Library',tagline:'Quiet',theme:'botanical',room:'rainy-library',accent:'#eee',companion:'none',layout:'calm',decorations:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function harness({owner='account:alice',space=original,onSave=async()=>{}}={}){
 const slots=[],effects=[],pending=[];let at=0;
 const h={owner,props:{space,onSave,onClose:()=>h.closed++},closed:0};
 const state=value=>{const slot=at++;if(!Object.hasOwn(slots,slot))slots[slot]=typeof value==='function'?value():value;return [slots[slot],next=>{slots[slot]=typeof next==='function'?next(slots[slot]):next;}];};
 const ref=value=>{const slot=at++;return slots[slot]??={current:value};};
 const render=create({
  useContext:()=>h.owner,useState:state,useRef:ref,
  useEffect:(fn,deps)=>{const slot=at++;if(!effects[slot]||deps.some((v,i)=>v!==effects[slot].deps[i]))pending.push(()=>{effects[slot]?.cleanup?.();effects[slot]={deps,cleanup:fn()};});},
  useCrashDraft:(name,initial)=>{const slot=at++;if(!slots[slot]||slots[slot].owner!==h.owner)slots[slot]={owner:h.owner,value:typeof initial==='function'?initial():initial};return [slots[slot].value,next=>{slots[slot].value=typeof next==='function'?next(slots[slot].value):next;}];},
  useSoftDismiss:(element,close)=>{const current=ref({close,closed:false});current.current.close=close;return ()=>{if(current.current.closed)return;current.current.closed=true;current.current.close();};},
  useBackdropDismiss:()=>({}),useModalFocus:()=>{},defaultSpace:original,DraftRecoveryScope:{},
 });
 h.render=()=>{at=0;h.current=render(h.props);pending.splice(0).forEach(fn=>fn());return h.current;};
 h.tick=async()=>{await settle();h.render();await settle();h.render();};
 h.close=()=>effects.forEach(effect=>effect?.cleanup?.());h.render();return h;
}

test('X during a failed save closes after settlement and restores the edited appearance on reopen',async()=>{
 reset();const request=deferred(),h=harness({onSave:()=>request.promise});
 h.current.setDraft({...original,name:'My unfinished nook'});h.render();const saving=h.current.save();h.render();
 h.current.dismiss();h.current.dismiss();assert.equal(h.closed,0);request.reject(new Error('Offline'));await saving;await h.tick();
 assert.equal(h.closed,1);assert.equal(entries().length,1);h.close();
 const restored=harness();assert.equal(restored.current.draft.name,'My unfinished nook');restored.close();
});

test('failed drafts are isolated by owner and by exact original appearance',async()=>{
 reset();const h=harness({onSave:async()=>{throw new Error('Offline');}});h.current.setDraft({...original,tagline:'My private idea'});h.render();await h.current.save();h.render();h.current.dismiss();h.close();
 const other=harness({owner:'account:bob'});assert.equal(other.current.draft.tagline,original.tagline);other.close();
 const changed=harness({space:{...original,tagline:'Changed elsewhere'}});assert.equal(changed.current.draft.tagline,'Changed elsewhere');changed.close();
 const restored=harness();assert.equal(restored.current.draft.tagline,'My private idea');restored.close();
});

test('successful retry clears retained failed draft and closes once',async()=>{
 reset();const h=harness({onSave:async()=>{throw new Error('Offline');}});h.current.setDraft({...original,name:'Recovered'});h.render();await h.current.save();h.render();h.current.dismiss();h.close();
 const retry=harness();assert.equal(retry.current.draft.name,'Recovered');await retry.current.save();await retry.tick();assert.equal(retry.closed,1);assert.equal(entries().length,0);retry.close();
});

test('ordinary cancel and undismissed failure do not accumulate drafts in the dismissal cache',async()=>{
 reset();const cancelled=harness();cancelled.current.setDraft({...original,name:'Discard me'});cancelled.render();cancelled.current.dismiss();assert.equal(entries().length,0);cancelled.close();
 const failed=harness({onSave:async()=>{throw new Error('Offline');}});await failed.current.save();await failed.tick();assert.equal(failed.closed,0);assert.equal(entries().length,0);failed.close();
});

test('late save failure after unmount or owner change cannot cache or close another owner panel',async()=>{
 for(const changeOwner of [false,true]){
  reset();const request=deferred(),h=harness({onSave:()=>request.promise});const work=h.current.save();h.render();h.current.dismiss();
  if(changeOwner){h.owner='account:bob';h.render();}else h.close();
  request.reject(new Error('Offline'));await work;if(changeOwner)await h.tick();
  assert.equal(h.closed,0);assert.equal(entries().length,0);if(changeOwner){assert.equal(h.current.saving,false);h.close();}
 }
});

test('failed appearance cache is bounded and rejects oversize drafts before closing',async()=>{
 reset();for(let index=0;index<6;index++){
  const h=harness({owner:`account:${index}`,onSave:async()=>{throw new Error('Offline');}});await h.current.save();h.render();h.current.dismiss();h.close();
 }
 assert.equal(entries().length,4);
 const large=harness({onSave:async()=>{throw new Error('Offline');}});large.current.setDraft({...original,backgroundImage:'x'.repeat(1_100_001)});large.render();await large.current.save();large.render();large.current.dismiss();large.render();
 assert.equal(large.closed,0);assert.match(large.current.error,/too large/);assert.equal(entries().length,4);large.close();
});
