import test from 'node:test';
import assert from 'node:assert/strict';
import {runAuthenticatedProbe} from './authenticated-probe.mjs';
const now=()=>Date.parse('2026-10-08T09:00:00Z');
const id='12345678-1234-4234-8234-123456789abc';
const claims={iss:'https://lcfcjglybfeozyrjjikk.supabase.co/auth/v1',sub:id,role:'authenticated',exp:Math.floor(now()/1000)+3600};
const jwt=values=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(values)).toString('base64url')}.testsignature`;
const accessToken=jwt(claims);
const config={backend:'supabase',supabaseUrl:'https://lcfcjglybfeozyrjjikk.supabase.co',publishableKey:'sb_publishable_test',capabilities:{accountSync:true,community:true}};
const workspace={authenticated:true,mode:'connected',recoveryScope:`account:${id}`,workspace:{backend:'supabase',artifacts:[{content:'PRIVATE_CONTENT_MUST_NOT_LEAK'}],focusSessions:[]}};
function setup({configBody=config,response=()=>Response.json(workspace),throwRequest=false}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});if(throwRequest)throw new Error(accessToken+' PRIVATE_CONTENT_MUST_NOT_LEAK');return url.endsWith('/api/config')?Response.json(configBody):response();};
 return {calls,fetchImpl};
}
test('authenticated canary proves the deployed auth path and never reports account/content/token',async()=>{
 const f=setup();const r=await runAuthenticatedProbe({accessToken,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,true);assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].options.headers.Authorization,undefined);assert.equal(f.calls[1].options.headers.Authorization,`Bearer ${accessToken}`);
 for(const call of f.calls){assert.ok(call.url.startsWith('https://nooks-study-space.vercel.app/'));assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'manual');}
 for(const secret of [accessToken,id,'PRIVATE_CONTENT_MUST_NOT_LEAK'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('401 and 503 fail even when configuration looks healthy, without serializing their bodies',async()=>{
 for(const status of [401,503]){const f=setup({response:()=>Response.json({error:{message:accessToken,content:'PRIVATE_CONTENT_MUST_NOT_LEAK'}},{status})});const r=await runAuthenticatedProbe({accessToken,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,false);assert.equal(r.checks[1].status,status);assert.equal(r.checks[1].code,status===401?'auth_rejected':'backend_unavailable');assert.equal(JSON.stringify(r).includes(accessToken),false);}
});
test('config mismatch prevents any authenticated request',async()=>{
 for(const configBody of [{...config,supabaseUrl:'https://other.supabase.co'},{...config,publishableKey:'sb_secret_PRIVATE'},null]){const f=setup({configBody});const r=await runAuthenticatedProbe({accessToken,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,false);assert.equal(f.calls.length,1);assert.equal(r.checks[0].code,'config_mismatch');}
});
test('malformed JSON, SPA fallback, wrong envelope, oversized bodies and redirects fail closed',async()=>{
 const responses=[()=>new Response('{',{headers:{'content-type':'application/json'}}),()=>new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}}),()=>Response.json({authenticated:true,workspace:{}}),()=>Response.json({...workspace,extra:'x'.repeat(131072)}),()=>new Response(null,{status:307,headers:{location:'https://other.invalid/'}})];
 for(const response of responses){const f=setup({response});const r=await runAuthenticatedProbe({accessToken,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,false);assert.equal(f.calls.length,2);}
});
test('missing, secret/service-role, wrong-project, expired and near-expiry credentials never reach network',async()=>{
 const tokens=[undefined,'sb_secret_NEVER_SEND',jwt({...claims,role:'service_role'}),jwt({...claims,iss:'https://other.supabase.co/auth/v1'}),jwt({...claims,exp:Math.floor(now()/1000)-1}),jwt({...claims,exp:Math.floor(now()/1000)+20})];
 for(const token of tokens){const f=setup();const r=await runAuthenticatedProbe({accessToken:token,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,false);assert.equal(f.calls.length,0);assert.equal(r.checks[0].label,'credential');}
});
test('transport exceptions cannot leak arbitrary exception messages',async()=>{
 const f=setup({throwRequest:true});const r=await runAuthenticatedProbe({accessToken,now,fetchImpl:f.fetchImpl});assert.equal(r.pass,false);assert.equal(r.checks[0].code,'transport_failure');assert.equal(JSON.stringify(r).includes(accessToken),false);
});
