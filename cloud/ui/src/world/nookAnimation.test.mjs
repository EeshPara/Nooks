import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('./nookAnimation.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {nookAnimation}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('pilot motion follows only the exact saved, built-in background',()=>{
 for(const roomId of ['rainy-library','howls-moving-study','gryffindor-common-room']){
  const input={workspaceReady:true,roomId,sceneImage:`/images/nooks-50/${roomId}.webp`,customArtwork:false,alternateScene:false,customNook:false};
  assert.equal(nookAnimation(input),`/videos/nooks-animated-pilot/${roomId}.mp4`);
  for(const key of ['customArtwork','alternateScene','customNook'])assert.equal(nookAnimation({...input,[key]:true}),undefined);
  assert.equal(nookAnimation({...input,workspaceReady:false}),undefined);
  assert.equal(nookAnimation({...input,sceneImage:'/images/another-scene.webp'}),undefined);
 }
 assert.equal(nookAnimation({workspaceReady:true,roomId:'unknown',sceneImage:'unknown',customArtwork:false,alternateScene:false,customNook:false}),undefined);
});
