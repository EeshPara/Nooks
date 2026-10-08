import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const mixer=fs.readFileSync(new URL('./AmbientMixer.tsx',import.meta.url),'utf8');
const helper=mixer.slice(mixer.indexOf('const RECORDING_RELEASE_MS'),mixer.indexOf('const channels:'));
const globals=`
const sceneBed=id=>id==='sea'?{waves:.8}:id==='forest'?{forest:.7}:{};
const fireVariant=id=>id==='stove'?'stove':'hearth';
const recordedAmbience={waves:'waves',forest:'forest',rain:'rain',stove:'stove',hearth:'hearth'};
const loadRecordingBytes=async data=>data;
const safeVolume=n=>Math.max(0,Math.min(1,n));
const timers=new Map(); let nextTimer=0;
const setTimeout=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;};
const clearTimeout=id=>timers.delete(id);
function expireTimers(){for(const [id,{fn}] of [...timers]) {if(timers.delete(id))fn();}}
`;
const code=ts.transpileModule(globals+helper+'\nexport {matchRecordingsToNook,dispose,timers,expireTimers};',{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {matchRecordingsToNook,dispose,timers,expireTimers}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function fakeEngine() {
 const decodes=new Map(),started=[];
 const context={state:'running',currentTime:3,createGain(){return {gain:{value:0,cancelScheduledValues(){},setTargetAtTime(n){this.value=n}},connect(){},disconnect(){this.disconnected=true}}},decodeAudioData(kind){return new Promise((resolve,reject)=>decodes.set(kind,{resolve,reject}))},createBufferSource(){return {connect(){},start(){started.push(this)},stop(){this.stopped=true},disconnect(){this.disconnected=true},loop:false}},close(){this.state='closed';return Promise.resolve()}};
 return {context,recordings:{},disposed:false,mixRevision:0,master:{},sources:[],decodes,started,audio:{pause(){},removeAttribute(){},load(){}},localSource:{disconnect(){}}};
}
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
const prefs={levels:{rain:0,fire:0,scene:.4,brown:0,warm:0}};
async function play(e,room,kind){const p=matchRecordingsToNook(e,room,prefs);await tick();e.decodes.get(kind).resolve(`${kind}-buffer`);await p;}
test('late decode is discarded after room switch without starting a silent player',async()=>{
 const e=fakeEngine();const first=matchRecordingsToNook(e,'sea',prefs);await tick();const next=matchRecordingsToNook(e,'forest',prefs);
 await tick();assert.deepEqual([...e.decodes.keys()],['waves','forest']);
 e.decodes.get('forest').resolve('forest-buffer');await next;
 e.decodes.get('waves').resolve('waves-buffer');await first;
 assert.equal(e.recordings.waves,undefined);assert.equal(e.started.length,1);
 assert.ok(Math.abs(e.recordings.forest.gain.gain.value-.28)<1e-9);dispose(e);
});
test('old player fades completely, releases buffer, and revisiting decodes anew',async()=>{
 const e=fakeEngine();await play(e,'sea','waves');const old=e.recordings.waves;const source=old.source;
 await play(e,'forest','forest');assert.equal(old.gain.gain.value,0);assert.equal(source.stopped,undefined);
 assert.equal(timers.get(old.releaseTimer).ms,5200);expireTimers();
 assert.equal(e.recordings.waves,undefined);assert.equal(source.stopped,true);assert.equal(source.disconnected,true);assert.equal(source.buffer,null);assert.equal(old.gain.disconnected,true);assert.equal(e.sources.length,0);
 await play(e,'sea','waves');assert.equal(e.started.length,3);expireTimers();assert.deepEqual(Object.keys(e.recordings),['waves']);dispose(e);
});
test('revisiting during fade cancels eviction and reuses the live player',async()=>{
 const e=fakeEngine();await play(e,'sea','waves');const source=e.recordings.waves.source;
 await play(e,'forest','forest');await matchRecordingsToNook(e,'sea',prefs);expireTimers();
 assert.equal(e.recordings.waves.source,source);assert.equal(source.stopped,undefined);assert.equal(e.started.length,2);assert.deepEqual(Object.keys(e.recordings),['waves']);dispose(e);
});
test('silent mix frees players and unchanged active mixes do not decode again',async()=>{
 const e=fakeEngine();await play(e,'sea','waves');await matchRecordingsToNook(e,'sea',prefs);assert.equal(e.started.length,1);
 await matchRecordingsToNook(e,'sea',{levels:{...prefs.levels,scene:0}});assert.equal(e.recordings.waves.gain.gain.value,0);expireTimers();assert.deepEqual(e.recordings,{});dispose(e);
});
test('failed decoding can retry; teardown invalidates a pending decode immediately',async()=>{
 const e=fakeEngine();let p=matchRecordingsToNook(e,'sea',prefs);await tick();e.decodes.get('waves').reject(Error('bad data'));await assert.rejects(p);assert.equal(e.recordings.waves,undefined);
 p=matchRecordingsToNook(e,'sea',prefs);await tick();dispose(e);e.decodes.get('waves').resolve('waves-buffer');await p;assert.equal(e.started.length,0);assert.deepEqual(e.recordings,{});
});
test('old failed decode cannot delete or silence a newer player for the same recording',async()=>{
 const e=fakeEngine();const old=matchRecordingsToNook(e,'sea',prefs);await tick();const stale=e.decodes.get('waves');
 await matchRecordingsToNook(e,'quiet',prefs);await play(e,'sea','waves');const current=e.recordings.waves;
 stale.reject(Error('old request failed'));await old;assert.equal(e.recordings.waves,current);assert.ok(current.gain.gain.value>0);dispose(e);
});
test('teardown stops active and fading players, cancels timers and releases buffers',async()=>{
 const e=fakeEngine();await play(e,'sea','waves');await play(e,'forest','forest');dispose(e);
 assert.equal(timers.size,0);assert.deepEqual(e.recordings,{});assert.ok(e.started.every(s=>s.stopped&&s.disconnected&&s.buffer===null));
 await matchRecordingsToNook(e,'sea',prefs);assert.equal(e.started.length,2);
});
