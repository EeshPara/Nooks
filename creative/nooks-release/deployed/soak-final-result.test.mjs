/** Evaluate actual final-result source with injected late callbacks; no harness execution/network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assert as check} from './soak-control.mjs';
const source=await readFile(new URL('./verify-deployed-soak.mjs',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const finalChecks=source.slice(source.lastIndexOf(' report.releaseEnd=await releaseIdentity();'),source.indexOf('\n }\n}catch(error){stop(safeCode(error));'));
const override=source.slice(source.indexOf(' if(abortReason){report.passed=false;report.failure='),source.indexOf('\n await saveReport();',source.indexOf(' if(abortReason){report.passed=false;report.failure=')));

test('channel failure during final manifest response cannot become a pass',async()=>{
 const report={passed:false,releaseStart:{id:'fixture'},phases:[]};
 const finish=new AsyncFunction('report','assert',"let abortReason=null;const finalStart=performance.now();const releaseIdentity=async()=>{await Promise.resolve();abortReason='unexpected_channel_failure';return {id:'fixture'}};"+finalChecks);
 await assert.rejects(finish(report,check),/unexpected_channel_failure/);assert.equal(report.passed,false);
});

test('final output overrides tentative success and retains the original abort code and phase after cleanup',()=>{
 const finish=new Function('report','abortReason','abortPhase','phase','process',override);
 const report={passed:true,cleanupVerification:{allAbsent:true}},process={exitCode:0};
 finish(report,'unexpected_broadcast_payload','final_checks','cleanup',process);
 assert.equal(report.passed,false);assert.equal(process.exitCode,1);assert.deepEqual(report.failure,{phase:'final_checks',code:'unexpected_broadcast_payload'});
});

test('normal final output and prior cleanup failures are unchanged without an abort',()=>{
 const finish=new Function('report','abortReason','abortPhase','phase','process',override);
 for(const passed of [false,true]){const report={passed},process={exitCode:passed?0:1};finish(report,null,null,'cleanup',process);assert.equal(report.passed,passed);assert.equal(process.exitCode,passed?0:1);}
});
