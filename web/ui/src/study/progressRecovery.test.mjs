import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const ast = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let flushSource, discardSource, downloadSource;
function visit(node) { if (ts.isFunctionDeclaration(node)) { if(node.name?.text === 'flushProgress') flushSource = node.getText(ast); if(node.name?.text === 'discardConflictedProgress') discardSource = node.getText(ast); if(node.name?.text === 'downloadConflictedProgress') downloadSource = node.getText(ast); } ts.forEachChild(node, visit); }
visit(ast); assert.ok(flushSource);
const { create } = await load(`export const create=({pendingProgress,progressRecovery,callTool,setError,notify,canFlushProgress=()=>true,progressConflicts={current:new Map()},setProgressConflictCount=()=>{},setPendingProgressCount=()=>{}})=>{const progressRecoveryRef={current:progressRecovery},progressFlush={current:null},setSaving=()=>{},update=value=>value;${flushSource};return flushProgress;};`);
const { createPendingStudyStore } = await load(fs.readFileSync(new URL('./pendingStudyStore.ts', import.meta.url), 'utf8'));
const event = { sessionId: 'study-session', artifactId: 'quiz-one', artifactRevision: 1, kind: 'quiz', score: 1, total: 2, xp: 15, answers: { q1: 'Cell', q2: 'Wall' } };

test('failed and unconfirmed result writes preserve the same session and evidence for retry', async () => {
  const recovery = createPendingStudyStore('host', 'results', undefined, new Map());
  recovery.retain(event.sessionId, event);
  const pendingProgress = { current: new Map([[event.sessionId, event]]) }, notices = [], errors = [], calls = [];
  let reply;
  const flush = create({ pendingProgress, progressRecovery: recovery, callTool: async (name, args) => { calls.push({ name, args }); return reply; }, setError: value => errors.push(value), notify: value => notices.push(value) });
  reply = {};
  await assert.rejects(flush(), /could not be confirmed/);
  assert.equal(pendingProgress.current.size, 1); assert.deepEqual(recovery.get(event.sessionId), event); assert.deepEqual(notices, []);
  reply = { progressEvent: { ...event, xp: 0 }, duplicate: true };
  const saved = await flush();
  assert.equal(pendingProgress.current.size, 0); assert.equal(recovery.get(event.sessionId), undefined); assert.equal(saved.get(event.sessionId).xp, 0);
  assert.deepEqual(calls.map(call => call.args), [event, event]); assert.deepEqual(notices, ['Practice saved.']);
});
test('overlapping result flushes share one confirmed submission', async () => {
  let resolve, count = 0;
  const recovery = createPendingStudyStore('host', 'results', undefined, new Map()); recovery.retain(event.sessionId, event);
  const flush = create({ pendingProgress: { current: new Map([[event.sessionId, event]]) }, progressRecovery: recovery,
    callTool: () => { count++; return new Promise(yes => { resolve = yes; }); }, setError: () => {}, notify: () => {} });
  const one = flush(), two = flush(); assert.equal(count, 1);
  resolve({ progressEvent: event }); await Promise.all([one, two]); assert.equal(count, 1); assert.equal(recovery.get(event.sessionId), undefined);
});


test('an account switch during a result response retains both old-account results and never sends the next one', async () => {
 let active=true,resolve,count=0;
 const second={...event,sessionId:'second-session'};
 const recovery=createPendingStudyStore('account:alice','results',undefined,new Map());recovery.retain(event.sessionId,event);recovery.retain(second.sessionId,second);
 const pendingProgress={current:new Map([[event.sessionId,event],[second.sessionId,second]])};
 const flush=create({pendingProgress,progressRecovery:recovery,canFlushProgress:()=>active,callTool:()=>{count++;return new Promise(yes=>{resolve=yes;});},setError:()=>{},notify:()=>{}});
 const task=flush();active=false;resolve({progressEvent:event});await assert.rejects(task,/workspace changed/);
 assert.equal(count,1);assert.equal(pendingProgress.current.size,2);assert.deepEqual(recovery.get(event.sessionId),event);assert.deepEqual(recovery.get(second.sessionId),second);
});

for (const code of ['REVISION_CONFLICT', 'NOT_FOUND']) {
 test(`${code} keeps the original result and lets later valid sessions save`,async()=>{
  const recovery=createPendingStudyStore('host','results',undefined,new Map());
  const next={...event,sessionId:'new-session',artifactRevision:2};
  recovery.retain(event.sessionId,event);recovery.retain(next.sessionId,next);
  const pendingProgress={current:new Map([[event.sessionId,event],[next.sessionId,next]])},progressConflicts={current:new Map()},calls=[];
  const flush=create({pendingProgress,progressRecovery:recovery,progressConflicts,callTool:async(name,args)=>{calls.push(args);if(args===event)throw Object.assign(new Error('The original material is unavailable.'),{code});return {progressEvent:next};},setError:()=>{},notify:()=>{}});
  const result=await flush();
  assert.equal(result.get(next.sessionId).artifactRevision,2);
  assert.equal(pendingProgress.current.size,1);assert.deepEqual(recovery.get(event.sessionId),event);
  assert.equal(recovery.get(next.sessionId),undefined);assert.equal(progressConflicts.current.size,1);
  await flush();assert.deepEqual(calls,[event,next],'permanent conflicts are retained, not endlessly retried or relabeled');
 });
}

test('legacy result confirmed by its exact server checkpoint is acknowledged on the first response',async()=>{
 const {artifactRevision,...legacy}=event;
 const recovery=createPendingStudyStore('host','results',undefined,new Map());recovery.retain(legacy.sessionId,legacy);
 const pendingProgress={current:new Map([[legacy.sessionId,legacy]])};let submitted;
 const flush=create({pendingProgress,progressRecovery:recovery,callTool:async(name,args)=>{submitted=args;return {progressEvent:event,revisionSource:'checkpoint'};},setError:()=>{},notify:()=>{}});
 const saved=await flush();assert.equal(saved.get(event.sessionId).artifactRevision,1);
 assert.equal(Object.hasOwn(submitted,'artifactRevision'),false,'never fill in a new revision on the pending event');
 assert.equal(pendingProgress.current.size,0);assert.equal(recovery.get(legacy.sessionId),undefined);
});

test('an unconfirmed revision or generic successful legacy reply cannot erase queued evidence',async()=>{
 const {artifactRevision,...legacy}=event;
 for(const [outgoing,reply] of [[event,{progressEvent:{...event,artifactRevision:2}}],[legacy,{progressEvent:event}]]){
  const recovery=createPendingStudyStore('host','results',undefined,new Map());recovery.retain(outgoing.sessionId,outgoing);
  const flush=create({pendingProgress:{current:new Map([[outgoing.sessionId,outgoing]])},progressRecovery:recovery,callTool:async()=>reply,setError:()=>{},notify:()=>{}});
  await assert.rejects(flush(),/could not be confirmed/);assert.deepEqual(recovery.get(outgoing.sessionId),outgoing);
 }
});

test('pre-upgrade committed history is acknowledged without retroactively adding a revision',async()=>{
 const {artifactRevision,...legacy}=event;
 const recovery=createPendingStudyStore('host','results',undefined,new Map());recovery.retain(event.sessionId,event);
 const flush=create({pendingProgress:{current:new Map([[event.sessionId,event]])},progressRecovery:recovery,callTool:async()=>({duplicate:true,progressEvent:legacy}),setError:()=>{},notify:()=>{}});
 const saved=await flush();assert.deepEqual(saved.get(event.sessionId),legacy);assert.equal(recovery.get(event.sessionId),undefined);
});

test('owner changes and transient failures cannot classify work as permanently conflicted',async()=>{
 for(const code of ['BACKEND_UNAVAILABLE','AUTH_REQUIRED','FORBIDDEN']){
  const progressConflicts={current:new Map()},recovery=createPendingStudyStore('host','results',undefined,new Map());recovery.retain(event.sessionId,event);
  const flush=create({pendingProgress:{current:new Map([[event.sessionId,event]])},progressRecovery:recovery,progressConflicts,callTool:async()=>{throw Object.assign(new Error('Retry later'),{code});},setError:()=>{},notify:()=>{}});
  await assert.rejects(flush(),/Retry later/);assert.equal(progressConflicts.current.size,0);assert.deepEqual(recovery.get(event.sessionId),event);
 }
 let owner=true;const progressConflicts={current:new Map()},recovery=createPendingStudyStore('account:alice','results',undefined,new Map());recovery.retain(event.sessionId,event);
 const flush=create({pendingProgress:{current:new Map([[event.sessionId,event]])},progressRecovery:recovery,progressConflicts,canFlushProgress:()=>owner,callTool:async()=>{owner=false;throw Object.assign(new Error('Changed'),{code:'REVISION_CONFLICT'});},setError:()=>{},notify:()=>{}});
 await assert.rejects(flush(),/workspace changed/);assert.equal(progressConflicts.current.size,0);assert.deepEqual(recovery.get(event.sessionId),event);
});

const {createDiscard,createDownload}=await load(`export const createDiscard=({pendingProgress,progressConflicts,progressRecovery,canFlushProgress=()=>true,confirm=()=>false})=>{const progressRecoveryRef={current:progressRecovery},window={confirm},setError=()=>{},setProgressConflictCount=()=>{},setPendingProgressCount=()=>{};${discardSource};return discardConflictedProgress;};export const createDownload=({pendingProgress,progressConflicts,canFlushProgress=()=>true,URL,Blob,document,setTimeout})=>{${downloadSource};return downloadConflictedProgress;};`);

test('discard needs explicit confirmation and only removes the conflicted results',()=>{
 const next={...event,sessionId:'waiting-online'},recovery=createPendingStudyStore('host','results',undefined,new Map());recovery.retain(event.sessionId,event);recovery.retain(next.sessionId,next);
 const pendingProgress={current:new Map([[event.sessionId,event],[next.sessionId,next]])},progressConflicts={current:new Map([[event.sessionId,'Changed material']])};
 let confirm=false;const discard=createDiscard({pendingProgress,progressConflicts,progressRecovery:recovery,confirm:()=>confirm});
 discard();assert.equal(pendingProgress.current.size,2);assert.deepEqual(recovery.get(event.sessionId),event);
 confirm=true;discard();assert.equal(pendingProgress.current.size,1);assert.deepEqual(recovery.get(next.sessionId),next);assert.equal(recovery.get(event.sessionId),undefined);
});

test('download preserves original result evidence and does not claim a saved score or complete source',()=>{
 let exported,name;const pendingProgress={current:new Map([[event.sessionId,event]])},progressConflicts={current:new Map([[event.sessionId,'The material changed.']])};
 const download=createDownload({pendingProgress,progressConflicts,URL:{createObjectURL:blob=>{exported=JSON.parse(blob.parts[0]);return 'blob:test';},revokeObjectURL:()=>{}},Blob:class{constructor(parts){this.parts=parts;}},document:{createElement:()=>({click(){name=this.download;}})},setTimeout:()=>{}});
 download();assert.equal(name,'nooks-unsaved-results.json');assert.deepEqual(exported.results,[{...event,recorded:false,reason:'The material changed.'}]);assert.equal(pendingProgress.current.size,1);
});
