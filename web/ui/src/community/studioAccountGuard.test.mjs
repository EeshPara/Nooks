import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const parse=path=>ts.createSourceFile(path,fs.readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const studio=parse('./NookStudio.tsx'),app=parse('../App.tsx'),account=parse('../account/AccountDialog.tsx');
function named(ast,name){let value;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)value=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(value,name);return value;}
const source=`
export function makeStudio(owner='alice'){
 const state={notice:false,pending:null,resets:0,saves:0},currentDraft={current:{title:'',description:'',scenePrompt:'',space:{}}},currentSnapshot={current:''},currentBusy={current:''},cancelingArtwork={current:null},currentArtworkState={current:{phase:'waiting'}},cancellationUnsafe={current:false};
 const pristineSnapshot={current:JSON.stringify(currentDraft.current)};let activeOwner=owner,mounted=true,pendingCancel=false;
 const currentOwner=()=>mounted&&activeOwner===owner,snapshot=JSON.stringify,pendingCancellation=()=>pendingCancel,setAccountChangeNotice=value=>state.notice=value;
 const nookNameInput={current:null},focusAfterAccountPrompt=()=>{};
 const leave=action=>state.pending=action,artworkController={current:null},newDraft=()=>({title:'',description:'',scenePrompt:'',space:{}}),noop=()=>{};
 const setDraft=()=>state.resets++,setSavedSnapshot=noop,setStage=noop,setReview=noop,setIntent=noop,setConflict=noop,setDeleteConfirm=noop,setError=noop,setNotice=noop,saveDraft=()=>state.saves++;
 ${named(studio,'startNew')}
 ${['accountWorkPending','unsavedStudioChanges','canChangeAccount','discardForAccountChange','saveForAccountChange'].map(name=>named(studio,name)).join('\n')}
 return{state,currentDraft,currentSnapshot,currentBusy,cancelingArtwork,currentArtworkState,cancellationUnsafe,guard:{owner,canChangeAccount},discardForAccountChange,saveForAccountChange,unmount:()=>mounted=false,changeOwner:value=>activeOwner=value,pendingCancel:value=>pendingCancel=value};
}
export function makeApp(guard){
 const studioAccountGuard={current:guard},draftOwner='alice',pendingProgress={current:new Set()},state={account:true,studio:false,nooks:false,navigated:0,notices:0};let saving=false,focusSession=null;
 const setShowAccount=value=>state.account=value,setShowNooks=value=>state.nooks=value,setShowNookCreator=value=>state.studio=value,notify=()=>state.notices++,canNavigate=()=>{state.navigated++;return true;};
 ${named(app,'beforeAccountChange')}
 return{state,beforeAccountChange,studioAccountGuard,setSaving:value=>saving=value};
}
export function makeAccount(onBeforeAccountChange){
 let busy=false;const state={signouts:0,verifications:0,error:''},email='alice@example.test',code='123456';
 const nooksAccount={signOut:async()=>state.signouts++,verifyCode:async()=>state.verifications++},setBusy=value=>busy=value,setError=value=>state.error=value,setSent=()=>{},setCode=()=>{};
 ${named(account,'signOut')}
 ${named(account,'verify')}
 return{state,signOut,verify};
}`;
const {makeStudio,makeApp,makeAccount}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));

test('hidden dirty Studio blocks both actual account actions and reopens without changing identity',async()=>{
 const studio=makeStudio();studio.currentDraft.current.title='Unsaved quiet corner';const app=makeApp(studio.guard),account=makeAccount(app.beforeAccountChange);
 await account.signOut();await account.verify({preventDefault(){}});assert.equal(account.state.signouts,0);assert.equal(account.state.verifications,0);assert.equal(app.state.account,false);assert.equal(app.state.studio,true);assert.equal(app.state.navigated,0);assert.equal(studio.state.notice,true);assert.equal(studio.currentDraft.current.title,'Unsaved quiet corner');
});
test('guard reads latest draft and save refs synchronously, not an effect-published dirty flag',async()=>{
 const studio=makeStudio(),account=makeAccount(makeApp(studio.guard).beforeAccountChange);studio.currentDraft.current.description='Just typed';await account.signOut();assert.equal(account.state.signouts,0);
 studio.currentSnapshot.current=JSON.stringify(studio.currentDraft.current);studio.currentBusy.current='save';await account.signOut();assert.equal(account.state.signouts,0);studio.currentBusy.current='';await account.signOut();assert.equal(account.state.signouts,1);
});
test('active save, artwork import and unsafe cancellation block even a clean draft and cannot discard',()=>{
 for(const configure of [s=>s.currentBusy.current='generate',s=>s.cancelingArtwork.current=Promise.resolve(),s=>s.currentArtworkState.current.phase='importing',s=>s.currentArtworkState.current.phase='saving',s=>{s.pendingCancel(true);s.cancellationUnsafe.current=true;}]){const studio=makeStudio();configure(studio);assert.equal(studio.guard.canChangeAccount(),false);studio.discardForAccountChange();assert.equal(studio.state.pending,null);assert.equal(studio.state.resets,0);}
});
test('discard uses explicit confirmation and starts fresh without deleting saved records',()=>{
 const studio=makeStudio();studio.currentDraft.current.title='Unsaved edit';studio.discardForAccountChange();assert.equal(typeof studio.state.pending,'function');assert.equal(studio.state.resets,0);studio.state.pending();assert.equal(studio.state.resets,1);assert.equal(studio.state.notice,false);assert.equal(studio.guard.canChangeAccount(),true);
});
test('work starting after discard prompt and unmounted/old-owner callbacks cannot discard',()=>{
 for(const invalidate of [s=>s.currentBusy.current='save',s=>s.unmount(),s=>s.changeOwner('bob')]){const studio=makeStudio();studio.currentDraft.current.title='Keep me';studio.discardForAccountChange();invalidate(studio);studio.state.pending();assert.equal(studio.state.resets,0);assert.equal(studio.currentDraft.current.title,'Keep me');assert.equal(studio.guard.canChangeAccount(),false);}
});
test('another owner guard never reopens their Studio; existing account saving guard remains',()=>{
 const other=makeStudio('bob');other.currentDraft.current.title='Bob private';const app=makeApp(other.guard);assert.equal(app.beforeAccountChange(),true);assert.equal(app.state.studio,false);assert.equal(other.state.notice,false);app.setSaving(true);assert.equal(app.beforeAccountChange(),false);assert.equal(app.state.notices,1);
});
test('saved Studio drafts permit account change, including saved waiting artwork',async()=>{
 const studio=makeStudio();studio.currentDraft.current={title:'Saved',description:'',scenePrompt:'',space:{},artworkRequest:{status:'pending'}};studio.currentSnapshot.current=JSON.stringify(studio.currentDraft.current);const account=makeAccount(makeApp(studio.guard).beforeAccountChange);await account.signOut();assert.equal(account.state.signouts,1);assert.equal(studio.state.notice,false);
});

test('pristine empty draft can leave, but an untitled scene or style choice is protected',()=>{
 const pristine=makeStudio();assert.equal(pristine.guard.canChangeAccount(),true);
 for(const change of [{space:{room:'comfy-cabin'}},{style:'watercolor'}]){const studio=makeStudio();Object.assign(studio.currentDraft.current,change);assert.equal(studio.guard.canChangeAccount(),false);assert.equal(studio.state.notice,true);}
});

test('account banner save action rejects in-flight artwork and uses normal save after work settles',()=>{
 const studio=makeStudio();studio.currentArtworkState.current.phase='saving';studio.saveForAccountChange();assert.equal(studio.state.saves,0);studio.currentArtworkState.current.phase='complete';studio.saveForAccountChange();assert.equal(studio.state.saves,1);studio.unmount();studio.saveForAccountChange();assert.equal(studio.state.saves,1);
});
