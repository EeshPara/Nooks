import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./AmbientQuickControl.tsx', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace('export function', 'function');
const code = ts.transpileModule(`export function create(React,useSoundSources,Pause,Play,VolumeX) { ${source}; return AmbientQuickControl; }`, { compilerOptions: { module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { create } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function control(overrides = {}) {
 const calls=[]; const sound={ id:'ambient', playing:false, muted:false, volume:.45, busy:false, subtitle:'Rain', togglePlayback:()=>calls.push('toggle'), toggleMuted:()=>calls.push('mute'), setVolume:v=>calls.push(['volume',v]), ...overrides };
 const Component=create({createElement:(type,props,...children)=>({type,props,children})},()=>[sound],()=>{},()=>{},()=>{});
 return { button:Component({onOpen:()=>calls.push('open')}), calls };
}
test('one tap plays paused ambience; active ambience pauses',()=>{
 for(const playing of [false,true]){ const h=control({playing}); h.button.props.onClick(); assert.deepEqual(h.calls,['toggle']); }
});
test('playing but muted or zero-volume ambience is made audible without pausing or double-toggling mute',()=>{
 for(const values of [{playing:true,muted:true},{playing:true,volume:0}]){ const h=control(values); h.button.props.onClick(); assert.deepEqual(h.calls,[['volume',.45]]); }
});
test('audio errors open recovery controls rather than pretending playback started',()=>{
 const h=control({error:'Tap to enable sound'}); h.button.props.onClick(); assert.deepEqual(h.calls,['open']);
});
