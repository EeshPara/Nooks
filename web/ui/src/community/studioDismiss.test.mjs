import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./NookStudio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('NookStudio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function named(name) { let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(found,name);return found; }
const code=ts.transpileModule(`export function harness(){
 let busy='',dirty=false,pendingLeave=null;const owner='account:alice',state={closes:0,error:'',switches:0};
 const visibility={current:{propOpen:true,visible:true,epoch:0}},dismissRef={current:()=>{state.closes++;}};
 const currentDraft={current:{id:'draft-a',title:'Unsaved Hogwarts',scenePrompt:'My unsaved artwork prompt',artworkRequest:{requestId:'request-a',status:'pending'}}};
 const records=new Map(),localCancellation={current:null},cancellationUnsafe={current:false},cancellationStore={get:id=>records.get(id)};
 const setPendingLeave=updater=>{pendingLeave=typeof updater==='function'?updater(pendingLeave):updater;},setError=x=>state.error=x;
 ${named('pendingCancellation')}
 ${named('leave')}
 ${named('requestClose')}
 ${named('completeLeave')}
 return {state,records,currentDraft,localCancellation,cancellationUnsafe,requestClose,completeLeave,visibility,
 switchDraft:()=>leave(()=>{state.switches++;}),setBusy:x=>busy=x,setDirty:x=>dirty=x,
 reopen:()=>{visibility.current={propOpen:true,visible:true,epoch:visibility.current.epoch+1};},get pending(){return pendingLeave;}};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {harness}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('one close action hides a clean, dirty, or saving editor without a discard prompt',()=>{
 for(const {dirty,busy} of [{dirty:false,busy:''},{dirty:true,busy:''},{dirty:true,busy:'save'},{dirty:true,busy:'publish'}]) {
  const h=harness();h.setDirty(dirty);h.setBusy(busy);const draft=structuredClone(h.currentDraft.current);
  h.requestClose();assert.equal(h.state.closes,1);assert.equal(h.visibility.current.visible,false);assert.equal(h.pending,null);assert.deepEqual(h.currentDraft.current,draft);
 }
});
test('repeated taps dismiss once and reopening restores the same draft for another one-tap close',()=>{
 const h=harness();h.setDirty(true);h.requestClose();h.requestClose();assert.equal(h.state.closes,1);
 h.reopen();assert.equal(h.currentDraft.current.title,'Unsaved Hogwarts');h.requestClose();assert.equal(h.state.closes,2);assert.equal(h.pending,null);
});
test('closing hides an existing discard prompt without performing the destructive action',()=>{
 const h=harness();h.setDirty(true);h.switchDraft();assert.equal(typeof h.pending,'function');h.requestClose();assert.equal(h.pending,null);assert.equal(h.state.switches,0);assert.equal(h.state.closes,1);
});
test('unsafe cancellation remains in retained state while the editor closes and reopens',()=>{
 const h=harness();h.localCancellation.current={scope:'account:alice',draftId:'draft-a',requestId:'request-a'};h.cancellationUnsafe.current=true;
 h.requestClose();assert.equal(h.state.closes,1);assert.equal(h.cancellationUnsafe.current,true);assert.equal(h.localCancellation.current.requestId,'request-a');
 h.reopen();h.switchDraft();assert.equal(h.state.switches,0);assert.match(h.state.error,/retry cancellation/);assert.equal(h.localCancellation.current.requestId,'request-a');
});
test('switching away from dirty work still requires an explicit destructive decision',()=>{
 const h=harness();h.setDirty(true);h.switchDraft();assert.equal(h.state.switches,0);assert.equal(typeof h.pending,'function');
 h.completeLeave();assert.equal(h.state.switches,1);assert.equal(h.pending,null);h.completeLeave();assert.equal(h.state.switches,1);
});
test('cancellation becoming unsafe after a switch confirmation still prevents losing its only marker',()=>{
 const h=harness();h.setDirty(true);h.switchDraft();h.localCancellation.current={scope:'account:alice',draftId:'draft-a',requestId:'request-a'};h.cancellationUnsafe.current=true;
 h.completeLeave();assert.equal(h.state.switches,0);assert.equal(typeof h.pending,'function');h.requestClose();assert.equal(h.state.closes,1);assert.equal(h.localCancellation.current.requestId,'request-a');
});
