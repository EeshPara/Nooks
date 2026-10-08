#!/usr/bin/env node
/** Explicit one-fixture live validation of the canary. No emails or persistent credentials. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {runAuthenticatedProbe} from './authenticated-probe.mjs';
import {summarizeConfig} from './probe.mjs';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const PROJECT='lcfcjglybfeozyrjjikk',DB=`https://${PROJECT}.supabase.co`,PUBLIC='https://nooks-study-space.vercel.app';
if(process.argv.slice(2).join(' ')!=='--run-authorized-one-fixture'){console.log('Prepared only. Explicit authorization requires --run-authorized-one-fixture.');process.exit(0);}
const stamp=new Date().toISOString().replaceAll(':','-');
const reportPath=new URL(`./authenticated-probe-fixture-${stamp}.json`,import.meta.url);
const probePath=new URL(`./authenticated-probe-live-${stamp}.json`,import.meta.url);
const report={startedAt:new Date().toISOString(),project:PROJECT,publicOrigin:PUBLIC,fixtureCount:0,passed:false,cleanup:[],limits:['Admin-confirmed disposable identity bypasses email onboarding; no persistent canary setup or scheduling.','Workspace GET is read-oriented but invokes normal identity/quota bookkeeping and may hydrate legacy state.']};
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
let admin,userId,accountId,accessToken,phase='configuration';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const save=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
try{
 const response=await fetch(`${PUBLIC}/api/config`,{redirect:'error',signal:AbortSignal.timeout(15000)});const config=await response.json(),safe=summarizeConfig(config);
 check(response.ok&&safe.backend==='supabase'&&safe.expectedDatabase&&safe.publicKeyValid&&safe.accountSync&&safe.community,'configuration_mismatch');
 phase='credential_setup';const {stdout}=await promisify(execFile)('supabase',['projects','api-keys','--project-ref',PROJECT,'--output','json'],{maxBuffer:2*1024*1024});
 const parsed=JSON.parse(stdout),keys=Array.isArray(parsed)?parsed:parsed.api_keys??parsed.keys;
 const serviceKey=keys?.find(k=>k.name==='service_role')?.api_key??keys?.find(k=>k.api_key?.startsWith('sb_secret_'))?.api_key;
 check(serviceKey,'credential_unavailable');admin=createClient(DB,serviceKey,options);
 phase='fixture_creation';const email=`nooks-canary-${randomUUID()}@example.invalid`,password=randomBytes(30).toString('base64url');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});check(!created.error&&created.data?.user?.id,'fixture_creation_failed');
 userId=created.data.user.id;report.fixtureCount=1;report.fixtureAuthId=userId;await save();
 phase='fixture_authentication';const client=createClient(DB,config.publishableKey,options);const signed=await client.auth.signInWithPassword({email,password});check(!signed.error&&signed.data.session?.access_token,'fixture_authentication_failed');accessToken=signed.data.session.access_token;
 phase='empty_initialization';const initialized=await fetch(`${PUBLIC}/api/workspace`,{method:'GET',redirect:'error',headers:{Origin:PUBLIC,Authorization:`Bearer ${accessToken}`,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const workspace=await initialized.json();check(initialized.ok&&workspace.authenticated===true&&workspace.mode==='connected'&&workspace.workspace?.artifacts?.length===0&&workspace.workspace?.focusSessions?.length===0,'empty_initialization_failed');
 const mapped=await admin.from('nooks_accounts').select('id').eq('auth_user_id',userId).single();check(!mapped.error&&mapped.data?.id,'account_mapping_failed');accountId=mapped.data.id;report.fixtureAccountId=accountId;report.fixtureThrottleTopics=[`account:${accountId}`];await save();
 phase='authenticated_probe';const probe=await runAuthenticatedProbe({accessToken});await writeFile(probePath,JSON.stringify(probe,null,2)+'\n',{flag:'wx'});report.probeReport=probePath.pathname.split('/').at(-1);report.probePassed=probe.pass;check(probe.pass,'authenticated_probe_failed');report.passed=true;
}catch(error){report.failure={phase,code:['configuration_mismatch','credential_unavailable','fixture_creation_failed','fixture_authentication_failed','empty_initialization_failed','account_mapping_failed','authenticated_probe_failed'].includes(error?.message)?error.message:'execution_failed'};process.exitCode=1;}
finally{
 if(admin&&userId){
  if(accessToken)try{const r=await admin.auth.admin.signOut(accessToken,'global');report.cleanup.push({type:'session_revoke',ok:!r.error||r.error.status===404});}catch{report.cleanup.push({type:'session_revoke',ok:false});}
  try{const lookup=await admin.from('nooks_accounts').select('id').eq('auth_user_id',userId);check(!lookup.error,'lookup');for(const row of lookup.data??[]){accountId=row.id;report.fixtureAccountId=accountId;report.fixtureThrottleTopics=[`account:${accountId}`];const r=await admin.from('nooks_accounts').delete().eq('id',accountId);report.cleanup.push({type:'account_delete',ok:!r.error});}}catch{report.cleanup.push({type:'account_delete',ok:false});}
  try{const r=await admin.auth.admin.deleteUser(userId);report.cleanup.push({type:'auth_delete',ok:!r.error});}catch{report.cleanup.push({type:'auth_delete',ok:false});}
  try{const remaining=await admin.from('nooks_accounts').select('id').eq('auth_user_id',userId);const auth=await admin.auth.admin.getUserById(userId);report.cleanupVerification={accountsRemaining:remaining.data?.length??null,accountQueryOk:!remaining.error,authAbsent:auth.error?.status===404&&!auth.data?.user};}catch{report.cleanupVerification={queryFailed:true};}
 }
 if(report.cleanup.some(c=>!c.ok)||(userId&&!(report.cleanupVerification?.accountsRemaining===0&&report.cleanupVerification?.accountQueryOk&&report.cleanupVerification?.authAbsent))){report.passed=false;process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await save();console.log(`Live canary passed: ${report.passed}; cleanup failures: ${report.cleanup.filter(c=>!c.ok).length}`);console.log(`Report: ${reportPath.pathname}`);
}
