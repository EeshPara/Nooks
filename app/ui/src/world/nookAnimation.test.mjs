import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import ts from 'typescript';
const films=JSON.parse(await readFile(new URL('./nookFilms.json',import.meta.url),'utf8'));
const source=(await readFile(new URL('./nookAnimation.ts',import.meta.url),'utf8'))
 .replace("import approvedFilms from './nookFilms.json';",`const approvedFilms=${JSON.stringify(films)};`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {nookAnimation}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('approved motion follows only the exact saved, built-in background',()=>{
 for(const [roomId,film] of Object.entries(films)){
  const input={workspaceReady:true,roomId,sceneImage:`/images/nooks-50/${roomId}.webp`,customArtwork:false,alternateScene:false,customNook:false};
  assert.equal(nookAnimation(input),film.video);
  for(const key of ['customArtwork','alternateScene','customNook'])assert.equal(nookAnimation({...input,[key]:true}),undefined);
  assert.equal(nookAnimation({...input,workspaceReady:false}),undefined);
  assert.equal(nookAnimation({...input,sceneImage:'/images/another-scene.webp'}),undefined);
 }
 assert.equal(nookAnimation({workspaceReady:true,roomId:'unknown',sceneImage:'unknown',customArtwork:false,alternateScene:false,customNook:false}),undefined);
});

test('every advertised film and source artwork physically exists in this build target', async()=>{
 assert.ok(Object.keys(films).length >= 3);
 for(const [roomId,film] of Object.entries(films)){
  assert.match(roomId,/^[a-z0-9-]+$/);
  assert.equal(film.image,`/images/nooks-50/${roomId}.webp`);
  assert.match(film.video,/^\/videos\/nooks-animated-(?:pilot|all)\/[a-z0-9-]+\.mp4$/);
  for(const asset of [film.image,film.video]){
   const info=await stat(new URL(`../../public${asset}`,import.meta.url));
   assert.ok(info.isFile() && info.size > 0,`${roomId}: ${asset}`);
  }
 }
});

test('unknown and inherited names never select a film',()=>{
 for(const roomId of ['missing-film','__proto__','constructor','toString']){
  assert.equal(nookAnimation({workspaceReady:true,roomId,sceneImage:`/images/nooks-50/${roomId}.webp`,customArtwork:false,alternateScene:false,customNook:false}),undefined);
 }
});
