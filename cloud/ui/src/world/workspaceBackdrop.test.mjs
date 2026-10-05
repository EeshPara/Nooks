import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const source=fs.readFileSync(new URL('./useWorkspaceBackdropDismiss.ts',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace('export function','function');
const {create}=await load(`export const create=({useRef,document,Element})=>{${source};return useWorkspaceBackdropDismiss;};`);
function harness({enabled=true,blocked=false,editor=false,popup=false}={}){
 class Element{constructor(name,within=true){this.name=name;this.within=within;}matches(selectors){return selectors.split(',').map(v=>v.trim()).includes(this.name);}closest(){return this.hidden?{}:null;}getClientRects(){return this.visible===false?[]:[{}];}}
 const panel=new Element('popup');const root=new Element('app');root.contains=target=>target===root||target.within;root.querySelector=()=>editor?{}:null;
 let count=0;const use=create({useRef:value=>({current:value}),document:{querySelectorAll:()=>popup?[panel]:[]},Element});
 const handlers=use(enabled,()=>count++,blocked);const event=(name,extra={})=>({button:0,target:name==='app'?root:new Element(name),currentTarget:root,...extra});
 return {handlers,event,panel,get count(){return count;}};
}

test('only genuine workspace margins dismiss active work, including click-only host events',()=>{
 for(const target of ['app','.world-main','.page-content','.nooks-active-work','.nooks-study-primary','.study-workspace','.study-dismiss-toolbar','[data-workspace-backdrop]']){const h=harness();h.handlers.onClickCapture(h.event(target));assert.equal(h.count,1,target);}
 for(const target of ['.nooks-document','.nooks-cards','.nooks-quiz','button','input','textarea','.nooks-shell-header','.nooks-utility-bar','.modal','.workspace-footer']){const h=harness();h.handlers.onClickCapture(h.event(target));assert.equal(h.count,0,target);}
});

test('dragging out from paper or cancelling a pointer never closes the workspace',()=>{
 const h=harness();h.handlers.onPointerDownCapture(h.event('textarea'));h.handlers.onClickCapture(h.event('.world-main'));assert.equal(h.count,0);
 h.handlers.onPointerDownCapture(h.event('.world-main'));h.handlers.onPointerCancelCapture();h.handlers.onClickCapture(h.event('.world-main'));assert.equal(h.count,0);
 h.handlers.onPointerDownCapture(h.event('.world-main'));h.handlers.onClickCapture(h.event('.world-main'));assert.equal(h.count,1);
});

test('popups, study-set editing, inactive pages and non-left clicks keep active work open',()=>{
 for(const options of [{enabled:false},{blocked:true},{editor:true},{popup:true}]){const h=harness(options);h.handlers.onClickCapture(h.event('.world-main'));assert.equal(h.count,0,JSON.stringify(options));}
 const h=harness();h.handlers.onClickCapture(h.event('.world-main',{button:2}));assert.equal(h.count,0);
 const hidden=harness({popup:true});hidden.panel.hidden=true;hidden.handlers.onClickCapture(hidden.event('.world-main'));assert.equal(hidden.count,1,'an inert/hidden Music dialog does not block dismissal forever');
});

const app=ts.createSourceFile('App.tsx',fs.readFileSync(new URL('../App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let dismiss;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='dismissActiveWork')dismiss=node.getText(app);ts.forEachChild(node,visit);}visit(app);assert.ok(dismiss);
const {createDismiss}=await load(`export const createDismiss=({setPendingChatArtifact,dirtyNote,setPendingChatView,notify,openChatView})=>(${dismiss});`);

test('backdrop return defers dirty notes to existing autosave navigation and immediately returns clean notes',()=>{
 const state={pendingArtifact:{id:'later'},pendingView:null,opened:null,dirty:true};const dirtyNote={current:true};
 const close=createDismiss({setPendingChatArtifact:value=>{state.pendingArtifact=value;},dirtyNote,setPendingChatView:value=>{state.pendingView=value;},notify:()=>{},openChatView:value=>{state.opened=value;}});
 close();assert.equal(state.pendingArtifact,null);assert.equal(state.pendingView,'study');assert.equal(state.opened,null);assert.equal(dirtyNote.current,true,'never marks unsaved writing clean');
 dirtyNote.current=false;close();assert.equal(state.pendingView,null);assert.equal(state.opened,'study');
});
