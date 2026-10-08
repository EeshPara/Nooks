#!/usr/bin/env node
/** One bounded read-only deployment sample. No auth, private payloads, retries, or alerts. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const PUBLIC = 'https://nooks-study-space.vercel.app';
const NATIVE = 'https://nooks-study-space.eeshwarpara.chatgpt.site';
const DB = 'https://lcfcjglybfeozyrjjikk.supabase.co';
export function summarizeConfig(j) {
  const key = j?.publishableKey;
  let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (typeof key === 'string' && key.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch {}
  }
  return { backend: ['supabase','unconfigured'].includes(j?.backend) ? j.backend : 'unexpected',
    expectedDatabase: j?.supabaseUrl === DB, publicKeyValid: publicKey,
    accountSync: j?.capabilities?.accountSync === true, community: j?.capabilities?.community === true };
}
export function summarizeHealth(j) {
  return { alive: j?.ok === true && j?.liveness === 'alive', configured: j?.backend?.configured === true,
    observation: ['recent_success','recent_failure','unknown'].includes(j?.backend?.observation) ? j.backend.observation : 'unexpected',
    scope: j?.backend?.scope === 'this-instance' ? 'this-instance' : 'unexpected',
    readinessProven: false };
}
export async function runProbe({publicOrigin=PUBLIC,nativeOrigin=NATIVE,requireAccounts=false,fetchImpl=fetch}={}) {
  for (const origin of [publicOrigin,nativeOrigin]) {
    const u=new URL(origin); if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:') throw new Error('Only HTTPS origins without credentials, paths, or query strings are accepted.');
  }
  const rows=[];
  async function request(label,origin,path,interpret) {
    const started=performance.now();
    try {
      const r=await fetchImpl(origin+path,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json, text/html;q=0.5'}});
      // Bounded response memory and no body persisted. Stream until 128 KiB at most.
      const reader=r.body?.getReader(); const chunks=[];let size=0;
      if(reader) {try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)throw new Error('BODY_LIMIT');chunks.push(value);}} finally {await reader.cancel().catch(()=>{});}}
      const body=Buffer.concat(chunks).toString('utf8');let json=null;try{json=JSON.parse(body);}catch{}
      const result=interpret({status:r.status,body,json,type:r.headers.get('content-type')??'',headers:r.headers});
      rows.push({label,status:r.status,durationMs:Math.round(performance.now()-started),...result}); return {body,json,status:r.status};
    } catch(e) {rows.push({label,pass:false,error:['TimeoutError','AbortError'].includes(e?.name)?'timeout':'transport_or_body_limit',durationMs:Math.round(performance.now()-started)});return null;}
  }
  const page=await request('public_html',publicOrigin,'/',({status,body,type})=>({pass:status===200&&type.includes('text/html')&&body.includes('<html'),sha256:createHash('sha256').update(body).digest('hex')}));
  const paths=[...(page?.body??'').matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(m=>m[1]);
  for(const path of [...new Set(paths)].slice(0,6)) {
    // HEAD avoids downloading multi-megabyte bundles. This proves presence/type, not asset hash or rendering.
    try {const r=await fetchImpl(publicOrigin+path,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type')??'';rows.push({label:'public_asset',path,status:r.status,pass:r.status===200&&(path.endsWith('.js')?/javascript/.test(type):/text\/css/.test(type))});}catch{rows.push({label:'public_asset',path,pass:false,error:'transport'});}
  }
  rows.push({label:'entry_assets_discovered',pass:paths.length>0,count:paths.length});
  await request('public_health',publicOrigin,'/api/health',({status,json,type})=>{const h=summarizeHealth(json);return {pass:status===200&&type.includes('application/json')&&h.alive&&h.observation!=='recent_failure'&&(!requireAccounts||h.configured),...h};});
  const config=await request('public_config',publicOrigin,'/api/config',({status,json,type})=>{const c=summarizeConfig(json);return {pass:status===200&&type.includes('application/json')&&(c.backend==='supabase'?c.expectedDatabase&&c.publicKeyValid&&c.accountSync&&c.community:!requireAccounts&&c.backend==='unconfigured'),...c};});
  const configured=config?.json?.backend==='supabase';
  await request('public_anonymous_boundary',publicOrigin,'/api/workspace',({status,json})=>({pass:configured?status===401&&json?.error?.code==='AUTH_REQUIRED':!requireAccounts&&status===503&&json?.error?.code==='BACKEND_UNAVAILABLE',errorCode:['AUTH_REQUIRED','BACKEND_UNAVAILABLE'].includes(json?.error?.code)?json.error.code:'unexpected'}));
  await request('native_anonymous_gate',nativeOrigin,'/health',({status,json,type})=>({pass:status===401||status===403||(status===200&&type.includes('application/json')&&summarizeHealth(json).alive),accessGated:status===401||status===403,nativeHealthProven:status===200&&summarizeHealth(json).alive}));
  return {sampledAt:new Date().toISOString(),publicOrigin,nativeOrigin,requireAccounts,pass:rows.every(x=>x.pass),rows,limits:['One unauthenticated HTTP sample; no database operation or user journey.','Native 401/403 proves an access gate only.','Health observations are per-instance and expire; unknown is not database readiness.','No email, realtime, save/recovery, load, backup restore, or alert-delivery proof.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);const outAt=args.indexOf('--out');const out=outAt>=0?args[outAt+1]:null;
  if(outAt>=0&&!out)throw new Error('--out needs a filename');
  const accepted=args.filter((_,i)=>outAt<0||(i!==outAt&&i!==outAt+1));if(accepted.some(x=>x!=='--require-accounts'))throw new Error('Usage: node probe.mjs [--require-accounts] [--out report.json]');
  const report=await runProbe({requireAccounts:args.includes('--require-accounts')});const serialized=JSON.stringify(report,null,2)+'\n';if(out)await writeFile(out,serialized,{flag:'wx'});console.log(serialized);if(!report.pass)process.exitCode=2;
}
