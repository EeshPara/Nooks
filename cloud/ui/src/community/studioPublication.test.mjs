import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./NookStudio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('NookStudio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function named(name) { let value;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)value=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(value,name);return value; }
const code = ts.transpileModule(`export function create(draft,onTool,initial={}) {
 let review=initial.review??null,intent=initial.intent??null,readiness=initial.readiness??null,publications=initial.publications??[],canPublish=initial.canPublish??true;
 const owner='account:alice',state={stage:'edit',published:null,callbacks:[],error:'',conflict:null,readiness:null,review:null,publications:[]};let current='account:alice';
 const currentOwner=scope=>scope===current,save=async()=>draft,resultData=x=>x,publicationPending=item=>['prepared','publishing','retry-needed'].includes(item.status),requests={current:new Map()};
 const visibility={current:{visible:true,epoch:0}};
 ${named('currentPresentation')}
 const setNotice=x=>state.notice=x,onPreview=initial.onPreview;
 const operate=async(key,work)=>{state.error='';try{await work();}catch(e){state.error=e.message;}};
 const setReview=x=>{state.review=review=x;},setIntent=x=>{state.intent=intent=x;},setReadiness=x=>{state.readiness=readiness=x;},setStage=x=>state.stage=x,setDrafts=x=>state.drafts=x,setConflict=x=>state.conflict=x;
 const setPublications=fn=>{state.publications=publications=typeof fn==='function'?fn(publications):fn;},setPublished=x=>state.published=x,onPublished=x=>state.callbacks.push(x);
 ${named('draftAppearance')}
 ${named('preview')}
 ${named('reviewPublication')}
 ${named('prepare')}
 ${named('publish')}
 return {state,preview,reviewPublication,prepare,publish,hide:()=>{visibility.current.visible=false;visibility.current.epoch++;},reopen:()=>{visibility.current.visible=true;visibility.current.epoch++;},changeOwner:()=>{current='account:bob';}};
}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {create} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const draft = {id:'draft-a',title:'Rainy Bookshop',description:'Books and quiet',revision:3,space:{room:'autumn-bookshop',backgroundImage:'data:image/png;base64,aA=='},artworkMode:'chatgpt',visibility:'private'};
const ready={readyToPublish:true,blockers:[]},blocked={readyToPublish:false,blockers:[{code:'FEATURE_UNAVAILABLE',message:'Update the community backend before publishing this artwork.'}]};
const publication={id:'intent-a',draftId:draft.id,draftRevision:3,visibility:'private',status:'prepared',manifest:{title:draft.title,description:draft.description,roomId:'custom',visibility:'private',scene:{generation:'private-generation',appearance:{name:draft.title}}}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('custom artwork can be reviewed but cannot publish before server readiness allows it',async()=>{
 const calls=[];const studio=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_draft_preview')return {draft,readiness:blocked};assert.fail('Publication must not be sent');});
 await studio.reviewPublication();assert.equal(studio.state.stage,'review');assert.deepEqual(studio.state.readiness.blockers,blocked.blockers);
 await studio.prepare();await studio.publish();assert.equal(calls.length,1);assert.equal(studio.state.callbacks.length,0);
});
test('custom artwork keeps separate explicit review and audience confirmation before publishing',async()=>{
 const calls=[];const nook={id:'published-a',title:draft.title,roomId:'custom',joined:true,visibility:'private',scene:{id:'scene-a',snapshotHash:'a'.repeat(64)}};
 const studio=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_draft_preview')return {draft,readiness:ready};if(name==='nook_publish_prepare')return {prepared:true,publication};if(name==='nook_publish_commit')return {publication:{...publication,status:'published',nookId:nook.id},nook};assert.fail(name);});
 await studio.reviewPublication();assert.equal(calls.length,1);assert.equal(studio.state.stage,'review');
 await studio.prepare();assert.equal(studio.state.stage,'confirm');assert.deepEqual({...calls[1].args,requestId:'stable-id'},{draftId:'draft-a',expectedRevision:3,requestId:'stable-id',visibility:'private',reviewed:true});assert.equal(studio.state.callbacks.length,0);
 await studio.publish();assert.deepEqual(calls[2],{name:'nook_publish_commit',args:{intentId:'intent-a',confirmed:true}});assert.deepEqual(studio.state.callbacks,[nook]);assert.equal(studio.state.stage,'published');
});
test('a publication timeout recovers the same receipt without exposing owner manifest details as a scene',async()=>{
 const calls=[];const studio=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_publish_commit')throw new Error('Network lost');if(name==='nook_drafts_list')return {drafts:[],publications:[{...publication,status:'published',nookId:'published-a'}]};assert.fail(name);},{review:draft,readiness:ready,intent:publication});
 await studio.publish();assert.equal(studio.state.stage,'published');assert.equal(studio.state.error,'');assert.deepEqual(studio.state.callbacks,[{id:'published-a',title:draft.title,description:draft.description,roomId:'custom',visibility:'private',joined:true}]);
 assert.equal(JSON.stringify(studio.state.callbacks).includes('private-generation'),false);assert.equal(calls.length,2);
});
test('a retry uses the already reviewed intent and never prepares a second community',async()=>{
 const calls=[];let fail=true;const studio=create(draft,async(name,args)=>{calls.push({name,args});if(name==='nook_publish_commit'){if(fail)throw new Error('Offline');return {publication:{...publication,status:'published',nookId:'published-a'}};}if(name==='nook_drafts_list')throw new Error('Still offline');assert.fail(name);},{review:draft,readiness:ready,intent:publication});
 await studio.publish();assert.equal(studio.state.error,'Offline');assert.equal(studio.state.intent.id,'intent-a');assert.equal(studio.state.intent.status,'retry-needed');
 fail=false;await studio.publish();assert.equal(studio.state.stage,'published');assert.deepEqual(calls.filter(c=>c.name==='nook_publish_commit').map(c=>c.args),[{intentId:'intent-a',confirmed:true},{intentId:'intent-a',confirmed:true}]);assert.equal(calls.some(c=>c.name==='nook_publish_prepare'),false);
});
test('late old-account review, prepare, and publish responses cannot navigate the new account',async()=>{
 for(const action of ['reviewPublication','prepare','publish']) {
  const pending=deferred(),studio=create(draft,()=>pending.promise,{review:draft,readiness:ready,intent:action==='prepare'?null:publication});
  const work=studio[action]();await Promise.resolve();studio.changeOwner();
  pending.resolve({draft,readiness:ready,prepared:true,publication:{...publication,status:'published',nookId:'published-a'},nook:{id:'published-a'}});await work;
  assert.equal(studio.state.stage,'edit',action);assert.equal(studio.state.callbacks.length,0,action);
 }
});
test('stale preview revision prevents publication and retains the newer draft for review',async()=>{
 const studio=create(draft,async()=>({draft:{...draft,revision:4},readiness:ready}));await studio.reviewPublication();
 assert.equal(studio.state.stage,'edit');assert.equal(studio.state.conflict.revision,4);assert.match(studio.state.error,/changed after saving/);assert.equal(studio.state.callbacks.length,0);
});


test('hidden publication finishes saving its receipt without changing the active view',async()=>{
 const pending=deferred(),studio=create(draft,()=>pending.promise,{review:draft,readiness:ready,intent:publication});
 const work=studio.publish();studio.hide();pending.resolve({publication:{...publication,status:'published',nookId:'published-a'},nook:{id:'published-a'}});await work;
 assert.equal(studio.state.stage,'published');assert.equal(studio.state.published.id,'published-a');assert.equal(studio.state.callbacks.length,0);
});
test('closing and reopening does not revive navigation from an older pending publication',async()=>{
 const pending=deferred(),studio=create(draft,()=>pending.promise,{review:draft,readiness:ready,intent:publication});
 const work=studio.publish();studio.hide();studio.reopen();pending.resolve({publication:{...publication,status:'published',nookId:'published-a'},nook:{id:'published-a'}});await work;
 assert.equal(studio.state.callbacks.length,0);assert.equal(studio.state.stage,'published');
});
test('a hidden preview response never invokes the parent navigation callback',async()=>{
 const pending=deferred();let previews=0;const studio=create(draft,()=>pending.promise,{onPreview:()=>{previews++;}});
 const work=studio.preview();await Promise.resolve();studio.hide();pending.resolve({draft});await work;assert.equal(previews,0);
});
test('parent preview completion gets a guard invalidated immediately by dismissal',async()=>{
 const pending=deferred();let guard;const studio=create(draft,async()=>({draft}),{onPreview:async(space,presentation)=>{guard=presentation.isCurrent;await pending.promise;}});
 const work=studio.preview();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(guard(),true);studio.hide();assert.equal(guard(),false);studio.reopen();assert.equal(guard(),false);pending.resolve();await work;
});
