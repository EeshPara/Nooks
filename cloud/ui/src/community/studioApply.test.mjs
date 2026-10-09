import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {SupabaseStore} from '../../../server/supabase-store.mjs';
import {NookCreator} from '../../../server/nook-creator.mjs';
import {StudyEngine} from '../../../server/engine.mjs';
import {createWorkspace} from '../../../server/seed.mjs';
import {createSitesIdentityResolver,sha256} from '../../../server/supabase-auth.mjs';
const parse=path=>ts.createSourceFile(path,fs.readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const studio=parse('./NookStudio.tsx'),app=parse('../App.tsx');
function find(ast,predicate){let value;function walk(n){if(predicate(n))value=n;ts.forEachChild(n,walk);}walk(ast);assert.ok(value);return value;}
const named=name=>find(studio,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(studio);
const component=find(app,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(app)==='NookStudio');
const parentPreview=component.attributes.properties.find(n=>ts.isJsxAttribute(n)&&n.name.text==='onPreview').initializer.expression.getText(app);
const code=ts.transpileModule(`export function makeStudio(draft,onTool,perform){
 const owner='alice',visibility={current:{epoch:0,visible:true}},state={error:'',notice:'',home:false,saved:false,selected:'community-fixture',secret:'moonstone-annex',track:'earned-track',selectionCalls:[],focusSession:{id:'running-focus',nookId:'community-fixture'},membership:true};
 const currentOwner=()=>true,save=async()=>draft,resultData=x=>x,canNavigate=()=>true,localScope='alice';
 const originalPerform=perform;perform=async(...args)=>{const result=await originalPerform(...args);state.saved=true;return result;};
 const afterSave=()=>{if(!state.saved)throw new Error('Room state changed before appearance save');};
 const live={select:value=>{afterSave();state.selected=value;state.selectionCalls.push(value);},leave:()=>{throw new Error('Personal look must not leave community');}};
 const setSecretRoom=value=>{afterSave();state.secret=value;},setEarnedTrack=value=>{afterSave();state.track=value;};
 const setActiveDraftId=()=>{},writeLocalWorkspaceState=()=>{},setShowNookCreator=()=>{},setPage=x=>state.home=x==='home',setActive=()=>{},setZen=()=>{},setConflict=x=>state.conflict=x,setNotice=x=>state.notice=x;
 const operate=async(key,work)=>{try{await work();}catch(e){state.error=e.message;}};
 const onPreview=${parentPreview};
 ${named('draftAppearance')}
 ${named('currentPresentation')}
 ${named('preview')}
 return{preview,state};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {makeStudio}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function assertApplied(state){assert.equal(state.saved,true);assert.equal(state.selected,undefined);assert.deepEqual(state.selectionCalls,[undefined]);assert.equal(state.secret,null);assert.equal(state.track,null);assert.deepEqual(state.focusSession,{id:'running-focus',nookId:'community-fixture'});assert.equal(state.membership,true);assert.equal(state.notice,'Your study backdrop is saved.');}
const ACCOUNT='00000000-0000-4000-8000-000000000001',DRAFT='10000000-0000-4000-8000-000000000001',GENERATION='20000000-0000-4000-8000-000000000001';
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgo=','base64')),image='data:image/png;base64,iVBORw0KGgo=',clock=()=>new Date('2026-10-08T00:00:00Z');
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
async function fixture({generation=false,missing=false,curated=false}={}){
 const origin='https://nooks-test.supabase.co',serviceKey='sb_secret_test_only';
 const identity=await createSitesIdentityResolver({url:origin,serviceKey,namespace:'sites:apply-test',trustedBoundary:'sites-dispatcher',fetchImpl:async()=>json({id:ACCOUNT})})({subject:'fixture-alice'});
 const ref={path:`${ACCOUNT}/${await sha256(bytes)}${generation?'/'+GENERATION:''}`,mime:'image/png'};
 const workspace=createWorkspace(clock().toISOString());workspace.artifacts=[];workspace.space={...workspace.space,_storedBackground:ref};
 const draft={id:DRAFT,title:'My quiet corner',description:'Stay and study',revision:2,style:'illustration',artworkMode:curated?'curated':'upload',visibility:'private',scenePrompt:'Private prompt',pathTemplate:'none',space:{...workspace.space,room:'rainy-library',...(curated?{backgroundImage:''}:{_storedBackground:ref})}};if(curated)delete draft.space._storedBackground;
 workspace.nookCreator={schemaVersion:1,drafts:[draft],publicationIntents:[]};let record={revision:7,workspace};const commits=[],requests=[];
 const store=new SupabaseStore({url:origin,serviceKey,identity,clock,fetchImpl:async(url,options)=>{
  requests.push({url,options});
  if(url.endsWith('nooks_workspace_read'))return json(record);
  if(url.endsWith('nooks_workspace_commit')){const body=JSON.parse(options.body);commits.push(body);record={revision:body.p_expected_revision+1,workspace:body.p_workspace};return json({committed:true});}
  if(url.includes('/storage/v1/object/authenticated/'))return missing?new Response('missing',{status:404}):new Response(bytes);
  assert.fail(`Unexpected request ${url}`);
 }});
 return{store,identity,ref,commits,requests,creator:new NookCreator(store,{clock}),engine:new StudyEngine(store,{clock})};
}
for(const generation of [false,true])test(`hydrated ${generation?'generation':'legacy'} custom artwork applies through real creator, Studio, App and engine`,async()=>{
 const f=await fixture({generation}),loaded=await f.creator.call('nook_draft_preview',{draftId:DRAFT},f.identity);
 assert.deepEqual(loaded.draft.space._storedBackground,f.ref);assert.equal(loaded.draft.space.backgroundImage,image);
 await assert.rejects(f.engine.call('space_customize',{space:{...loaded.draft.space,name:loaded.draft.title,tagline:loaded.draft.description}},f.identity),{code:'INVALID_INPUT'});assert.equal(f.commits.length,0,'old spread fails before committing');
 let sent;const h=makeStudio(loaded.draft,(name,args)=>f.creator.call(name,args,f.identity),(name,args)=>{sent=args.space;return f.engine.call(name,args,f.identity);});await h.preview();assert.equal(h.state.error,'');assert.equal(h.state.home,true);assertApplied(h.state);assert.equal(f.commits.length,1);assert.equal(sent.backgroundImage,image);assert.equal(sent.name,'My quiet corner');assert.equal(sent.tagline,'Stay and study');assert.equal('_storedBackground'in sent,false);assert.doesNotMatch(JSON.stringify(sent),/Private prompt|image\/png","path/);
 assert.deepEqual(f.commits[0].p_workspace.space._storedBackground,f.ref);assert.equal(f.commits[0].p_workspace.space.backgroundImage,undefined);
 const reopened=await f.store.read(f.identity.id);assert.equal(reopened.space.backgroundImage,image);assert.equal(reopened.space.name,'My quiet corner');assert.equal(f.requests.some(r=>r.options?.method==='POST'&&r.url.includes('/storage/')),false);
});
test('gallery apply clears existing custom artwork while missing custom pixels refuse to apply',async()=>{
 const gallery=await fixture({curated:true}),loaded=await gallery.creator.call('nook_draft_preview',{draftId:DRAFT},gallery.identity);const h=makeStudio(loaded.draft,(name,args)=>gallery.creator.call(name,args,gallery.identity),(name,args)=>gallery.engine.call(name,args,gallery.identity));await h.preview();assert.equal(h.state.error,'');assertApplied(h.state);assert.equal(gallery.commits.length,1);assert.equal(gallery.commits[0].p_workspace.space._storedBackground,undefined);
 const missing=await fixture({missing:true}),unavailable=await missing.creator.call('nook_draft_preview',{draftId:DRAFT},missing.identity);const blocked=makeStudio(unavailable.draft,(name,args)=>missing.creator.call(name,args,missing.identity),()=>assert.fail('missing pixels must not apply'));await blocked.preview();assert.match(blocked.state.error,/Choose your finished image/);assert.equal(missing.commits.length,0);assert.equal(blocked.state.saved,false);assert.equal(blocked.state.notice,'');assert.equal(blocked.state.selected,'community-fixture');assert.equal(blocked.state.secret,'moonstone-annex');assert.equal(blocked.state.track,'earned-track');assert.deepEqual(blocked.state.selectionCalls,[]);
});
