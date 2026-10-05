import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the real App gate and dispatch branch without starting a database or
// replacing its editors with a separate preview implementation.
const text=await readFile(new URL('../App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const app=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='WorkspaceApp');
const declaration=name=>app.body.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(ast)===name);
const fn=name=>app.body.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast);
async function compile(source){const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const owner='account:12345678-1234-1234-1234-123456789012';
const defaults={localScope:owner,progressOwner:{current:owner},isPublicPreview:false,account:{status:'signed-in',workspaceKey:owner},loading:false,workspaceReady:true,openingHostPending:0,pendingChatArtifact:null,pendingChatView:null,pendingStudioDraftId:null,pendingInitialPresentation:{current:null},showFocus:false,showSounds:false,showCollection:false,showToday:false,showNooks:false,showPeople:false,showPersonalize:false,showSettings:false,showAccount:false,showShare:false,showCreate:false,showNookCreator:false,showIdentity:false,mobileNav:false,portal:null,celebration:null,pendingJoin:null,handoff:'',chatSending:{current:false},
  // These deliberately model real unfinished work. Replay must not need to
  // discard or save any of it before placing a temporary film above it.
  page:'library',active:{id:'note-draft',content:'Keep this unsaved text'},reference:{forArtifactId:'note-draft'},noteDirty:true,studyEditorOpen:true,saving:true,error:'An autosave needs retry',studioLifetime:{current:{mounted:true}},creationSource:'Unsent source',running:true,pendingProgressCount:1,
};
const keys=Object.keys(defaults).join(',');
const {gate}=await compile(`export function gate(input,liveOwner=input.localScope){const {${keys}}=input;const readNativeRecoveryScope=value=>value;const getNativeRecoveryScope=()=>liveOwner;const nooksAccount={getSnapshot:()=>({...account,workspaceKey:liveOwner})};const openingOwnerReady=${declaration('openingOwnerReady').initializer.getText(ast)};const openingWorkspaceReady=${declaration('openingWorkspaceReady').initializer.getText(ast)};${fn('canReplayOpeningNow')};return canReplayOpeningNow();}`);

test('explicit replay accepts mounted unsaved material, hidden drafts and running focus without mutation',()=>{
 const state=structuredClone(defaults),before=structuredClone(state);
 assert.equal(gate(state),true);
 assert.deepEqual(state,before);
});
test('replay still requires a loaded verified owner and no competing popup or navigation',()=>{
 for(const change of [{loading:true},{workspaceReady:false},{localScope:undefined},{progressOwner:{current:'another-owner'}},{openingHostPending:1},{pendingChatArtifact:{id:'next'}},{pendingChatView:'library'},{pendingStudioDraftId:'next'},{pendingInitialPresentation:{current:{artifact:{id:'initial'}}}},{showCreate:true},{showNookCreator:true},{showFocus:true},{showAccount:true},{portal:{}},{chatSending:{current:true}}])assert.equal(gate({...defaults,...change}),false,JSON.stringify(change));
 assert.equal(gate(defaults,'account:changed'),false);
 assert.equal(gate({...defaults,isPublicPreview:true},'account:changed'),false);
});

const {dispatch}=await compile(`export function dispatch(requestOpeningReplay,interruptOpening){return ${declaration('presentAppTarget').initializer.getText(ast)};}`);
test('the opening command never enters ordinary navigation or calls a study tool',async()=>{
 let requests=0;
 const present=dispatch(()=>{requests++;return true;},()=>{throw new Error('Must not navigate');});
 assert.deepEqual(await present({presentation:'opening'}),{status:'queued'});
 assert.equal(requests,1);
 const blocked=dispatch(()=>false,()=>{throw new Error('Must not navigate');});
 await assert.rejects(blocked({presentation:'opening'}),/Close the current popup/);
});
const replayEffect=app.body.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='useEffect'&&node.expression.arguments[0].getText(ast).includes('if(!openingReplayRequest||showAbout)return;')).expression.arguments[0];
const {queue}=await compile(`export function queue(state){let pending;const openingReplayRequest=state.request,showAbout=false,openingReplayState={current:state.latest},openingInterruption=state.interruption;const document={querySelector:()=>state.modal};const requestAnimationFrame=callback=>{pending=callback;return 1;},cancelAnimationFrame=()=>{pending=null;};const setOpeningReplayRequest=value=>state.request=value;const cleanup=(${replayEffect.getText(ast)})();return {flush(){pending?.();},dispose(){cleanup?.();}};}`);
test('queued replay is canceled by an owner change, navigation, another modal or teardown',()=>{
 for(const mode of ['ready','owner','navigation','modal','teardown','unready']){
  let plays=0;
  const state={request:{owner,version:3},latest:{owner,canReplay:()=>true,showAbout:false,replay:()=>plays++},interruption:{current:3},modal:null};
  const pending=queue(state);
  if(mode==='owner')state.latest.owner='account:changed';
  if(mode==='navigation')state.interruption.current++;
  if(mode==='modal')state.modal={};
  if(mode==='unready')state.latest.canReplay=()=>false;
  if(mode==='teardown')pending.dispose();
  pending.flush();
  assert.equal(plays,mode==='ready'?1:0,mode);
 }
});
test('App keeps automatic onboarding disabled and the film separate from the active editor tree',()=>{
 const hook=declaration('openingFilm').initializer;
 const options=hook.arguments[0];
 const eligibility=options.properties.find(property=>property.name?.getText(ast)==='eligible');
 assert.equal(eligibility.initializer.kind,ts.SyntaxKind.FalseKeyword);
 const activeWork=[];
 const visit=node=>{if(ts.isJsxOpeningElement(node)&&node.attributes.properties.some(property=>ts.isJsxAttribute(property)&&property.name.getText(ast)==='className'&&property.initializer?.getText(ast)==='"nooks-active-work"'))activeWork.push(node);ts.forEachChild(node,visit);};visit(app);
 assert.equal(activeWork.length,1);
 const parentText=activeWork[0].parent.getText(ast);
 assert.doesNotMatch(parentText,/openingFilm|OpeningFilm/,'playing must not conditionally replace or unmount the active editor');
});
