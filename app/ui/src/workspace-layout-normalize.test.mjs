import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const organization=url(fs.readFileSync(new URL('./organization/types.ts',import.meta.url),'utf8'));
const {normalizeWorkspace,normalizeWorkspaceLayout}=await import(url(fs.readFileSync(new URL('./workspace-normalize.ts',import.meta.url),'utf8').replaceAll("from './organization/types'",`from '${organization}'`)));
const layout={version:1,positions:{spotify:{x:0.3,y:0.8},timer:{x:1,y:0}}};

test('saved layout survives summary updates and follows explicit full snapshots and reset patches',()=>{
 const initial=normalizeWorkspace({artifacts:[],workspaceLayout:layout});
 assert.deepEqual(initial.workspaceLayout,layout);
 assert.deepEqual(normalizeWorkspace({stats:{xp:20}},initial).workspaceLayout,layout);
 assert.deepEqual(normalizeWorkspace({workspaceLayout:{version:1,positions:{}}},initial).workspaceLayout,{version:1,positions:{}});
 assert.deepEqual(normalizeWorkspace({artifacts:[]},initial).workspaceLayout,{version:1,positions:{}});
 assert.deepEqual(normalizeWorkspace({artifacts:[],workspaceLayout:{version:2,positions:layout.positions}},initial).workspaceLayout,{version:1,positions:{}});
});

test('normalization keeps only finite bounded positions for the six supported widgets',()=>{
 const mixed={version:1,positions:{spotify:{x:0,y:1,ignored:'private text'},timer:{x:0,y:Infinity},tasks:{x:'0',y:0},collection:{x:-0.01,y:0},welcome:{x:0,y:1.01},people:{x:0.5,y:0.5},unknown:{x:0,y:0}}};
 assert.deepEqual(normalizeWorkspaceLayout(mixed),{version:1,positions:{spotify:{x:0,y:1},people:{x:0.5,y:0.5}}});
 assert.deepEqual(normalizeWorkspaceLayout({version:1,positions:Object.create({spotify:{x:0,y:0}})}),{version:1,positions:{}});
 assert.deepEqual(normalizeWorkspaceLayout(null),{version:1,positions:{}});
 assert.notEqual(normalizeWorkspaceLayout(layout).positions.spotify,layout.positions.spotify);
});
