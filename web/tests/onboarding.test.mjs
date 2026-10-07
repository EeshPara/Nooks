import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyEngine as WebEngine } from '../server/engine.mjs';
import { StudyEngine as NativeEngine } from '../../app/server/engine.mjs';
for(const [label,Engine] of [['web',WebEngine],['native development',NativeEngine]])test(`${label}: welcome completion preserves work and rejects unauthorized or invalid writes`,async()=>{
 const workspaces=new Map();
 const store={async transact(id,mutate){const w=structuredClone(workspaces.get(id)??{artifacts:[{id:'private-note',content:'Keep me'}]});const result=await mutate(w);workspaces.set(id,w);return {...result,workspace:w};}};
 const engine=new Engine(store,{clock:()=>new Date('2026-10-06T00:00:00Z')});
 const alice={id:'alice',scopes:['notable.read','notable.write']};
 await assert.rejects(()=>engine.call('onboarding_complete',{name:'Sam',avatar:1},null));
 await assert.rejects(()=>engine.call('onboarding_complete',{name:'Sam',avatar:1},{id:'bob',scopes:['notable.read']}));
 for(const args of [{name:' ',avatar:0},{name:'Sam',avatar:8},{name:'Sam',avatar:0,accountId:'bob'}])await assert.rejects(()=>engine.call('onboarding_complete',args,alice));
 assert.equal(workspaces.size,0);
 const result=await engine.call('onboarding_complete',{name:' Sam ',avatar:1},alice);
 assert.deepEqual(result.onboarding,{name:'Sam',avatar:1,completedAt:'2026-10-06T00:00:00.000Z',version:1});
 assert.equal(result.workspace.artifacts[0].content,'Keep me');
 assert.equal(workspaces.has('bob'),false);
});
