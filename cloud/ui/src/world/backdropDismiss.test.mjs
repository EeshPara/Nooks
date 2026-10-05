import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('./useBackdropDismiss.ts',import.meta.url),'utf8').replace(/import .*? from 'react';/, 'const useRef = value => ({current:value});');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {useBackdropDismiss}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const panel={getBoundingClientRect:()=>({left:100,right:500,top:100,bottom:400})};
const event=(target=panel,x=50,y=50,button=0)=>({target,currentTarget:panel,clientX:x,clientY:y,button});
test('native backdrop supports click-only host activation without closing its empty inner surface',()=>{
 let closed=0;const h=useBackdropDismiss(()=>closed++,true);
 h.onClickCapture(event(panel,200,200));assert.equal(closed,0);
 h.onClickCapture(event({},200,200));assert.equal(closed,0);
 h.onClickCapture(event());assert.equal(closed,1);
 h.onClickCapture(event(panel,50,50,2));assert.equal(closed,1);
});
test('dragging out of a dialog or cancelling a pointer does not dismiss it',()=>{
 let closed=0;const h=useBackdropDismiss(()=>closed++,true);
 h.onPointerDownCapture(event({},200,200));h.onClickCapture(event());assert.equal(closed,0);
 h.onPointerDownCapture(event());h.onPointerCancelCapture();h.onClickCapture(event());assert.equal(closed,0);
 h.onPointerDownCapture(event());h.onClickCapture(event());assert.equal(closed,1);
});
test('regular modal scrims close on a complete backdrop click and preserve child interactions',()=>{
 let closed=0;const h=useBackdropDismiss(()=>closed++);
 h.onClickCapture(event({}));assert.equal(closed,0);
 h.onClickCapture(event());assert.equal(closed,1);
 h.onPointerDownCapture(event({}));h.onClickCapture(event());assert.equal(closed,1);
});

test('an inside click that stops bubbling cannot swallow the next click-only outside tap',()=>{
 let closed=0;const h=useBackdropDismiss(()=>closed++);
 h.onPointerDownCapture(event({}));
 h.onClickCapture(event({})); // Capture runs before the child stops propagation.
 assert.equal(closed,0);
 h.onClickCapture(event());assert.equal(closed,1);
});
