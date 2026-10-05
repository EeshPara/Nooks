import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = async source => import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const ast = file => ts.createSourceFile(file,fs.readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function declaration(file,name,parent) {
 const source=ast(file);let outer=source,found;
 const visit=(node,match)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===match)return node;for(const child of node.getChildren(source)){const result=visit(child,match);if(result)return result;}};
 if(parent)outer=visit(source,parent);
 found=visit(outer,name);assert.ok(found);return found.getText(source).replace(/^export (default )?/,'');
}

for(const [file,kind] of [['./FlashcardsSession.tsx','flashcards'],['./QuizSession.tsx','quiz']]){
 const emit=declaration(file,'emitProgress');
 const {create}=await load(`export const create=({artifact,onProgress,isExam=false})=>{const saved=true,cards=[{id:'c'}],questions=[{id:'q'}],sessionId={current:'session'},sessionRoomId={current:'rainy-library'},isCorrectAnswer=()=>true,hasAnswer=()=>true;${emit};return emitProgress;};`);
 test(`${kind} completion submits its studied revision with its original response evidence`,()=>{
  const calls=[];create({artifact:{id:'set',revision:17},onProgress:event=>calls.push(event)})({0:kind==='flashcards'?true:0},12);
  assert.equal(calls[0].artifactRevision,17);
  assert.deepEqual(kind==='flashcards'?calls[0].cardRatings:calls[0].answers,kind==='flashcards'?{c:'good'}:{q:0});
 });
 if(kind==='quiz')test('exam completion uses the same version-bound result contract',()=>{
  let result;create({artifact:{id:'exam',revision:6},isExam:true,onProgress:event=>result=event})({0:0},12);
  assert.equal(result.kind,'exam');assert.equal(result.artifactRevision,6);
 });
}

const choose=declaration('./GamesView.tsx','choose','MatchGame');
const advance=declaration('./GamesView.tsx','advance','SprintGame');
const {createMatch,createSprint}=await load(`
export const createMatch=onProgress=>{const artifact={id:'cards',revision:99},sessionArtifactRevision={current:7},matched=[],mismatch=[],complete=false,selected='front',tiles=[{id:'front',cardId:'c',side:'front'}],cards=[{id:'c',front:'Cat?',back:'gato'}],emitted={current:false},started={current:Date.now()},session={current:'match-session'},sessionRoomId={current:'rainy-library'},setSelected=()=>{},setAttempts=()=>{},setMatched=()=>{},setComplete=()=>{};${choose};return ()=>choose({id:'back',cardId:'c',side:'back'});};
export const createSprint=onProgress=>{const artifact={id:'quiz',revision:99},sessionArtifactRevision={current:8},answered=true,index=0,questions=[{id:'q'}],score=1,answers={q:0},emitted={current:false},started={current:Date.now()},session={current:'sprint-session'},sessionRoomId={current:'rainy-library'},setComplete=()=>{};${advance};return advance;};`);
test('games keep the revision captured for the played round rather than a newer prop revision',()=>{
 const results=[];createMatch(event=>results.push(event))();createSprint(event=>results.push(event))();
 assert.deepEqual(results.map(event=>[event.kind,event.artifactRevision]),[['match',7],['sprint',8]]);
 assert.deepEqual(results[0].matches,[{cardId:'c',front:'Cat?',back:'gato'}]);assert.deepEqual(results[1].answers,{q:0});
});

test('a changed revision starts a fresh practice surface even if timestamps collide',async()=>{
 const source=ast('./StudyView.tsx'),keys=[];
 const visit=node=>{if(ts.isJsxAttribute(node)&&node.name.getText(source)==='key'&&node.initializer?.expression)keys.push(node.initializer.expression.getText(source));ts.forEachChild(node,visit);};visit(source);
 assert.equal(keys.length,2);
 for(const expression of keys){
  const {key}=await load(`export const key=props=>${expression};`);
  const original={artifact:{id:'set',revision:1,updatedAt:'same-time'},saved:true};
  assert.notEqual(key(original),key({...original,artifact:{...original.artifact,revision:2}}));
 }
});
