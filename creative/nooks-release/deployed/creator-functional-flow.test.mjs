import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCreatorFlow} from './creator-functional-flow.mjs';
import {NookCreator} from '../../../web/server/nook-creator.mjs';
import {StudyEngine} from '../../../web/server/engine.mjs';
import {createWorkspace} from '../../../web/server/seed.mjs';
import {InputError} from '../../../web/server/errors.mjs';
import {assert as check} from './soak-control.mjs';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
async function exercise({brokenStaleCommit=false}={}){
 const users=[0,1].map(index=>({index,id:crypto.randomUUID(),account:crypto.randomUUID(),scopes:['notable.read','notable.write']}));
 const states=new Map(users.map(u=>{const w=createWorkspace(new Date().toISOString());w.artifacts=[];return [u.account,w]})),rooms=[],communities=new Map(),journal=[],report={releaseStart:{id:'same'}};let calls=0,commits=0;
 const store=user=>({async read(){return structuredClone(states.get(user.account))},async transact(_id,fn){const value=structuredClone(states.get(user.account)),result=await fn(value);states.set(user.account,value);return {...result,workspace:structuredClone(value)}},async community(action,args){assert.equal(action,'create_nook');commits++;if(!communities.has(args.requestId))communities.set(args.requestId,{id:crypto.randomUUID(),owner:user.account,...args});return {nook:structuredClone(communities.get(args.requestId))}}});
 const api=async(user,tool,args={},expected=200)=>{calls++;let status=200,value;
  try{
   if(brokenStaleCommit&&tool==='nook_publish_commit'&&expected===409){const intent=states.get(user.account).nookCreator.publicationIntents.find(x=>x.id===args.intentId);communities.set(intent.requestId,{id:crypto.randomUUID(),owner:user.account,...intent.communityArguments});value={};}
   else if(tool==='workspace')value=await new StudyEngine(store(user)).call('workspace_get',{}, {...user,id:user.account});
   else if(tool==='space_customize')value=await new StudyEngine(store(user)).call(tool,args,{...user,id:user.account});
   else if(tool==='nook_snapshot'){const nook=[...communities.values()].find(x=>x.id===args.nookId);if(nook?.owner!==user.account)throw new InputError('Denied','FORBIDDEN');value={nook,memberCount:1};}
   else value=await new NookCreator(store(user)).call(tool,args,{...user,id:user.account});
  }catch(error){if(!error.code)throw error;status=({NOT_FOUND:404,CONFLICT:409,FORBIDDEN:403})[error.code]??400;value={error:{code:error.code}};}
  assert.equal(status,expected,'unexpected_http_status');return value;
 };
 let failure;try{await verifyCreatorFlow({users,rooms,report,api,journal:async()=>journal.push(structuredClone({drafts:report.creatorDraftIds,rooms:rooms.map(r=>({requestId:r.requestId,id:r.id}))})),randomUUID:()=>crypto.randomUUID(),assert:check,releaseIdentity:async()=>({id:'same'})});}catch(error){failure=error;}
 return {users,rooms,report,journal,states,communities,calls,commits,failure};
}
test('actual creator/engine contracts complete the bounded private no-image flow',async()=>{
 const x=await exercise();assert.equal(x.failure,undefined);assert.equal(x.communities.size,1);assert.equal(x.commits,1);assert.equal(x.report.creatorChecks.length,6);assert.equal(x.report.creatorIntegrity.privateDraftsRemaining,0);assert.ok(x.calls+5<=60);assert.equal(x.rooms.length,2);assert.ok(x.rooms[0].negative);assert.equal(x.rooms.filter(r=>r.id).length,1);assert.ok(x.journal.some(j=>j.rooms.length===2&&j.rooms.every(r=>!r.id)));assert.ok(!JSON.stringify([...x.states.values()]).includes('data:image'));
});
test('broken stale commit stops before the real publication and its exact request was already journaled',async()=>{
 const x=await exercise({brokenStaleCommit:true});assert.match(x.failure?.message??'',/unexpected_http_status/);assert.equal(x.communities.size,1);assert.equal(x.commits,0);const [request]=x.communities.keys();assert.equal(request,x.rooms[0].requestId);assert.ok(x.journal.some(j=>j.rooms.some(r=>r.requestId===request)));assert.equal(x.rooms[1].id,undefined);
});
test('creator mode is explicitly gated and retains separate work and cleanup caps',()=>{
 assert.match(source,/--run-authorized-creator-proof/);assert.match(source,/sockets:0,channels:0,durationMs:0,publicCap:60,adminCap:6,cleanupCap:30,maxActive:2,cleanupDeadlineMs:180000/);assert.match(source,/creatorProof\?300000:diagnostic\?180000/);assert.match(source,/creatorDrafts:report.creatorDraftIds/);
});
