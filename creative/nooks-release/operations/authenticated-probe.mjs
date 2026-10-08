#!/usr/bin/env node
/** One operator-supplied dedicated-canary GET. Never log credentials or workspace content. */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { summarizeConfig } from './probe.mjs';
const PUBLIC='https://nooks-study-space.vercel.app';
const ISSUER='https://lcfcjglybfeozyrjjikk.supabase.co/auth/v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function credentialStatus(token,now){
  if(typeof token!=='string'||token.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return 'credential_invalid';
  try{
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
    if(claims.role!=='authenticated'||claims.iss!==ISSUER||!UUID.test(claims.sub??'')||!Number.isSafeInteger(claims.exp))return 'credential_invalid';
    if(claims.exp<=Math.floor(now/1000)+30)return 'credential_expired_or_expiring';
    return null;
  }catch{return 'credential_invalid';}
}
async function boundedJson(response){
  if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error('malformed_response');
  const reader=response.body?.getReader();if(!reader)throw new Error('malformed_response');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)throw new Error('body_limit');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('malformed_response');}
}
export async function runAuthenticatedProbe({accessToken,fetchImpl=fetch,now=Date.now}={}){
  const sampledAt=new Date(now()).toISOString(),checks=[];
  const result=()=>({sampledAt,publicOrigin:PUBLIC,pass:checks.length===2&&checks.every(c=>c.pass),checks,
    limits:['One authenticated workspace GET for an operator-managed dedicated canary; no writes invoked by this probe.',
      'Normal server identity/quota bookkeeping and legacy hydration may write; use an already initialized empty canary account.',
      'No email onboarding, save/recovery, Realtime, load, scheduled monitoring, or alert delivery proof.']});
  const invalid=credentialStatus(accessToken,now());
  if(invalid){checks.push({label:'credential',pass:false,status:0,durationMs:0,code:invalid});return result();}
  async function request(label,path,authenticated,validate){
    const started=performance.now();let status=0;
    try{
      const response=await fetchImpl(PUBLIC+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json',...(authenticated?{Origin:PUBLIC,Authorization:`Bearer ${accessToken}`}:{})}});
      status=response.status;
      if(status!==200){checks.push({label,pass:false,status,durationMs:Math.round(performance.now()-started),code:status===401?'auth_rejected':status===503?'backend_unavailable':status>=300&&status<400?'redirect_rejected':'http_failure'});await response.body?.cancel().catch(()=>{});return false;}
      const body=await boundedJson(response);const pass=validate(body);
      checks.push({label,pass,status,durationMs:Math.round(performance.now()-started),code:pass?'ok':label==='public_config'?'config_mismatch':'malformed_workspace'});return pass;
    }catch(error){checks.push({label,pass:false,status,durationMs:Math.round(performance.now()-started),code:['TimeoutError','AbortError'].includes(error?.name)?'timeout':['malformed_response','body_limit'].includes(error?.message)?error.message:'transport_failure'});return false;}
  }
  const configured=await request('public_config','/api/config',false,body=>{const c=summarizeConfig(body);return c.backend==='supabase'&&c.expectedDatabase&&c.publicKeyValid&&c.accountSync&&c.community;});
  // Never send a credential after a wrong or malformed config, nor follow redirects.
  if(configured)await request('authenticated_workspace','/api/workspace',true,body=>body?.authenticated===true&&body?.mode==='connected'&&object(body.workspace)&&body.workspace.backend==='supabase'&&Array.isArray(body.workspace.artifacts)&&Array.isArray(body.workspace.focusSessions)&&typeof body.recoveryScope==='string'&&body.recoveryScope.startsWith('account:')&&UUID.test(body.recoveryScope.slice(8)));
  return result();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),outAt=args.indexOf('--out'),out=outAt>=0?args[outAt+1]:null;
  if((outAt>=0&&!out)||args.filter((_,i)=>outAt<0||(i!==outAt&&i!==outAt+1)).length)throw new Error('Usage: node authenticated-probe.mjs [--out report.json]; supply NOOKS_CANARY_ACCESS_TOKEN through the operator secret environment.');
  const accessToken=process.env.NOOKS_CANARY_ACCESS_TOKEN;delete process.env.NOOKS_CANARY_ACCESS_TOKEN;
  const report=await runAuthenticatedProbe({accessToken});const serialized=JSON.stringify(report,null,2)+'\n';
  if(out)await writeFile(out,serialized,{flag:'wx'});console.log(serialized);if(!report.pass)process.exitCode=2;
}
