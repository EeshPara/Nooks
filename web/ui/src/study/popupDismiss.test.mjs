import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function extract(file,predicate){const ast=ts.createSourceFile(file,fs.readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let text;function visit(node){if(predicate(node,ast))text=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(text);return text;}
const pickerEffect=extract('./MaterialSourcePicker.tsx',(node,ast)=>ts.isArrowFunction(node)&&node.getText(ast).includes("document.addEventListener('click'"));
const closePicker=extract('./CreateMaterial.tsx',node=>ts.isFunctionDeclaration(node)&&node.name?.text==='closePicker');
const closeReview=extract('./NoteWorkspace.tsx',node=>ts.isFunctionDeclaration(node)&&node.name?.text==='closeReview');
const loadReview=extract('./NoteWorkspace.tsx',node=>ts.isFunctionDeclaration(node)&&node.name?.text==='loadReview');
const {createPickerEffect}=await load(`export const createPickerEffect=({document,panel,trigger,close,Node})=>(${pickerEffect});`);
const {createClosePicker}=await load(`export const createClosePicker=({setShowPicker,pickerTrigger})=>(${closePicker});`);
const {createReview}=await load(`export const createReview=({setReviewOpen,setReviewBusy,setReviewError,setReview,readTicket,onRead,artifact,state})=>{${closeReview};${loadReview};return {closeReview,loadReview};};`);

test('source picker closes outside, preserves inside and trigger clicks, and uses capture',()=>{
 class Node{};
 const inside=new Node(),triggerNode=new Node(),outside=new Node();const closes=[];let listener;let removed=false;
 const document={addEventListener(name,callback,capture){assert.equal(name,'click');assert.equal(capture,true);listener=callback;},removeEventListener(name,callback,capture){removed=name==='click'&&callback===listener&&capture===true;}};
 const cleanup=createPickerEffect({document,panel:{current:{contains:node=>node===inside}},trigger:{current:{contains:node=>node===triggerNode}},close:{current:restoreFocus=>closes.push(restoreFocus)},Node})();
 for(const target of [inside,triggerNode])listener({button:0,target});assert.deepEqual(closes,[]);
 listener({button:2,target:outside});assert.deepEqual(closes,[]);
 listener({button:0,target:outside});assert.deepEqual(closes,[false]);
 cleanup();assert.equal(removed,true);
});

test('outside dismissal leaves focus on the clicked field; Done and Escape restore the trigger',()=>{
 let open=true,focuses=0;const selected=['biology-note'];
 const close=createClosePicker({setShowPicker:value=>{open=value;},pickerTrigger:{current:{focus:()=>focuses++}}});
 close(false);assert.equal(open,false);assert.equal(focuses,0);assert.deepEqual(selected,['biology-note']);
 open=true;close();assert.equal(open,false);assert.equal(focuses,1);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function reviewHarness(){const values={open:false,busy:false,error:'',review:null};const artifact={id:'note-1',kind:'note',revision:1,title:'Notes',content:'My draft'};let response=deferred();const controller=createReview({setReviewOpen:value=>{values.open=value;},setReviewBusy:value=>{values.busy=value;},setReviewError:value=>{values.error=value;},setReview:value=>{values.review=value;},readTicket:{current:0},onRead:()=>response.promise,artifact,state:{artifact}});return {values,artifact,controller,get response(){return response;},next(){response=deferred();}};}

test('closing a note comparison during loading ignores its late response and keeps the draft',async()=>{
 const h=reviewHarness();const work=h.controller.loadReview();assert.equal(h.values.open,true);assert.equal(h.values.busy,true);
 h.controller.closeReview();assert.equal(h.values.open,false);assert.equal(h.values.busy,false);
 h.response.resolve({artifact:{...h.artifact,content:'Saved version'},nextOffset:null});await work;
 assert.equal(h.values.open,false);assert.equal(h.values.review,null);assert.equal(h.artifact.content,'My draft');
 h.next();const next=h.controller.loadReview();h.response.resolve({artifact:{...h.artifact,content:'Fresh saved version'},nextOffset:null});await next;
 assert.equal(h.values.open,true);assert.equal(h.values.review.content,'Fresh saved version');assert.equal(h.values.busy,false);
});

test('a failed read after dismissal does not reopen the note comparison or show a stale error',async()=>{
 const h=reviewHarness();const work=h.controller.loadReview();h.controller.closeReview();h.response.reject(new Error('Network unavailable'));await work;
 assert.equal(h.values.open,false);assert.equal(h.values.error,'');assert.equal(h.values.busy,false);assert.equal(h.artifact.content,'My draft');
});
