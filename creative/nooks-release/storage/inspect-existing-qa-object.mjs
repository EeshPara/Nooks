#!/usr/bin/env node
/** Exact documented QA object only. Read-only; no fixtures or Storage mutations. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const project='lcfcjglybfeozyrjjikk',origin=`https://${project}.supabase.co`,hash='f1f8ea3690fad0e8b7eb274bbcff6dbd5b8ace3b0da6b12183ff2e0f8d2010b2';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp=new Date().toISOString().replaceAll(':','-'),report={sampledAt:new Date().toISOString(),project,documentedSha256:hash,documentedBytes:173490,passed:false,mutations:0,mode:process.argv.includes('--metadata-only')?'metadata_only':'bounded_byte_verification'};
try{
 const {stdout}=await promisify(execFile)('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{maxBuffer:2*1024*1024});const parsed=JSON.parse(stdout),keys=Array.isArray(parsed)?parsed:parsed.api_keys??parsed.keys;const key=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.api_key?.startsWith('sb_secret_'))?.api_key;if(!key)throw Error('key_unavailable');
 const admin=createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 const rows=await admin.from('nooks_artwork_assets').select('path,account_id,generation,state,created_at,mime').eq('content_hash',hash).gte('created_at','2026-10-04T00:00:00Z').lt('created_at','2026-10-05T00:00:00Z').limit(2);
 if(rows.error)throw Error('catalog_query_failed');report.candidateCount=rows.data.length;if(rows.data.length!==1)throw Error('object_not_uniquely_identified');const row=rows.data[0];
 report.shape={ownerUuidValid:uuid.test(row.account_id),generationUuidValid:uuid.test(row.generation),exactOwnedGenerationPath:row.path===`${row.account_id}/${hash}/${row.generation}`,allowedMime:['image/png','image/jpeg','image/webp'].includes(row.mime),ready:row.state==='ready',mime:['image/png','image/jpeg','image/webp'].includes(row.mime)?row.mime:'unexpected'};
 if(Object.entries(report.shape).some(([name,value])=>name!=='mime'&&value!==true))throw Error('candidate_shape_mismatch');
 report.object={path:row.path,ownerAccount:row.account_id,generation:row.generation,state:row.state,createdAt:row.created_at,mime:row.mime};
 if(!process.argv.includes('--metadata-only')){
 const response=await fetch(`${origin}/storage/v1/object/authenticated/nooks-private/${row.path}`,{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},redirect:'error',signal:AbortSignal.timeout(15000)});report.storageStatus=response.status;if(!response.ok)throw Error('object_read_failed');
 const reader=response.body.getReader(),parts=[];let count=0;try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>200000)throw Error('object_size_limit');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const actual=createHash('sha256').update(Buffer.concat(parts)).digest('hex');report.actualBytes=count;report.byteHashMatches=actual===hash;if(count!==173490||actual!==hash)throw Error('documented_object_mismatch');}
 report.passed=true;
}catch(error){report.failure=/^[a-z_]+$/.test(error?.message??'')?error.message:'read_failed';process.exitCode=1;}
const path=new URL(`./existing-qa-object-preflight-${stamp}.json`,import.meta.url);await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(`Read-only QA object preflight passed: ${report.passed}; candidates: ${report.candidateCount??'unknown'}`);console.log(`Report: ${path.pathname}`);
