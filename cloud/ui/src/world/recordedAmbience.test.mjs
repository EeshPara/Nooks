import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
let source = fs.readFileSync(new URL('./recordedAmbience.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '');
source = `const rain='',stove='',hearth='';` + source;
const code = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.ES2022 } }).outputText;
const { fireVariant, recordingBytes } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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
