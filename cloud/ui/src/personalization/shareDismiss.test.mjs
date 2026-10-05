import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('./ShareSpaceDialog.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('ShareSpaceDialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function named(name){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(found);return found;}
const code=ts.transpileModule(`export function create({draftKey,description,includeProgress,dismissedShareDrafts,onPublish,onRevoke,initialShare=null,owner='account:alice',active={current:{owner,mounted:true}}}){
 let share=initialShare;const completed={current:!!share},submitting={current:false};
 const state={closed:0,pending:false,error:''},onClose=()=>state.closed++,setPending=value=>state.pending=value,setError=value=>state.error=value,setShare=value=>share=value,setCopied=()=>{};
 ${named('dismissShare')}
 ${named('publish')}
 ${named('revoke')}
 return {state,dismissShare,publish,revoke};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {create}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('failed sharing preserves the visitor draft by owner when queued dismissal finishes',async()=>{
 const drafts=new Map(),key=JSON.stringify(['account:alice','garden','My nook']);
 const h=create({draftKey:key,description:'Study biology with me',includeProgress:true,dismissedShareDrafts:drafts,onPublish:async()=>{throw new Error('Offline');}});
 await h.publish();h.dismissShare();assert.equal(h.state.closed,1);
 assert.deepEqual(drafts.get(key),{description:'Study biology with me',includeProgress:true});
 assert.equal(drafts.has(JSON.stringify(['account:bob','garden','My nook'])),false);
});
test('successful sharing clears its retained draft and a second rapid publish cannot start',async()=>{
 let resolve,calls=0;const pending=new Promise(yes=>resolve=yes),drafts=new Map([['mine',{description:'Old'}]]);
 const h=create({draftKey:'mine',description:'New',includeProgress:false,dismissedShareDrafts:drafts,onPublish:()=>{calls++;return pending;}});
 const first=h.publish();await h.publish();assert.equal(calls,1);assert.equal(h.state.pending,true);
 resolve({id:'public'});await first;h.dismissShare();assert.equal(h.state.pending,false);assert.equal(h.state.closed,1);assert.equal(drafts.size,0);
});
test('sharing draft retention stays bounded and unpublish success leaves a resumable sharing form',async()=>{
 const drafts=new Map(Array.from({length:12},(_,i)=>[String(i),{description:'Earlier'}]));
 const h=create({draftKey:'mine',description:'New',includeProgress:false,dismissedShareDrafts:drafts,initialShare:{id:'public'},onRevoke:async()=>{}});
 await h.revoke();h.dismissShare();assert.equal(drafts.size,12);assert.equal(drafts.has('0'),false);assert.equal(drafts.get('mine').description,'New');
});
test('late share completion cannot erase a replacement draft after unmount or account change',async()=>{
 for(const end of ['unmount','owner']){
  let resolve;const pending=new Promise(yes=>resolve=yes),drafts=new Map(),active={current:{owner:'account:alice',mounted:true}};
  const h=create({draftKey:'mine',description:'Old',includeProgress:false,dismissedShareDrafts:drafts,active,onPublish:()=>pending});
  const write=h.publish();if(end==='unmount')active.current.mounted=false;else active.current.owner='account:bob';
  drafts.set('mine',{description:'Replacement draft',includeProgress:true});resolve({id:'public'});await write;
  assert.equal(drafts.get('mine').description,'Replacement draft');assert.equal(h.state.closed,0);
 }
});
