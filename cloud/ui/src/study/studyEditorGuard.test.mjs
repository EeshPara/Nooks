import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64'));
const source = fs.readFileSync(new URL('./StudyEditor.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StudyEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(predicate) { let found; function visit(node) { if (predicate(node)) found = node.getText(ast); ts.forEachChild(node, visit); } visit(ast); assert.ok(found); return found; }
const effect = extract(node => ts.isArrowFunction(node) && node.body.getText(ast).includes("const leave = (event: Event)"));
const save = extract(node => ts.isFunctionDeclaration(node) && node.name?.text === 'save');
const validate = extract(node => ts.isFunctionDeclaration(node) && node.name?.text === 'validRecoveredStudyDraft');
const cancel = extract(node => ts.isFunctionDeclaration(node) && node.name?.text === 'cancel');
const { mount, createSave, validRecoveredStudyDraft } = await load(`export const mount=({current,artifact,submitting,window})=>(${effect})(); export const createSave=({submitting,validateStudyArtifact,draft,setErrors,editorRef,setSaving,onSave,onCancel,recovery,artifact,setConflicted=()=>{},copyId={current:"recovered-copy"},closeRequested={current:false},mounted={current:true},cancelRef={current:()=>{}}})=>{${save};return save;}; ${validate}`);
const artifact = { id: 'deck', kind: 'flashcards', title: 'Biology', subject: 'Cells', cards: [{ id: 'one', front: 'Question', back: 'Answer' }] };

test('study-set editing protects unsaved content, in-flight writes, and browser reloads', () => {
  const window = new EventTarget(); let allow = false, confirmations = 0;
  window.confirm = () => { confirmations++; return allow; };
  const current = { current: { draft: structuredClone(artifact), saving: false } }, submitting = { current: false };
  const cleanup = mount({ current, artifact, submitting, window });
  const leave = () => window.dispatchEvent(new Event('nooks:leave-study-editor', { cancelable: true }));
  assert.equal(leave(), true); assert.equal(confirmations, 0);
  current.current.draft.title = 'Unsaved title';
  assert.equal(leave(), false); allow = true; assert.equal(leave(), true);
  current.current.saving = true; assert.equal(leave(), false);
  current.current.saving = false; submitting.current = true; assert.equal(leave(), false);
  const unload = new Event('beforeunload', { cancelable: true });
  // BeforeUnloadEvent.returnValue is writable in browsers; Event's legacy boolean is not.
  Object.defineProperty(unload, 'returnValue', { value: undefined, writable: true });
  window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
  cleanup(); assert.equal(leave(), true);
});
test('rapid study-set submissions produce one write; a failed write retains the draft and allows retry', async () => {
  let reject, resolve, writes = 0, closed = 0, acknowledged = 0; const errors = [];
  const draft = structuredClone(artifact);
  const save = createSave({ submitting: { current: false }, validateStudyArtifact: () => [], draft, artifact,
    setErrors: value => errors.push(value), editorRef: { current: null }, setSaving: () => {},
    onSave: () => { writes++; return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    onCancel: () => closed++, recovery: { acknowledge: () => acknowledged++ } });
  const first = save(); await save(); assert.equal(writes, 1);
  reject(new Error('Offline')); await first; assert.equal(closed, 0); assert.equal(acknowledged, 0); assert.deepEqual(draft, artifact);
  assert.match(errors.at(-1)[0], /draft is still here/);
  const retry = save(); resolve(); await retry; assert.equal(writes, 2); assert.equal(closed, 1); assert.equal(acknowledged, 1);
});
test('recovery accepts incomplete student edits but rejects unrelated or malformed study material', () => {
  assert.equal(validRecoveredStudyDraft({ ...artifact, cards: [{ id: 'one', front: '', back: '' }] }, artifact), true);
  assert.equal(validRecoveredStudyDraft({ ...artifact, id: 'other' }, artifact), false);
  assert.equal(validRecoveredStudyDraft({ ...artifact, cards: [{ id: 'one', front: {}, back: '' }] }, artifact), false);
});
test('a revision conflict can save a separate set and repeated copy attempts keep one new ID', async () => {
  const draft = { ...structuredClone(artifact), revision: 4 }, writes = [], errors = []; let conflicted = false, closed = 0;
  const save = createSave({ submitting: { current: false }, validateStudyArtifact: () => [], draft, artifact,
    setErrors: value => errors.push(value), editorRef: { current: null }, setSaving: () => {}, setConflicted: value => { conflicted = value; }, copyId: { current: 'new-copy' },
    onSave: async value => { writes.push(value); if (writes.length === 1) throw Object.assign(new Error('Changed'), { code: 'REVISION_CONFLICT' }); if (writes.length === 2) throw new Error('Offline'); },
    onCancel: () => closed++, recovery: { acknowledge: () => {} } });
  await save(); assert.equal(conflicted, true); assert.match(errors.at(-1)[0], /keep both versions/);
  await save(true); await save(true);
  assert.equal(closed, 1); assert.deepEqual(writes.map(value => value.id), ['deck', 'new-copy', 'new-copy']);
  assert.equal(writes[1].revision, undefined); assert.equal(writes[2].revision, undefined); assert.equal(draft.revision, 4); assert.equal(draft.id, 'deck');
});

const { editorController } = await load(`export function editorController({draft,artifact,window,onSave,onCancel,recovery}) {
 const submitting={current:false}, closeRequested={current:false}, mounted={current:true}, cancelRef={current:null};
 const validateStudyArtifact=()=>[], setErrors=()=>{}, setSaving=()=>{}, setConflicted=()=>{}, editorRef={current:null}, copyId={current:'copy'};
 ${cancel}
 ${save}
 cancelRef.current=cancel;
 return {cancel,save,closeRequested,mounted};
}`);
function editorHarness() {
 let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
 const state={closed:0,acknowledged:0,confirmed:0,discard:false};
 const draft={...structuredClone(artifact),title:'Unsaved changes'};
 const controller=editorController({draft,artifact,window:{confirm:()=>{state.confirmed++;return state.discard;}},
  onSave:()=>promise,onCancel:()=>state.closed++,recovery:{acknowledge:()=>state.acknowledged++}});
 return {controller,state,resolve,reject};
}
test('study editor keeps a queued close behind its write and closes once after success',async()=>{
 const h=editorHarness(),work=h.controller.save();h.controller.cancel();h.controller.cancel();
 assert.equal(h.controller.closeRequested.current,true);assert.equal(h.state.closed,0);assert.equal(h.state.confirmed,0);
 h.resolve();await work;assert.equal(h.state.closed,1);assert.equal(h.state.acknowledged,1);assert.equal(h.state.confirmed,0);
});
test('failed study editor write asks before a queued dismissal and keeps recovery when declined',async()=>{
 const h=editorHarness(),work=h.controller.save();h.controller.cancel();h.reject(new Error('Offline'));await work;
 assert.equal(h.state.confirmed,1);assert.equal(h.state.closed,0);assert.equal(h.state.acknowledged,0);assert.equal(h.controller.closeRequested.current,false);
 h.state.discard=true;h.controller.cancel();assert.equal(h.state.closed,1);assert.equal(h.state.acknowledged,1);
});
test('a late saved study editor cannot close a replacement surface after unmount',async()=>{
 const h=editorHarness(),work=h.controller.save();h.controller.cancel();h.controller.mounted.current=false;h.resolve();await work;
 assert.equal(h.state.closed,0);
});

const marginEffect=extract(node=>ts.isArrowFunction(node)&&node.body.getText(ast).includes('let startedOutside: boolean | null'));
const { mountMargins }=await load(`export const mountMargins=({document,Element,editorRef,mounted,cancelRef,isTopmostDismissTarget})=>(${marginEffect})();`);
test('editor margin tap uses the guarded close without closing its parent or treating controls as backdrop',()=>{
 class Element { constructor(margin=false){this.margin=margin;} matches(){return this.margin;} }
 const inside=new Element(),control=new Element(),margin=new Element(true),listeners=new Map();let closed=0,topmost=true,popover=false;
 const cleanup=mountMargins({Element,editorRef:{current:{contains:node=>node===inside}},mounted:{current:true},cancelRef:{current:()=>closed++},isTopmostDismissTarget:()=>topmost,
  document:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),querySelectorAll:()=>popover?[{closest:()=>null,getClientRects:()=>[{}]}]:[]}});
 const click=target=>{const e={button:0,target,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};listeners.get('click')(e);return e;};
 click(inside);click(control);assert.equal(closed,0);
 topmost=false;click(margin);topmost=true;popover=true;click(margin);assert.equal(closed,0);popover=false;
 listeners.get('pointerdown')({button:0,target:inside});click(margin);assert.equal(closed,0,'dragging out cannot discard editing');
 const e=click(margin);assert.equal(closed,1);assert.equal(e.prevented,true);assert.equal(e.stopped,true,'parent work surface must stay open');
 cleanup();assert.equal(listeners.size,0);
});
