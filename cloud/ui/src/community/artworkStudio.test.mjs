import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function declarations(file,names){const source=fs.readFileSync(new URL(file,import.meta.url),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found=new Map();function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))found.set(node.name.text,node.getText(ast).replace(/^export /,''));if(ts.isVariableStatement(node))for(const item of node.declarationList.declarations)if(names.includes(item.name.getText(ast)))found.set(item.name.getText(ast),node.getText(ast).replace(/^export /,''));ts.forEachChild(node,visit);}visit(ast);for(const name of names)assert.ok(found.has(name),name);return names.map(name=>found.get(name)).join('\n');}
async function compile(source){const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {create}=await compile(`export function create(draft,onTool,requestChatGPT,isEmbedded=true){
 const state={draft,error:'',notice:'',busy:'',conflict:null,artwork:null,stops:0}; const owner='account:alice',dirty=true,mounted={current:true},currentOwner=()=>mounted.current;
 const currentDraft={current:draft},currentSnapshot={current:''},currentBusy={current:''},cancelingArtwork={current:null},localCancellation={current:null},cancellationUnsafe={current:false};
 const tool={current:onTool},artworkRequestKeys={current:new Map()},artworkController={current:{stop:()=>state.stops++}},records=new Map();
 const cancellationStore={get:id=>records.get(id),retain:record=>{records.set(record.draftId,record);return true;},acknowledge:record=>{if(records.get(record.draftId)?.requestId===record.requestId)records.delete(record.draftId);}};
 const refreshCancellation=()=>{},setArtworkState=value=>state.artwork=value,setBusy=value=>state.busy=value,setError=value=>state.error=value,setNotice=value=>state.notice=value,setConflict=value=>state.conflict=value,setReadiness=()=>{},setShowPrompt=value=>state.showPrompt=value,setStage=()=>{},setReview=()=>{},setIntent=()=>{},setDeleteConfirm=()=>{};
 const setDraft=value=>{state.draft=value;currentDraft.current=value;},setSavedSnapshot=value=>currentSnapshot.current=value;
 const adopt=value=>{setDraft(value);setSavedSnapshot(snapshot(value));};
 ${declarations('../organization/types.ts',['resultData','errorMessage'])}
 ${declarations('./artworkRequests.ts',['awaitingArtwork','artworkIntent','mergeCompletedArtwork','cancelSavedArtwork'])}
 ${declarations('./NookStudio.tsx',['styleLabels','payload','snapshot','pendingCancellation','operate','save','askForArt','artworkPrompt','cancelArtwork','load'])}
 return{state,records,currentDraft,currentSnapshot,mounted,cancellationStore,save,cancel:()=>cancelArtwork(),ask:askForArt,prompt:()=>artworkPrompt(currentDraft.current),load};
}`);
const id='10000000-0000-4000-8000-000000000001',requestId='20000000-0000-4000-8000-000000000002';
const base=()=>({id,title:'My nook',description:'Quiet',revision:1,style:'anime',artworkMode:'chatgpt',scenePrompt:'Reading room',visibility:'private',pathTemplate:'none',space:{room:'rainy-library'},artworkRequest:{requestId,status:'pending',createdAt:'2026-10-04T00:00:00Z',expiresAt:'2026-10-05T00:00:00Z'}});
test('generate saves a blank-name draft, prompts with the server-issued request and retries the same request',async()=>{
 const draft={...base(),title:'',revision:0,artworkRequest:undefined},calls=[],prompts=[];let fail=true;
 const h=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_draft_save')return{draft:{...args.draft,revision:1}};if(name==='nook_artwork_request')return{draft:base()};assert.fail(name);},async prompt=>{prompts.push(prompt);if(fail)throw new Error('Uncertain prompt response');return true;});
 await h.ask();assert.deepEqual(calls.map(call=>call.name),['nook_draft_save','nook_artwork_request']);assert.equal(calls[0].args.draft.title,'My custom study nook');assert.ok(prompts[0].includes(requestId));assert.ok(!prompts[0].includes(calls[1].args.requestId));
 fail=false;await h.ask();assert.equal(calls.length,2);assert.equal(prompts.length,2);assert.ok(prompts[1].includes(requestId));assert.match(h.state.notice,/look for the returned image/);
});
test('website and other non-hosted editors save locally and expose an ID-free prompt without starting automatic handoff',async()=>{
 for(const oldRequest of [undefined,base().artworkRequest]){
  const draft={...base(),title:'',revision:0,artworkRequest:oldRequest},calls=[];let messages=0;
  const h=create(draft,async(name,args)=>{calls.push(name);assert.equal(name,'nook_draft_save');return{draft:{...args.draft,revision:1,artworkRequest:oldRequest}};},async()=>{messages++;return false;},false);
  await h.ask();assert.deepEqual(calls,['nook_draft_save']);assert.equal(messages,0);assert.equal(h.state.artwork,null);assert.equal(h.state.showPrompt,true);assert.match(h.state.notice,/Open Nooks inside ChatGPT to return artwork automatically/);
  const prompt=h.prompt();assert.ok(!prompt.includes(id));assert.ok(!prompt.includes(requestId));assert.doesNotMatch(prompt,/nook_artwork_receive|nooks_present/);assert.match(prompt,/Do not call Nooks tools to update my browser draft/);
 }
});
test('failed cancellation stays pending and retryable, and only confirmed cancellation clears its marker',async()=>{
 const draft=base(),calls=[];let fail=true;
 const h=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_artwork_cancel'){if(fail)throw new Error('Offline');return{draft:{...draft,artworkRequest:{...draft.artworkRequest,status:'canceled'}}};}return{draft};},async()=>true);
 h.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.records.get(id).requestId,requestId);assert.equal(h.state.draft.artworkRequest.status,'pending');assert.match(h.state.artwork.message,/not confirmed/);assert.doesNotMatch(h.state.notice,/canceled/);
 fail=false;h.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.records.size,0);assert.equal(h.state.draft.artworkRequest.status,'canceled');assert.match(h.state.notice,/canceled/);assert.deepEqual(calls.filter(call=>call.name==='nook_artwork_cancel').map(call=>call.args),[{draftId:id,requestId},{draftId:id,requestId}]);
});
test('completion winning cancellation is recovered honestly without erasing local metadata',async()=>{
 const draft=base(),incoming={...draft,revision:2,space:{backgroundImage:'data:image/png;base64,iVBORw0KGgo='},artworkRequest:{...draft.artworkRequest,status:'completed'}};
 const h=create(draft,async name=>{if(name==='nook_artwork_cancel')throw new Error('Already complete');return{draft:incoming};},async()=>true);
 h.currentSnapshot.current=JSON.stringify({...draft,artworkRequest:undefined});h.currentDraft.current={...draft,title:'Unsaved title'};
 h.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.state.draft.title,'Unsaved title');assert.equal(h.state.draft.space.backgroundImage,incoming.space.backgroundImage);assert.equal(h.records.size,0);assert.match(h.state.artwork.message,/finished saving before cancellation/);assert.doesNotMatch(h.state.notice,/canceled/);
});
test('failed alternate-draft load leaves the selected request controller running',async()=>{
 const draft=base(),h=create(draft,async()=>{throw new Error('Offline');},async()=>true);await h.load('another-draft');assert.equal(h.state.stops,0);assert.equal(h.state.draft.id,id);assert.equal(h.state.error,'Offline');
});
test('explicit image removal is sent to the server even though an omitted image is preserved',async()=>{
 let submitted;const draft={...base(),space:{backgroundImage:''}},h=create(draft,async(name,args)=>{submitted=args.draft;return{draft};},async()=>true);await h.save();assert.equal(Object.hasOwn(submitted.space,'backgroundImage'),true);assert.equal(submitted.space.backgroundImage,'');
});
const {createArtworkCancellationStore}=await compile(fs.readFileSync(new URL('./artworkCancellationStore.ts',import.meta.url),'utf8'));
test('blocked storage keeps cancellation across editor reopen without crossing accounts or consuming editor quota',()=>{
 const memory=new Map(),disk={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');},removeItem:()=>{throw new Error('Blocked');}},record={draftId:id,requestId};
 const first=createArtworkCancellationStore('account:alice',disk,memory);assert.equal(first.retain(record),false);
 const reopened=createArtworkCancellationStore('account:alice',disk,memory);assert.deepEqual(reopened.get(id),record);assert.equal(createArtworkCancellationStore('account:bob',disk,memory).get(id),undefined);
 reopened.acknowledge({...record,requestId:'30000000-0000-4000-8000-000000000003'});assert.deepEqual(reopened.get(id),record);reopened.acknowledge(record);assert.equal(first.get(id),undefined);
});
