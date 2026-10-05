import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyEngine } from '../server/engine.mjs';
import { createWorkspace } from '../server/seed.mjs';
const alice={id:'alice',scopes:['notable.read','notable.write']},bob={...alice,id:'bob'};
const requestId='10000000-0000-4000-8000-000000000001';
function fixture(){const data=new Map();const fresh=()=>({...createWorkspace('2026-10-02T00:00:00Z'),artifacts:[],plan:{tasks:[]}});const store={async read(id){return structuredClone(data.get(id)??fresh())},async transact(id,mutate){const next=await this.read(id);const result=await mutate(next);data.set(id,next);return{...result,workspace:structuredClone(next)}}};return{store,engine:new StudyEngine(store),data};}
const flashCheckpoint=()=>({version:1,kind:'flashcards',artifactRevision:1,sessionId:requestId,elapsedSeconds:15,roomId:'rainy-library',state:{queue:[1],known:[0],firstAnswers:{0:true},flipped:false,showHint:false,complete:false,duration:0}});
const cards={id:'cards',kind:'flashcards',title:'Cards',cards:[{front:'One',back:'1'},{front:'Two',back:'2'}]};
test('checkpoint persists a private position without awarding progress; other account cannot read/write/clear',async()=>{
 const{engine}=fixture();await engine.call('artifact_save',{artifact:cards},alice);const saved=await engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:flashCheckpoint()},alice);
 assert.equal(saved.checkpoint.state.queue[0],1);assert.equal(saved.workspace.stats.xp,0);assert.equal(saved.workspace.progress.length,0);assert.equal(saved.workspace.focusSessions.length,0);
 assert.deepEqual((await engine.call('practice_checkpoint_get',{artifactId:'cards'},alice)).checkpoint,saved.checkpoint);
 for(const[name,args]of[['practice_checkpoint_get',{artifactId:'cards'}],['practice_checkpoint_save',{artifactId:'cards',checkpoint:null}]])await assert.rejects(engine.call(name,args,bob),{code:'NOT_FOUND'});
 const readonly={...alice,scopes:['notable.read']};await assert.rejects(engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:flashCheckpoint()},readonly),{code:'INSUFFICIENT_SCOPE'});
});
test('material changes invalidate old position; stale saves cannot restore it',async()=>{
 const{engine}=fixture();await engine.call('artifact_save',{artifact:cards},alice);await engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:flashCheckpoint()},alice);
 await engine.call('artifact_save',{artifact:{...cards,expectedRevision:1,title:'Changed cards'}},alice);
 assert.equal((await engine.call('practice_checkpoint_get',{artifactId:'cards'},alice)).checkpoint,null);
 await assert.rejects(engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:flashCheckpoint()},alice),{code:'REVISION_CONFLICT'});
 await engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:null},alice);assert.equal((await engine.call('practice_checkpoint_get',{artifactId:'cards'},alice)).checkpoint,null);
});
test('indices, unknown fields, duration, session identity and material kinds are validated',async()=>{
 const{engine}=fixture();await engine.call('artifact_save',{artifact:cards},alice);
 for(const checkpoint of [ {...flashCheckpoint(),elapsedSeconds:604801}, {...flashCheckpoint(),sessionId:'invented'}, {...flashCheckpoint(),xp:1000}, {...flashCheckpoint(),kind:'quiz'}, {...flashCheckpoint(),state:{...flashCheckpoint().state,queue:[0,0]}}, {...flashCheckpoint(),state:{...flashCheckpoint().state,known:[42]}}, {...flashCheckpoint(),state:{...flashCheckpoint().state,queue:[],complete:false}}, {...flashCheckpoint(),state:{...flashCheckpoint().state,queue:[0],known:[0]}}, {...flashCheckpoint(),state:{...flashCheckpoint().state,firstAnswers:{'__proto__':true,'2':true}}}]) await assert.rejects(engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint},alice),{code:'INVALID_INPUT'});
});
test('quiz answer and shuffled options are checked against the owned question types',async()=>{
 const{engine}=fixture();const quiz={id:'quiz',kind:'quiz',title:'Quiz',questions:[{prompt:'Choose?',options:['A','B'],correctIndex:0},{prompt:'Write?',answer:'Answer'}]};await engine.call('artifact_save',{artifact:quiz},alice);
 const checkpoint={version:1,kind:'quiz',artifactRevision:1,sessionId:requestId,elapsedSeconds:22,state:{index:1,answers:{0:1,1:'My response'},checked:{0:true},flagged:{1:true},optionOrders:[[1,0],[]],stage:'questions',reviewFilter:'all'}};
 const saved=await engine.call('practice_checkpoint_save',{artifactId:'quiz',checkpoint},alice);assert.equal(saved.checkpoint.state.answers[1],'My response');
 for(const state of [{...checkpoint.state,answers:{0:'not a choice'}},{...checkpoint.state,answers:{1:2}},{...checkpoint.state,optionOrders:[[0],[]]},{...checkpoint.state,index:2}])await assert.rejects(engine.call('practice_checkpoint_save',{artifactId:'quiz',checkpoint:{...checkpoint,state}},alice),{code:'INVALID_INPUT'});
});
test('deleting a study item also deletes its checkpoint',async()=>{const{engine,store}=fixture();await engine.call('artifact_save',{artifact:cards},alice);await engine.call('practice_checkpoint_save',{artifactId:'cards',checkpoint:flashCheckpoint()},alice);await engine.call('artifact_delete',{artifactId:'cards'},alice);assert.equal((await store.read(alice.id)).practiceCheckpoints.cards,undefined);});
