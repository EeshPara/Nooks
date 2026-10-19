import test from 'node:test';
import assert from 'node:assert/strict';
import {runProbe,summarizeConfig,summarizeHealth} from './probe.mjs';
const valid={backend:'supabase',supabaseUrl:'https://lcfcjglybfeozyrjjikk.supabase.co',publishableKey:'sb_publishable_test',capabilities:{accountSync:true,community:true}};
function fake({config=valid,badHealth=false,leak=false}={}){return async(url,options)=>{
 const p=new URL(url).pathname;
 if(p==='/' )return new Response('<html><script src="/assets/main-abc.js"></script></html>',{headers:{'content-type':'text/html'}});
 if(p.startsWith('/assets/'))return new Response(null,{headers:{'content-type':'application/javascript'}});
 if(url.includes('chatgpt.site'))return new Response('gate',{status:401});
 if(p==='/api/config')return Response.json(config);
 if(p==='/api/health')return badHealth?new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}}):Response.json({ok:true,liveness:'alive',backend:{configured:config.backend==='supabase',observation:'unknown',scope:'this-instance'}});
 if(p==='/api/workspace')return leak?Response.json({secret:'DO_NOT_PRINT'}):Response.json({error:{code:config.backend==='supabase'?'AUTH_REQUIRED':'BACKEND_UNAVAILABLE'}},{status:config.backend==='supabase'?401:503});
 throw new Error('unexpected URL');
};}
test('configured public transport passes while readiness remains explicitly unproven',async()=>{const r=await runProbe({requireAccounts:true,fetchImpl:fake()});assert.equal(r.pass,true);assert.equal(r.rows.find(x=>x.label==='public_health').readinessProven,false);assert.equal(r.rows.find(x=>x.label==='native_anonymous_gate').nativeHealthProven,false);});
test('SPA health fallback and exposed workspace cannot pass',async()=>{for(const options of [{badHealth:true},{leak:true}]){const r=await runProbe({requireAccounts:true,fetchImpl:fake(options)});assert.equal(r.pass,false);assert.equal(JSON.stringify(r).includes('DO_NOT_PRINT'),false);}});
test('device preview fails account release gate',async()=>{const r=await runProbe({requireAccounts:true,fetchImpl:fake({config:{backend:'unconfigured'}})});assert.equal(r.pass,false);});
test('secret keys and arbitrary bodies are never serialized',()=>{const key='sb_secret_DO_NOT_PRINT';const c=summarizeConfig({...valid,publishableKey:key});assert.equal(c.publicKeyValid,false);assert.equal(JSON.stringify(c).includes(key),false);assert.equal(summarizeHealth('<html>').alive,false);});
