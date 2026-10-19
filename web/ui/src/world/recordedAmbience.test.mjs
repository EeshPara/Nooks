import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
let source = fs.readFileSync(new URL('./recordedAmbience.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '');
source = `const rain='/assets/rain.mp3',stove='',hearth='',wind='',forest='',waves='',stream='',night='',train='',room='';` + source;
const code = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.ES2022 } }).outputText;
const { fireVariant, recordingBytes, sceneSoundBeds, sceneBed, loadRecordingBytes } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('Howl uses enclosed stove audio; Gryffindor uses a distinct open hearth', () => {
 assert.equal(fireVariant('howls-moving-study'),'stove');
 assert.equal(fireVariant('gryffindor-common-room'),'hearth');
 const hashes=new Set();
 for(const name of ['rain-window','stove-fire','hearth-fire']) {
  const bytes=fs.readFileSync(new URL(`./audio/${name}.mp3`,import.meta.url));
  assert.ok(bytes.length>100000); hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(Buffer.from(recordingBytes(`data:audio/mpeg;base64,${bytes.toString('base64')}`)),bytes);
 }
 assert.equal(hashes.size,3);
});
test('native playback accepts bundled audio only, not arbitrary external URLs', () => {
 for(const input of ['https://example.com/sound.mp3','data:text/html;base64,SGk=','data:audio/mpeg,raw']) assert.throws(()=>recordingBytes(input));
});

test('all 50 natural beds use modest real recording ratios and fail closed for unknown rooms', () => {
 assert.equal(Object.keys(sceneSoundBeds).length,50);
 const kinds=new Set(['room','wind','forest','waves','stream','night','train']);
 for(const bed of Object.values(sceneSoundBeds)) {
  assert.ok(Object.values(bed).reduce((a,b)=>a+b,0)<=1);
  for(const [kind,level] of Object.entries(bed)) { assert.ok(kinds.has(kind));assert.ok(level>0&&level<=1); }
 }
 for(const id of ['__proto__','constructor','unknown']) assert.deepEqual(sceneBed(id),{});
 for(const name of kinds) assert.ok(fs.statSync(new URL(`./audio/${name}-bed.mp3`,import.meta.url)).size>100000);
});

 test('on-demand audio only fetches compiled assets without credentials and refuses redirects, failures, oversize responses', async () => {
  const seen=[];
  const request=async (url,options)=>{seen.push({url,options});return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}})};
  assert.deepEqual(new Uint8Array(await loadRecordingBytes('/assets/rain.mp3',request)),new Uint8Array([1,2,3]));
  assert.equal(seen[0].options.credentials,'omit');assert.equal(seen[0].options.redirect,'error');
  await assert.rejects(loadRecordingBytes('https://attacker.example/private',request));assert.equal(seen.length,1);
  await assert.rejects(loadRecordingBytes('/assets/rain.mp3',async()=>new Response(null,{status:404})));
  await assert.rejects(loadRecordingBytes('/assets/rain.mp3',async()=>new Response('x',{headers:{'content-length':'2000001'}})));
 });
