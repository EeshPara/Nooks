import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createWorkspace } from '../../server/seed.mjs';
import { modelSafeResult } from '../../server/model-result.mjs';

const compile = source => ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022 } }).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64');
const organizationUrl = url(fs.readFileSync(new URL('./organization/types.ts', import.meta.url), 'utf8'));
const normalizeSource = fs.readFileSync(new URL('./workspace-normalize.ts', import.meta.url), 'utf8').replaceAll("from './organization/types'", `from '${organizationUrl}'`);
const { normalizeWorkspace } = await import(url(normalizeSource));
const { readToolResult, readLegacyToolResult, readLegacyToolUpdate } = await import(url(fs.readFileSync(new URL('./tool-result.ts', import.meta.url), 'utf8')));
const { acceptWorkspace } = await import(url(fs.readFileSync(new URL('./workspace-order.ts', import.meta.url), 'utf8')));
// Run the actual App transition with controlled React setters, not a duplicate reducer.
const appAst=ts.createSourceFile('App.tsx',fs.readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let updateExpression;
function findUpdate(node){if(ts.isVariableDeclaration(node)&&node.name.getText(appAst)==='update')updateExpression=node.initializer.getText(appAst);ts.forEachChild(node,findUpdate);}
findUpdate(appAst);
assert.ok(updateExpression);
const dependencies='interruptOpening=()=>{},studioNavigationVersion={current:0},setPendingStudioDraftId=()=>{},isEmbedded=false,isPublicPreview=false,workspaceLoaded={current:true},pendingInitialPresentation={current:undefined},readNativeRecoveryScope=()=>undefined,progressOwner={current:"host"},setError=()=>{},workspaceOrder,acceptWorkspace,normalize,setWorkspace,dirtyNote,studyEditing,setPendingChatArtifact,setPendingChatView,pendingChatReference,notify,readWorkspaceView,openChatArtifact,openChatView,previewArtifacts';
const { createUpdate }=await import(url(`export const createUpdate=({${dependencies}})=>(${updateExpression});`));
function updater(workspace,active){
 const state={workspace,active,page:'home',navigations:0};
 const workspaceOrder={current:{revision:workspace.revision,updatedAt:workspace.updatedAt}};
 const update=createUpdate({previewArtifacts:{current:new WeakSet()},pendingChatReference:{current:undefined},workspaceOrder,acceptWorkspace,normalize:normalizeWorkspace,setWorkspace:fn=>{state.workspace=fn(state.workspace);},dirtyNote:{current:false},studyEditing:{current:false},setPendingChatArtifact:()=>{},setPendingChatView:()=>{},notify:()=>{},readWorkspaceView:()=>undefined,openChatArtifact:value=>{state.active=value;state.page='home';state.navigations++;},openChatView:()=>{}});
 return {state,workspaceOrder,update};
}
const fixture = () => {
 const workspace = createWorkspace('2026-10-03T12:00:00Z');
 workspace.revision = 8;
 workspace.organization = { schemaVersion:1, courses:[{id:'biology',title:'Biology'}], topics:[{id:'cells',courseId:'biology',title:'Cells'}], sessions:[{id:'session-1',title:'Cell energy'}], noteRevisions:[],noteProposals:[] };
 return workspace;
};

test('artwork warning survives brief host updates and clears after a successful full reload',()=>{
 const loaded=normalizeWorkspace({...fixture(),artworkWarnings:[{code:'ARTWORK_UNAVAILABLE',message:'Unavailable'}]});
 assert.equal(loaded.artworkWarnings.length,1);
 const brief=normalizeWorkspace({stats:{xp:42}},loaded);
 assert.equal(brief.artworkWarnings.length,1);
 const restored=normalizeWorkspace(fixture(),brief);
 assert.deepEqual(restored.artworkWarnings,[]);
});

test('model-visible workspace summary can open a note without missing organization arrays', () => {
 const workspace=fixture();
 const result=modelSafeResult({structuredContent:{workspace,artifact:workspace.artifacts[0]}});
 assert.equal(result.structuredContent.workspace.organization.topics,undefined);
 const normalized=normalizeWorkspace(result.structuredContent.workspace);
 assert.deepEqual(normalized.organization.topics,[]);
 assert.deepEqual(normalized.organization.sessions,[]);
 assert.doesNotThrow(()=>normalized.organization.topics.find(topic=>topic.id==='cells'));
 assert.doesNotThrow(()=>normalized.organization.sessions.filter(session=>session.courseId==='biology'));
});

test('abbreviated host updates preserve loaded materials, tasks, topics, and saved sessions', () => {
 const previous=normalizeWorkspace(fixture());
 const result=modelSafeResult({structuredContent:{workspace:fixture()}});
 const next=normalizeWorkspace(result.structuredContent.workspace,previous);
 for(const key of ['artifacts','progress','focusSessions'])assert.strictEqual(next[key],previous[key]);
 assert.strictEqual(next.plan.tasks,previous.plan.tasks);
 for(const key of ['courses','topics','sessions'])assert.strictEqual(next.organization[key],previous.organization[key]);
 assert.equal(next.revision,8);
 assert.equal(previous.organization.topics[0].id,'cells');
});

test('explicit empty collections in a full snapshot still clear deleted records', () => {
 const previous=normalizeWorkspace(fixture());
 const next=normalizeWorkspace({artifacts:[],plan:{tasks:[]},progress:[],focusSessions:[],organization:{courses:[],topics:[],sessions:[]}},previous);
 assert.deepEqual(next.artifacts,[]);
 assert.deepEqual(next.plan.tasks,[]);
 assert.deepEqual(next.organization.topics,[]);
 assert.deepEqual(next.organization.sessions,[]);
});

test('delayed full render response cannot replace newer practice or navigate away',()=>{
 const current={...normalizeWorkspace(fixture()),revision:9};
 const active=current.artifacts[1];
 const harness=updater(current,active);
 harness.update({workspace:fixture(),artifact:fixture().artifacts[0]});
 assert.strictEqual(harness.state.workspace,current);
 assert.strictEqual(harness.state.active,active);
 assert.equal(harness.state.navigations,0);
 const incoming={...fixture().artifacts[0],id:'fresh-preview'};
 harness.update({workspace:{revision:8,organization:{courses:[]}},artifact:incoming});
 assert.strictEqual(harness.state.active,incoming,'abbreviated response may carry independently selected material');
 harness.update({artifact:active});
 assert.strictEqual(harness.state.active,active,'artifact-only response remains supported');
});

test('newer summary cannot advance ordering or prevent the next complete snapshot',()=>{
 const previous=normalizeWorkspace(fixture());
 const summary={revision:10,updatedAt:'2026-10-03T14:00:00Z',organization:{courses:[]}};
 const normalized=normalizeWorkspace(summary,previous);
 assert.equal(normalized.revision,8);
 assert.equal(normalized.updatedAt,previous.updatedAt);
 const harness=updater(previous,previous.artifacts[1]);
 harness.update({workspace:summary});
 assert.equal(harness.state.workspace.revision,8);
 assert.equal(harness.workspaceOrder.current.revision,8);
 const next={...fixture(),revision:9,updatedAt:'2026-10-03T13:00:00Z'};
 harness.update({workspace:next});
 assert.equal(harness.state.workspace.revision,9);
 assert.equal(harness.state.workspace.updatedAt,next.updatedAt);
 assert.equal(harness.workspaceOrder.current.revision,9);
});

test('standard MCP result metadata wins over the model-visible summary', () => {
 const workspace=fixture();
 const result=modelSafeResult({structuredContent:{workspace,artifact:workspace.artifacts[0]}});
 const data=readToolResult(result);
 assert.deepEqual(data.workspace,workspace);
 assert.equal(data.workspace.organization.topics[0].id,'cells');
 assert.equal(data.artifact.id,workspace.artifacts[0].id);
});

test('legacy toolOutput uses separately delivered toolResponseMetadata', () => {
 const workspace=fixture();
 const result=modelSafeResult({structuredContent:{workspace,artifact:workspace.artifacts[0]}});
 const data=readLegacyToolResult(result.structuredContent,result._meta);
 assert.deepEqual(data.workspace,workspace);
 assert.equal(data.artifact.id,workspace.artifacts[0].id);
 assert.deepEqual(readLegacyToolResult(result.structuredContent,undefined),result.structuredContent);
 assert.equal(readLegacyToolResult(undefined,result._meta),undefined);
});

test('cleared or omitted legacy metadata cannot resurrect the previous artifact',()=>{
 const old={artifact:{id:'old'}};
 const current={toolOutput:old,toolResponseMetadata:{notableData:old}};
 const fresh={artifact:{id:'fresh'}};
 assert.deepEqual(readLegacyToolUpdate({toolOutput:fresh,toolResponseMetadata:null},current),fresh);
 assert.deepEqual(readLegacyToolUpdate({toolOutput:fresh},current),fresh);
 assert.equal(readLegacyToolUpdate({toolOutput:null},current),undefined);
 assert.deepEqual(readLegacyToolUpdate({toolResponseMetadata:null},{...current,toolOutput:fresh}),fresh);
 assert.deepEqual(readLegacyToolUpdate({toolResponseMetadata:{notableData:{artifact:{id:'complete'}}}},{toolOutput:fresh}),{artifact:{id:'complete'}});
});

test('tool errors remain errors and malformed message containers cannot crash parsing', () => {
 assert.throws(()=>readToolResult({isError:true,content:{text:'bad format'}}),/could not be completed/);
 assert.throws(()=>readToolResult({structuredContent:{error:'Reconnect to Nooks'}}),/Reconnect to Nooks/);
 assert.deepEqual(readToolResult(null),{});
 assert.deepEqual(readToolResult([]),{});
});
