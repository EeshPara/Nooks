import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('./LibrarySharing.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('LibrarySharing.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(root,predicate){let found;function visit(node){if(predicate(node))found=node;ts.forEachChild(node,visit);}visit(root);assert.ok(found);return found;}
const named=name=>find(ast,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);
const content=find(ast,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SharedLibraryRoomContent');
const setup=find(content,n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect').arguments[0].getText(ast);
const render=find(content,n=>ts.isReturnStatement(n)&&n.expression&&ts.isJsxFragment(n.expression)).expression.getText(ast);
const moduleSource=`
let account;const isEmbedded=false,useNooksAccount=()=>account,SharedLibraryRoomContent='room-content';
export ${named('SharedLibraryRoom').replace(/^export /,'')}
export function boundary(value,props){account=value;return SharedLibraryRoom(props);}
export function room(transport,{shareId='a',token,owner='alice',signedIn=true}={}){
 let data,selected,draft,busy=false,error='',comment='',signIn=false,addExisting=false,availableMaterials=[],navigationNotice='';
 const lifetime={current:{active:false}},work={current:{busy:false,draft:undefined,comment:''}},events=[];
 const record=(key,value)=>events.push([key,value]);
 const setData=x=>{data=x;record('data',x);},setSelected=x=>{selected=x;record('selected',x);},setDraftValue=x=>{draft=x;record('draft',x);},setBusyValue=x=>{busy=x;record('busy',x);},setError=x=>{error=x;record('error',x);},setCommentValue=x=>{comment=x;record('comment',x);},setSignIn=x=>signIn=x,setAddExisting=x=>{addExisting=x;record('picker',x);},setAvailableMaterials=x=>{availableMaterials=x;record('materials',x);},setNavigationNotice=x=>navigationNotice=x;
 const request=(name,args)=>transport(name,args),callTool=(name,args)=>transport(name,args),resultData=x=>x,failure=e=>e.message;
 const OrganizationDialog='dialog',UsersRound='icon',Plus='icon',StudyEditor='editor',StudyView='study-view',AccountDialog='account-dialog',onClose=()=>{};
 ${['setDraft','setComment','setBusy','canNavigate','beginWork','openMaterialPicker','refresh','save','sendComment','leaveStudyView'].map(named).join('\n')}
 const setup=${setup};
 return{setup,events,lifetime,work,canNavigate,setDraft,setComment,setSelected,openMaterialPicker,refresh,save,sendComment,leaveStudyView,
 get state(){return{data,selected,draft,busy,error,comment,addExisting,availableMaterials,navigationNotice};},
 render(){const editable=data?.share.permission==='owner'||data?.share.permission==='edit',canComment=editable||data?.share.permission==='comment';return ${render};}};
}
export function invitation(guard){
 const accepted={current:'library-share=a&token=old'},currentOwner={current:'alice'},navigationGuard={current:guard};
 const state={invitation:accepted.current,closed:false,replaced:[]};
 const window={location:{hash:'#'+accepted.current,pathname:'/study',search:'?theme=calm'},history:{state:{keep:true},replaceState:(...args)=>state.replaced.push(args)}};
 const setInvitation=x=>state.invitation=x,setClosed=x=>state.closed=x;
 ${named('receiveInvitation')}
 return{accepted,currentOwner,navigationGuard,state,change(hash){window.location.hash=hash;receiveInvitation();}};
}`;
const compiled=ts.transpileModule(moduleSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/\bfrom\s+(['"])([^'"]+)\1/g,(_,q,path)=>`from ${q}${import.meta.resolve(path)}${q}`);
const {room,invitation,boundary}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const material={id:'material-a',kind:'note',title:'Private notes',content:'Original',revision:2};
const payload=(title='Private A')=>({share:{id:'a',title,permission:'edit',kind:'course'},materials:[material,{...material,id:'material-b',title:'Other notes'}],comments:[],artifact:material});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(value){if(!value||typeof value!=='object')return[];if(Array.isArray(value))return value.flatMap(nodes);return[value,...nodes(value.props?.children)];}
function text(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(text).join('');return value?.props?text(value.props.children):'';}

test('owner, status, invitation ID and token each replace the private content boundary before effects',()=>{
 const props={shareId:'a',token:'old',onClose(){}};const a=boundary({workspaceKey:'alice',status:'signed-in'},props);
 for(const [account,next] of [[{workspaceKey:'bob',status:'signed-in'},props],[{workspaceKey:'alice',status:'loading'},props],[{workspaceKey:'alice',status:'signed-out'},props],[{workspaceKey:'alice',status:'expired'},props],[{workspaceKey:'alice',status:'signed-in'},{...props,shareId:'b'}],[{workspaceKey:'alice',status:'signed-in'},{...props,token:'new'}]]){const b=boundary(account,next);assert.notEqual(b.key,a.key);assert.equal(b.props.owner,account.workspaceKey);assert.equal(b.props.signedIn,account.status==='signed-in');}
 assert.equal(boundary({workspaceKey:'alice',status:'signed-in'},props).key,a.key);
});
test('late invitation A success or error cannot install private state after switching to B',async()=>{
 for(const fail of [false,true]){const pending=deferred(),a=room(()=>pending.promise),dispose=a.setup(),b=room(async()=>payload('Private B'),{shareId:'b'});dispose();b.setup();await settle();
  const count=a.events.length;if(fail)pending.reject(new Error('A failed late'));else pending.resolve(payload());await settle();assert.equal(a.events.length,count);assert.equal(b.state.data.share.title,'Private B');assert.equal(b.state.error,'');}
});
test('StrictMode cleanup invalidates the first read even after the second setup activates',async()=>{
 const first=deferred(),second=deferred();let calls=0;const h=room(()=>++calls===1?first.promise:second.promise);h.setup()();h.setup();second.resolve(payload('Latest'));await settle();first.resolve(payload('Obsolete'));await settle();assert.equal(h.state.data.share.title,'Latest');
});
test('signed-out room renders no previous private title or request',()=>{
 let calls=0;const h=room(()=>{calls++;},{signedIn:false});h.setup();const output=h.render();assert.equal(calls,0);assert.equal(output.props.children[0].props.title,'Shared files');assert.match(text(output),/Sign in to open/);assert.doesNotMatch(text(output),/Private notes/);
});
test('dirty notes, editor drafts and unsent comments block hash navigation synchronously and restore URL',()=>{
 for(const protect of [h=>h.setDraft({...material,content:'Unsaved'}),h=>h.setDraft({...material,kind:'flashcards'}),h=>h.setComment('Unsent thought')]){
  const h=room(async()=>payload());h.setup();protect(h);const controller=invitation({owner:'alice',canNavigate:h.canNavigate});controller.change('#library-share=b&token=new');assert.equal(controller.state.invitation,'library-share=a&token=old');assert.deepEqual(controller.state.replaced[0],[{keep:true},'','/study?theme=calm#library-share=a&token=old']);assert.match(h.state.navigationNotice,/Save or cancel/);
  h.setDraft(undefined);h.setComment('');controller.change('#library-share=b&token=new');assert.equal(controller.state.invitation,'library-share=b&token=new');assert.equal(controller.state.closed,false);
 }
});
test('pending save blocks navigation and duplicate save, then successful save permits retry',async()=>{
 const pending=deferred(),calls=[];const h=room((name,args)=>{calls.push([name,args]);return name==='save'?pending.promise:Promise.resolve(payload());});h.setup();await settle();h.setDraft(material);const saving=h.save({...material,content:'Saved edit'}),controller=invitation({owner:'alice',canNavigate:h.canNavigate});controller.change('#library-share=b');assert.match(h.state.navigationNotice,/Wait/);await assert.rejects(h.save(material),/busy/);assert.equal(calls.filter(([name])=>name==='save').length,1);pending.resolve(payload());await saving;controller.change('#library-share=b');assert.equal(controller.state.invitation,'library-share=b');
});
test('an old owner navigation handle cannot inspect or block the new identity',()=>{
 let calls=0;const controller=invitation({owner:'alice',canNavigate:()=>{calls++;return false;}});controller.currentOwner.current='bob';controller.change('#library-share=b');assert.equal(calls,0);assert.equal(controller.state.invitation,'library-share=b');
});
test('every asynchronous room action ignores late success/error/finally after unmount',async()=>{
 for(const action of ['refresh','openMaterialPicker','save','sendComment'])for(const fail of [false,true]){
  const pending=deferred();let calls=0;const h=room(()=>++calls===1?Promise.resolve(payload()):pending.promise);const dispose=h.setup();await settle();h.setSelected(material);h.setDraft(material);h.setComment('Keep me');const result=(action==='save'?h.save(material):h[action]()).catch(()=>{});dispose();const count=h.events.length;
  if(fail)pending.reject(new Error('Old request failure'));else pending.resolve({...payload('Old result'),workspace:{artifacts:[material]}});await result;assert.equal(h.events.length,count,action+' '+fail);
 }
});
test('unsent or pending comments disable selection/edit until sent; completion cannot clear a newer selection',async()=>{
 const pending=deferred();const h=room(name=>name==='comment'?pending.promise:Promise.resolve(payload()));h.setup();await settle();h.setSelected(material);h.setComment('Thought');
 const relevant=()=>nodes(h.render()).filter(n=>n.type==='button'&&['Other notes','Edit','New note','Add material'].includes(text(n)));
 assert.equal(relevant().length,4);assert.ok(relevant().every(n=>n.props.disabled));const sending=h.sendComment();assert.ok(relevant().every(n=>n.props.disabled));pending.resolve(payload());await sending;assert.equal(h.state.comment,'');assert.ok(relevant().every(n=>!n.props.disabled));assert.equal(h.state.selected.id,material.id);
});
test('failed save retains the current draft and retry path',async()=>{
 const h=room(name=>name==='save'?Promise.reject(new Error('Offline')):Promise.resolve(payload()));h.setup();await settle();h.setDraft({...material,content:'Keep my work'});await assert.rejects(h.save(h.state.draft),/Offline/);assert.equal(h.state.draft.content,'Keep my work');assert.equal(h.state.busy,false);assert.equal(h.state.error,'Offline');assert.equal(h.canNavigate(),false);
});

test('study-view exit cannot hide an unsent comment or pending request',async()=>{
 const h=room(async()=>payload());h.setup();await settle();h.setSelected({...material,kind:'flashcards'});h.setComment('Keep visible');h.leaveStudyView();assert.equal(h.state.selected.id,material.id);assert.match(h.state.navigationNotice,/send or clear/);h.setComment('');h.leaveStudyView();assert.equal(h.state.selected,undefined);
});

test('unsent comment blocks the actual dialog dismissal and existing picker copy action',async()=>{
 const h=room(name=>Promise.resolve(name==='workspace_get'?{workspace:{artifacts:[{...material,title:'Copy from library'}]}}:payload()));h.setup();await settle();h.setSelected(material);await h.openMaterialPicker();h.setComment('Keep this comment');
 let output=h.render();assert.equal(output.props.children[0].props.busy,true);const copy=nodes(output).find(n=>n.type==='button'&&text(n)==='Copy from library');assert.equal(copy.props.disabled,true);assert.ok(nodes(output).some(n=>n.type==='textarea'&&n.props.value==='Keep this comment'&&!n.props.disabled));
 h.setComment('');output=h.render();assert.equal(output.props.children[0].props.busy,false);assert.equal(nodes(output).find(n=>n.type==='button'&&text(n)==='Copy from library').props.disabled,false);
});
