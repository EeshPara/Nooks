/** Execute the actual App callback and Studio preview source; no browser/provider transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../App.tsx',import.meta.url),'utf8'),studio=await readFile(new URL('./NookStudio.tsx',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const body=app.split('onPreview={async(next,presentation)=>{')[1].split('}} onPublished=')[0];
const preview=studio.slice(studio.indexOf('  async function preview() {'),studio.indexOf('  async function reviewPublication()'));
const draft={id:'draft-fixture',title:'New personal look',description:'',revision:1,artworkMode:'curated',space:{room:'rainy-library'}};
function fixture({allow=true,transport=async()=>{}}={}){
 const state={current:true,calls:[],notice:null,draftSaves:0,navigations:0,space:null,selected:{id:'community-fixture',title:'Community title',roomId:'rainy-library',joined:true},secret:{id:'moonstone-annex',parent:'rainy-library'},track:'earned-track',membership:true,focusSession:{id:'running-focus',nookId:'community-fixture',roomId:'rainy-library'}};
 const record=(key,value)=>state.calls.push([key,value]);
 const env={canNavigate:()=>{state.navigations++;return allow},perform:async(tool,args)=>{record(tool,args);await transport();state.space=args.space;},live:{select:value=>{record('select',value);state.selected=undefined},leave:()=>assert.fail('Personal appearance must not leave membership')},setSecretRoom:value=>{state.secret=value;record('secret',value)},setEarnedTrack:value=>{state.track=value;record('track',value)},setActiveDraftId:value=>record('draft',value),writeLocalWorkspaceState:(_scope,key,value)=>record(key,value),localScope:'fixture',setShowNookCreator:value=>record('studio',value),setPage:value=>record('page',value),setActive:value=>record('active',value),setZen:value=>record('zen',value)};
 const execute=new AsyncFunction('next','presentation',...Object.keys(env),body);
 const apply=next=>execute(next,{isCurrent:()=>state.current},...Object.values(env));
 const runPreview=async(callback=apply)=>{
  const deps={onPreview:callback,owner:'fixture',visibility:{current:{epoch:1}},operate:async(_key,fn)=>fn(),save:async()=>{state.draftSaves++;return draft},resultData:x=>x,onTool:async()=>({draft}),currentPresentation:()=>state.current,setConflict:()=>assert.fail('No conflict expected'),draftAppearance:value=>({...value.space,name:value.title,tagline:value.description}),setNotice:value=>{state.notice=value}};
  return new AsyncFunction(...Object.keys(deps),preview+';await preview();')(...Object.values(deps));
 };
 return {state,apply,runPreview};
}
test('navigation refusal preserves editor, selected room and running focus without claiming appearance save',async()=>{
 const f=fixture({allow:false}),focus=f.state.focusSession;await f.runPreview();assert.equal(f.state.draftSaves,1);assert.equal(f.state.calls.length,0);assert.equal(f.state.notice,null);assert.equal(f.state.selected.id,'community-fixture');assert.equal(f.state.secret.id,'moonstone-annex');assert.equal(f.state.focusSession,focus);
});
test('stale presentation is rejected before asking to navigate or saving appearance',async()=>{
 const f=fixture();f.state.current=false;assert.equal(await f.apply(draft.space),false);assert.equal(f.state.navigations,0);assert.equal(f.state.calls.length,0);
});
test('failed appearance save cannot clear room state or report success',async()=>{
 const f=fixture({transport:async()=>{throw Error('save failed')}});await assert.rejects(f.runPreview(),/save failed/);assert.deepEqual(f.state.calls.map(x=>x[0]),['space_customize']);assert.equal(f.state.notice,null);assert.ok(f.state.selected);assert.ok(f.state.secret);assert.equal(f.state.track,'earned-track');
});
test('successful current save clears selection/secret/track only afterward and preserves running focus/membership',async()=>{
 let release;const waiting=new Promise(resolve=>{release=resolve});const f=fixture({transport:()=>waiting}),focus=f.state.focusSession;
 const pending=f.runPreview();for(let i=0;i<10;i++)await Promise.resolve();assert.deepEqual(f.state.calls.map(x=>x[0]),['space_customize']);assert.ok(f.state.selected);assert.ok(f.state.secret);
 release();await pending;assert.equal(f.state.selected,undefined);assert.equal(f.state.secret,null);assert.equal(f.state.track,null);assert.equal(f.state.notice,'Your study backdrop is saved.');assert.equal(f.state.focusSession,focus);assert.equal(f.state.membership,true);assert.ok(f.state.calls.some(([name,value])=>name==='page'&&value==='home'));
});
test('presentation closed or owner changed during save does not transition newer UI or emit success',async()=>{
 let release;const waiting=new Promise(resolve=>{release=resolve});const f=fixture({transport:()=>waiting});const pending=f.runPreview();for(let i=0;i<10;i++)await Promise.resolve();f.state.current=false;release();await pending;assert.equal(f.state.notice,null);assert.deepEqual(f.state.calls.map(x=>x[0]),['space_customize']);assert.ok(f.state.selected);assert.ok(f.state.secret);
});
test('Studio also checks current presentation after a nominally successful callback',async()=>{
 const f=fixture();await f.runPreview(async()=>{f.state.current=false;return true});assert.equal(f.state.notice,null);
});
test('same-room apply actually removes stale title/image overrides and future community focus selection',async()=>{
 const f=fixture();await f.runPreview();
 const secretExpr=app.match(/ const secret=(.*);\n/)[1],imageExpr=app.match(/ const sceneImage=(.*);\n/)[1],nameExpr=app.match(/ const sceneName=(.*);\n/)[1];
 const render=new Function('secretRoom','currentRoomId','selectedLiveNook','space','secretScenes','getRoomImage','activeDraft','defaultSpace','roomScene',`const secret=${secretExpr};return {image:${imageExpr},name:${nameExpr}};`);
 const view=render(f.state.secret,'rainy-library',f.state.selected,f.state.space,{'moonstone-annex':{title:'Moonstone annex',image:'old-secret'}},()=> 'new-look',null,{name:'My study nook'},{title:'Rainy library'});
 assert.deepEqual(view,{image:'new-look',name:'New personal look'});assert.equal(!!(f.state.selected?.joined&&f.state.selected.roomId==='rainy-library'),false);assert.equal(f.state.focusSession.nookId,'community-fixture');
});
