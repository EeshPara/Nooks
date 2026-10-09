import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

function parsed(file) { const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8'); return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function extract(ast, predicate) { let found; function visit(node) { if (predicate(node)) found = node.getText(ast); ts.forEachChild(node, visit); } visit(ast); assert.ok(found); return found; }
const named = (ast, name) => extract(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const helper = parsed('./studioDraftListing.ts'), organization = parsed('../organization/types.ts'), app = parsed('../App.tsx'), studio = parsed('./NookStudio.tsx'), discovery = parsed('./NookDiscovery.tsx');
const effect = extract(studio, node => ts.isCallExpression(node) && node.expression.getText(studio) === 'useEffect' && node.arguments[1]?.getText(studio) === '[initialDraftId, initialDraftRequest, open, busy]');
const card = extract(discovery, node => ts.isArrowFunction(node) && node.parameters[0]?.name.getText(discovery) === 'draft' && node.body.getText(discovery).includes('key={`studio:${draft.id}`}'));
const source = `
${named(organization, 'resultData')}
${named(organization, 'errorMessage')}
const loadingStudioDrafts = () => ({status:'loading',drafts:[],error:''});
${named(helper, 'createStudioDraftListing')}
${named(helper, 'savedNooksLabel')}
export function navigation() {
 const progressOwner={current:'alice'},studioNavigationVersion={current:0};let valid=true;
 const state={id:undefined,request:0,discovery:true,studio:false,pending:'old'};
 const canFlushProgress=()=>valid,setPendingStudioDraftId=x=>state.pending=x,setStudioDraftId=x=>state.id=x,setStudioDraftRequest=fn=>state.request=fn(state.request),setShowNooks=x=>state.discovery=x,setShowNookCreator=x=>state.studio=x;
 ${named(app, 'openStudioDraft')}
 return {state,openStudioDraft,progressOwner,invalid:()=>valid=false};
}
export function studioNavigation() {
 let initialDraftId,initialDraftRequest=0,open=true,busy='',pending;
 const handledInitialDraft={current:{request:-1}},currentDraft={current:{id:'a'}};
 const loads=[],leave=action=>pending=action,load=id=>{loads.push(id);currentDraft.current.id=id;},useEffect=fn=>fn();
 return {select(id,request){initialDraftId=id;initialDraftRequest=request;${effect};},cancel(){pending=undefined;},confirm(){pending?.();pending=undefined;},loads,currentDraft,get pending(){return pending;}};
}
export function draftCard(draft, select) {
 const getPublicNook=id=>id==='cabin'?{scene:{image:'/cabin.webp'}}:undefined,ArrowRight=()=>null,dismiss=fn=>fn(),onOpenStudioDraft=select;
 const render=${card};return render(draft);
}
`;
const compiled = ts.transpileModule(source, { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX } }).outputText.replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`);
const {createStudioDraftListing,savedNooksLabel,navigation,studioNavigation,draftCard}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('late results cannot replace the next owner or update a closed discovery',async()=>{
 for(const mode of ['owner','closed','closed-error']){
  let current=true;const pending=deferred(),states=[];
  const listing=createStudioDraftListing(()=>pending.promise,state=>states.push(state),()=>current);
  const work=listing.refresh();if(mode==='owner')current=false;else listing.dispose();
  if(mode==='closed-error')pending.reject(new Error('Late network error'));else pending.resolve({drafts:[{id:'private-alice',title:'Alice private',description:'',roomId:'cabin',artworkMode:'curated'}]});await work;
  assert.deepEqual(states.map(state=>state.status),['loading']);
 }
});
test('a late error from an obsolete request cannot hide successful retry results',async()=>{
 const first=deferred(),second=deferred(),states=[];let calls=0;
 const listing=createStudioDraftListing(()=>++calls===1?first.promise:second.promise,state=>states.push(state),()=>true);
 const a=listing.refresh(),b=listing.refresh();second.resolve({drafts:[{id:'saved',title:'Saved',description:'',roomId:'cabin',artworkMode:'curated'}]});await b;first.reject(new Error('old network failure'));await a;
 assert.equal(states.at(-1).status,'ready');assert.equal(states.at(-1).drafts[0].id,'saved');
});
test('failed and malformed responses show unavailable rather than zero, and retry restores saved drafts',async()=>{
 let attempt=0;const states=[];
 const listing=createStudioDraftListing(async()=>{if(++attempt===1)throw new Error('Offline');if(attempt===2)return{drafts:[null]};return{drafts:[{id:'saved',title:'Saved',description:'',roomId:'cabin',artworkMode:'curated'}]};},state=>states.push(state),()=>true);
 for(let i=0;i<2;i++){await listing.refresh();assert.equal(states.at(-1).status,'error');assert.equal(savedNooksLabel(0,states.at(-1).status),'Saved drafts unavailable');}
 assert.equal(savedNooksLabel(0,'loading'),'Loading saved nooks…');await listing.refresh();assert.equal(savedNooksLabel(states.at(-1).drafts.length,states.at(-1).status),'1 saved nook');
});
test('selected draft navigation ignores old owners and makes every deliberate selection a new request',()=>{
 const app=navigation();app.openStudioDraft('b','bob');assert.equal(app.state.studio,false);
 app.openStudioDraft('b','alice');assert.equal(app.state.id,'b');assert.equal(app.state.discovery,false);assert.equal(app.state.request,1);assert.equal(app.state.pending,undefined);
 app.openStudioDraft('b','alice');assert.equal(app.state.request,2);app.invalid();app.openStudioDraft('c','alice');assert.equal(app.state.id,'b');
});
test('canceling a dirty-draft switch preserves A; selecting B again can reach the guarded load',()=>{
 const studio=studioNavigation();studio.select('b',1);assert.equal(typeof studio.pending,'function');assert.equal(studio.currentDraft.current.id,'a');
 studio.cancel();studio.select('b',2);assert.equal(typeof studio.pending,'function');assert.deepEqual(studio.loads,[]);
 studio.confirm();assert.deepEqual(studio.loads,['b']);assert.equal(studio.currentDraft.current.id,'b');
});
test('current draft cards remain private, use neutral custom artwork and select their exact draft',()=>{
 let selected;const custom=draftCard({id:'custom',title:'Quiet corner',description:'',artworkMode:'upload',roomId:'cabin',visibility:'public'},id=>selected=id);
 const html=renderToStaticMarkup(custom);assert.match(html,/Private draft/);assert.match(html,/Custom artwork/);assert.doesNotMatch(html,/<img|Public/);custom.props.onClick();assert.equal(selected,'custom');
 assert.match(renderToStaticMarkup(draftCard({id:'gallery',title:'Cabin',artworkMode:'curated',roomId:'cabin'},()=>{})),/\/cabin.webp/);
});

// These components coexist after Studio has mounted once. Equal sibling keys can
// orphan a dismissed Discovery DOM node even though each component works alone.
test('retained Studio and reopened Discovery have distinct owner-scoped sibling identities',()=>{
 const keyOf=name=>{let expression;function visit(node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(app)===name){const key=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(app)==='key');assert.ok(key&&ts.isJsxExpression(key.initializer));expression=key.initializer.expression.getText(app);}ts.forEachChild(node,visit);}visit(app);assert.ok(expression);return new Function('draftOwner','discoveryWorldId',`return ${expression}`);};
 const discoveryKey=keyOf('NookDiscovery'),studioKey=keyOf('NookStudio');
 for(const owner of ['device','account:alice']){for(const world of [undefined,'hogwarts'])assert.notEqual(discoveryKey(owner,world),studioKey(owner),'visible Discovery and retained Studio must never collide');assert.notEqual(discoveryKey(owner),discoveryKey(owner,'hogwarts'),'direct world entry must remount Discovery');}
 assert.notEqual(discoveryKey('account:alice'),discoveryKey('account:bob'));assert.notEqual(studioKey('account:alice'),studioKey('account:bob'));
});
