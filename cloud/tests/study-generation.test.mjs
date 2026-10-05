import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudyMaterial } from '../server/study-generation.mjs';
import { StudyEngine } from '../server/engine.mjs';
import { createWorkspace } from '../server/seed.mjs';
const identity={id:'test-account',scopes:['notable.read','notable.write']};
const requestId='10000000-0000-4000-8000-000000000001';
function memory() {
 let data=createWorkspace('2026-10-02T00:00:00Z');data.artifacts=[];let pending=Promise.resolve();
 const store={async read(){return structuredClone(data)},async transact(id,mutate){let release;const prev=pending;pending=new Promise(r=>{release=r});await prev;try{const draft=structuredClone(data);const result=await mutate(draft);data=draft;return {...result,workspace:structuredClone(data)}}finally{release()}}};
 return {store,engine:new StudyEngine(store)};
}
const completion=output=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
const output={title:'Cell basics',subject:'Biology',cards:[{front:'What stores genetic information?',back:'DNA',hint:'A molecule'}]};
const invoke=(b,args,fetchImpl)=>generateStudyMaterial({...b,identity,apiKey:'server-only',model:'test-model',args:{requestId,kind:'flashcards',...args},fetchImpl});
test('generates only from selected owned context with bounded output, then returns saved result on retry',async()=>{
 const b=memory();await b.engine.call('artifact_save',{artifact:{id:'selected',kind:'note',title:'DNA',content:'DNA stores genetic information.'}},identity);await b.engine.call('artifact_save',{artifact:{id:'unselected',kind:'note',title:'Private other subject',content:'Do not send this.'}},identity);
 let calls=0;const model=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,6000);assert.equal(body.text.format.strict,true);assert.ok(!body.input.includes('Do not send this'));assert.ok(body.input.includes('DNA stores genetic information'));return completion(output)};
 const result=await invoke(b,{materialIds:['selected']},model);assert.equal(result.artifact.kind,'flashcards');assert.equal(result.artifact.cards.length,1);assert.equal(result.artifact.source,'DNA [selected] (saved revision 1)');
 const retry=await invoke(b,{materialIds:['selected']},model);assert.equal(retry.duplicate,true);assert.equal(calls,1);assert.equal((await b.store.read()).artifacts.filter(item=>item.id.startsWith('generated-')).length,1);
});
test('foreign IDs, missing content, overlarge sources and extra fields fail before model call',async()=>{
 const b=memory();let calls=0;const model=async()=>{calls++;return completion(output)};
 await assert.rejects(invoke(b,{materialIds:['someone-elses-note']},model),{code:'NOT_FOUND'});
 await assert.rejects(invoke(b,{},model),{code:'INVALID_INPUT'});
 await assert.rejects(invoke(b,{source:'x'.repeat(60001)},model),{code:'INVALID_INPUT'});
 await assert.rejects(invoke(b,{instruction:'DNA',userId:'other'},model),{code:'INVALID_INPUT'});assert.equal(calls,0);
});
test('invalid output, refusals, incomplete and network provider errors do not save artifacts',async()=>{
 const b=memory();
 for(const value of [{status:'incomplete',output:[]},{status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'not json'}]}]}]) await assert.rejects(invoke(b,{instruction:'DNA'},async()=>new Response(JSON.stringify(value))),{code:'GENERATION_FAILED'});
 await assert.rejects(invoke(b,{instruction:'DNA'},async()=>completion({...output,cards:[]})),{code:'GENERATION_FAILED'});
 await assert.rejects(invoke(b,{instruction:'DNA'},async()=>new Response('{}',{status:429})),{code:'GENERATION_FAILED'});assert.equal((await b.store.read()).artifacts.length,0);
});
test('concurrent generation completion is additive and cannot overwrite the winning result',async()=>{
 const b=memory();let seen=0,release;const barrier=new Promise(r=>{release=r});
 const model=async()=>{const number=++seen;if(number===1)await barrier;else release();return completion({...output,title:`Attempt ${number}`})};
 const results=await Promise.all([invoke(b,{instruction:'DNA'},model),invoke(b,{instruction:'DNA'},model)]);assert.equal(results[0].artifact.title,results[1].artifact.title);assert.equal((await b.store.read()).artifacts.length,1);assert.ok(results.some(result=>result.duplicate));
});
test('notes retain Markdown and generated quiz/exam answers stay correct after persistence',async()=>{
 for(const kind of ['note','quiz','exam']){
  const b=memory();const modelOutput=kind==='note'?{title:'DNA notes',subject:'Biology',content:'# DNA\n\n**DNA** stores genetic information.'}:{title:'DNA check',subject:'Biology',questions:[{prompt:'Which molecule stores genetic information?',options:['ATP','DNA','Water','Salt'],correctIndex:1,explanation:'DNA contains hereditary information.'}]};
  const result=await invoke(b,{kind,instruction:'Explain DNA'},async()=>completion(modelOutput));assert.equal(result.artifact.kind,kind);
  const persisted=(await b.store.read()).artifacts[0];
  if(kind==='note')assert.equal(persisted.content,modelOutput.content);
  else{assert.equal(persisted.questions[0].correctIndex,1);assert.equal(persisted.questions[0].options[persisted.questions[0].correctIndex],'DNA');assert.equal(persisted.questions[0].explanation,modelOutput.questions[0].explanation);}
 }
});
test('snapshot provenance verifies ownership without appending stale saved source content',async()=>{
 const b=memory();await b.engine.call('artifact_save',{artifact:{id:'selected',kind:'note',title:'DNA draft',content:'STALE_SAVED_SOURCE'}},identity);
 const currentDraft='CURRENT_DRAFT_'+ 'x'.repeat(59980);let calls=0;
 const model=async(url,options)=>{calls++;const input=JSON.parse(JSON.parse(options.body).input);assert.equal(input.source,currentDraft);assert.deepEqual(input.selectedMaterials,[]);assert.ok(!JSON.stringify(input).includes('STALE_SAVED_SOURCE'));return completion(output)};
 const result=await invoke(b,{source:currentDraft,sourceArtifactIds:['selected']},model);assert.equal(calls,1);assert.equal(result.artifact.source,'DNA draft [selected] (saved revision 1; supplied snapshot)');
 const other=memory();await assert.rejects(invoke(other,{source:'My current draft',sourceArtifactIds:['selected']},model),{code:'NOT_FOUND'});assert.equal(calls,1);
});
test('provenance inputs share the eight-item bound and reject malformed IDs before generation',async()=>{
 const b=memory();let calls=0;const model=async()=>{calls++;return completion(output)};
 for(const args of [{sourceArtifactIds:['']},{sourceArtifactIds:[{}]},{sourceArtifactIds:Array.from({length:9},(_,i)=>String(i))},{materialIds:['a','b','c','d'],sourceArtifactIds:['e','f','g','h','i']}])await assert.rejects(invoke(b,{source:'Draft',...args},model),{code:'INVALID_INPUT'});assert.equal(calls,0);
});

test('generation validates destination ownership and capacity before requesting paid output',async()=>{
 const b=memory();let calls=0;const model=async()=>{calls++;return completion(output)};
 const first=(await b.engine.call('course_save',{course:{title:'Biology'}},identity)).course;
 const second=(await b.engine.call('course_save',{course:{title:'Chemistry'}},identity)).course;
 const topic=(await b.engine.call('topic_save',{topic:{title:'Cells',courseId:first.id}},identity)).topic;
 for(const args of [{courseId:'foreign'},{topicId:'foreign'},{courseId:second.id,topicId:topic.id},{courseId:15},{topicId:{}}]) {
  await assert.rejects(invoke(b,{instruction:'DNA',...args},model));
 }
 assert.equal(calls,0);
 const generated=await invoke(b,{instruction:'DNA',topicId:topic.id},model);
 assert.equal(generated.artifact.courseId,first.id);assert.equal(generated.artifact.topicId,topic.id);assert.equal(calls,1);
 const full=memory();await full.store.transact(identity.id,workspace=>{workspace.artifacts=Array.from({length:1000},(_,index)=>({id:`note-${index}`,kind:'note',title:'Saved note',content:'Keep me'}));return {}});
 await assert.rejects(invoke(full,{instruction:'DNA'},model),{code:'STORAGE_FULL'});assert.equal(calls,1);
});
