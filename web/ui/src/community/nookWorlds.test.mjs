import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const moduleURL=text=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const scenes=await import(moduleURL(await readFile(new URL('../personalization/types.ts',import.meta.url),'utf8')));
const source=(await readFile(new URL('./nookWorlds.ts',import.meta.url),'utf8')).replace("import { allRoomScenes, type RoomCategory } from '../personalization/types';",`const allRoomScenes=${JSON.stringify(scenes.allRoomScenes)};`);
const {nookWorlds,getNookWorld,worldProgress,roomUnlocked,worldMilestones}=await import(moduleURL(source));
const hogwarts=nookWorlds[0];
test('18 available worlds cover all50 scenes once, plus only the existing castle',()=>{
 assert.equal(nookWorlds.length,18);assert.equal(new Set(nookWorlds.map(world=>world.id)).size,18);
 const ids=nookWorlds.flatMap(world=>world.rooms.map(room=>room.roomId));assert.equal(ids.length,51);assert.equal(new Set(ids).size,51);
 assert.deepEqual([...ids].sort(),[...scenes.roomScenes.map(room=>room.id),'castle-study'].sort());
 for(const world of nookWorlds){
  assert.ok(world.rooms.some(room=>room.roomId===world.coverRoomId&&room.minutes===0));
  for(const room of world.rooms){assert.ok(scenes.allRoomScenes.some(scene=>scene.id===room.roomId&&(world.progression ? scene.title.replace('Hogwarts — ', '') : scene.title)===room.title));assert.equal(getNookWorld(room.roomId),world);}
  if(world!==hogwarts){assert.equal(world.progression,false);assert.ok(world.rooms.every(room=>room.minutes===0));assert.deepEqual(worldMilestones(world),[]);}
 }
 assert.equal(getNookWorld('missing'),undefined);assert.equal(getNookWorld('__proto__'),undefined);
});
test('Hogwarts has four initial houses and exact45/120minute room thresholds',()=>{
 assert.equal(hogwarts.id,'hogwarts');assert.equal(hogwarts.progression,true);assert.deepEqual(hogwarts.rooms.map(room=>room.minutes),[0,0,0,0,45,120]);
 for(const room of hogwarts.rooms.slice(0,4))assert.equal(roomUnlocked(hogwarts,room,{}),true);
 for(const room of hogwarts.rooms.slice(4)){
  assert.equal(roomUnlocked(hogwarts,room,{'gryffindor-common-room':{focusSeconds:room.minutes*60-1}}),false);
  assert.equal(roomUnlocked(hogwarts,room,{'gryffindor-common-room':{focusSeconds:room.minutes*60}}),true);
 }
});
test('progress aggregates unique valid seconds, excluding other worlds and inherited entries',()=>{
 const duplicate={...hogwarts,rooms:[...hogwarts.rooms,hogwarts.rooms[0]]};
 const progress=Object.assign(Object.create({'castle-study':{focusSeconds:9999}}),{'gryffindor-common-room':{focusSeconds:100},'slytherin-common-room':{focusSeconds:200.5},'hufflepuff-common-room':{focusSeconds:-5},'ravenclaw-tower':{focusSeconds:NaN},'moonlit-observatory':{focusSeconds:Infinity},'rainy-library':{focusSeconds:99999}});
 assert.equal(worldProgress(duplicate,progress),300.5);assert.equal(worldProgress(hogwarts,{'gryffindor-common-room':{focusSeconds:'200'}}),0);
 assert.ok(Number.isFinite(worldProgress(hogwarts,{'gryffindor-common-room':{focusSeconds:Number.MAX_VALUE},'slytherin-common-room':{focusSeconds:Number.MAX_VALUE}})));
});
test('prior focus/current room preserve access without opening unrelated rooms',()=>{
 const castle=hogwarts.rooms[4],observatory=hogwarts.rooms[5];
 assert.equal(roomUnlocked(hogwarts,castle,{},castle.roomId),true);assert.equal(roomUnlocked(hogwarts,castle,{[castle.roomId]:{focusSeconds:1}}),true);
 assert.equal(roomUnlocked(hogwarts,observatory,{[castle.roomId]:{focusSeconds:1}},castle.roomId),false);
 assert.equal(roomUnlocked(hogwarts,{...castle,minutes:0},{}),false);
 assert.equal(roomUnlocked(hogwarts,{roomId:'unknown',minutes:0,title:'Unknown'},{},'unknown'),false);
});
test('projected items and rooms form the exact ordered journey with existing themed art',async()=>{
 const milestones=worldMilestones(hogwarts);assert.deepEqual(milestones.map(item=>item.minutes),[15,30,45,75,105,120]);
 assert.deepEqual(milestones.map(item=>item.kind),['item','item','room','item','item','room']);
 assert.deepEqual(milestones.filter(item=>item.kind==='item').map(item=>item.art),['letter','wand','cloak','spellbook']);
 const artwork=await readFile(new URL('../world/RewardDrawing.tsx',import.meta.url),'utf8');
 const {rewardArt}=await import(moduleURL(artwork.slice(0,artwork.indexOf('export function RewardDrawing'))));
 for(const item of milestones){if(item.kind==='room')assert.equal(hogwarts.rooms.find(room=>room.roomId===item.roomId).minutes,item.minutes);else assert.ok(Object.hasOwn(rewardArt,item.art),item.art);}
 const again=worldMilestones(hogwarts);milestones[0].title='changed';assert.notEqual(again[0].title,'changed');
});
