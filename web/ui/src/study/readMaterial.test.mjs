import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./readMaterial.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const {readCompleteMaterial} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const note = {id:'n',kind:'note',revision:2,title:'Cells'};
test('combines every note page, including final recently saved sentence',async()=>{
 const offsets=[];
 const value=await readCompleteMaterial('n',async(id,offset)=>{offsets.push(offset);return {artifact:{...note,content:offset===0?'First. ':'Last sentence.'},offset,nextOffset:offset===0?7:null};});
 assert.equal(value.content,'First. Last sentence.');assert.deepEqual(offsets,[0,7]);
});
test('keeps all structured questions across pages',async()=>{
 const value=await readCompleteMaterial('n',async(id,offset)=>({artifact:{...note,kind:'quiz',questions:[{id:String(offset),prompt:'Question'}]},offset,nextOffset:offset===0?1:null}));
 assert.deepEqual(value.questions.map(q=>q.id),['0','1']);
});
test('rejects mixed revisions rather than generating from inconsistent text',async()=>{
 await assert.rejects(readCompleteMaterial('n',async(id,offset)=>({artifact:{...note,revision:offset?3:2,content:'abc'},nextOffset:offset?null:3})),/changed while loading/);
});
test('rejects wrong item and incomplete pagination',async()=>{
 await assert.rejects(readCompleteMaterial('n',async()=>({artifact:{...note,id:'other',content:'a'}})),/could not be opened/);
 await assert.rejects(readCompleteMaterial('n',async()=>({artifact:{...note,content:'abc'},nextOffset:7})),/incomplete page/);
});
