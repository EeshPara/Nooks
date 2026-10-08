import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { createBrowserApiHandler } from '../server/browser-api.mjs';
import { createRequestLifetime } from '../server/request-lifetime.mjs';
import { createWorkspace } from '../server/seed.mjs';

const ID='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://nooks-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SERVICE_KEY:'sb_secret_test',NOOKS_PUBLIC_URL:'https://nooks.example'};
const json=value=>new Response(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function waitForAbort(signal) {
 return new Promise((resolve,reject)=>{if(signal.aborted)return reject(signal.reason);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
}
function ordinary(url) {
 if(url.endsWith('/auth/v1/user'))return json({id:ID});
 if(url.endsWith('nooks_resolve_identity'))return json({id:ID});
 if(url.endsWith('nooks_request_limit'))return json({allowed:true});
 if(url.endsWith('nooks_community'))return json({ok:true});
 throw new Error('Unexpected fixture route');
}
async function host(t, fetchImpl, {preparsed=false}={}) {
 const logs=[],calls=[],done=deferred();let pair;
 const handler=createBrowserApiHandler({env,logger:e=>logs.push(e),fetchImpl:(url,init)=>{calls.push({url,init});return fetchImpl(url,init);}});
 const server=createServer((req,res)=>{
  const writes={headers:0,end:0};
  const writeHead=res.writeHead.bind(res),end=res.end.bind(res);
  res.writeHead=(...args)=>{writes.headers++;return writeHead(...args)};
  res.end=(...args)=>{writes.end++;return end(...args)};
  const requestClosed=deferred();req.once('close',requestClosed.resolve);
  pair={req,res,writes,requestClosed};
  if(preparsed){req.body={displayName:'Fixture',avatar:0};req.resume();}
  handler(req,res).then(done.resolve,done.reject);
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const connect=({partial=false,path='/api/tools/profile_update',method='POST'}={})=>{
  const result=deferred();
  const req=httpRequest({host:'127.0.0.1',port:server.address().port,path,method,headers:{origin:'https://nooks.example',authorization:'Bearer fixture','content-type':'application/json'}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>result.resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
  });
  req.on('error',()=>result.resolve({disconnected:true}));
  if(partial)req.write('{');else req.end(method==='GET'?undefined:'{"displayName":"Fixture","avatar":0}');
  return {req,result:result.promise};
 };
 return {connect,calls,logs,done:done.promise,get pair(){return pair}};
}
function assertClean(h) {
 assert.equal(h.pair.req.listenerCount('aborted'),0);
 assert.equal(h.pair.req.listenerCount('close'),0);
 // Node may retain its own ServerResponse close listener; ours has a stable anonymous shape.
 assert.ok(!h.pair.res.listeners('close').some(fn=>fn.toString().includes('writableFinished')));
}

for(const endpoint of ['/auth/v1/user','nooks_request_limit'])test(`real incomplete upload disconnect cancels pending ${endpoint}`,{timeout:5000},async t=>{
 const entered=deferred();let signal;
 const h=await host(t,async(url,init)=>{if(url.endsWith(endpoint)){signal=init.signal;entered.resolve();return waitForAbort(signal)}return ordinary(url)});
 const c=h.connect({partial:true});await entered.promise;assert.equal(signal.aborted,false);c.req.destroy();await h.done;
 assert.equal(signal.aborted,true);assert.equal(signal.reason.name,'AbortError');assert.equal(h.pair.req.complete,false);
 assert.deepEqual(h.pair.writes,{headers:0,end:0});assert.deepEqual(h.logs,[]);assertClean(h);
 assert.equal(h.calls.at(-1).url.endsWith(endpoint),true);
});

test('completed request close does not abort a pending response; later client close does',{timeout:5000},async t=>{
 const entered=deferred();let signal;
 const h=await host(t,async(url,init)=>{if(url.endsWith('nooks_request_limit')){signal=init.signal;entered.resolve();return waitForAbort(signal)}return ordinary(url)},{preparsed:true});
 const c=h.connect();await entered.promise;await h.pair.requestClosed.promise;
 assert.equal(h.pair.req.complete,true);assert.equal(h.pair.req.destroyed,true);assert.equal(signal.aborted,false);
 c.req.destroy();await h.done;assert.equal(signal.aborted,true);assert.deepEqual(h.pair.writes,{headers:0,end:0});assert.deepEqual(h.logs,[]);assertClean(h);
});

test('normal preparsed request close and delayed RPC still return exactly one success',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();let signal;
 const h=await host(t,async(url,init)=>{if(url.endsWith('nooks_community')){signal=init.signal;entered.resolve();await release.promise;}return ordinary(url)},{preparsed:true});
 const c=h.connect();await entered.promise;await h.pair.requestClosed.promise;assert.equal(signal.aborted,false);release.resolve();
 const result=await c.result;await h.done;assert.equal(result.status,200);assert.deepEqual(h.pair.writes,{headers:1,end:1});assert.equal(signal.aborted,false);assert.deepEqual(h.logs,[]);assertClean(h);
 assert.deepEqual(h.calls.map(c=>c.url.split('/').at(-1)),['user','nooks_resolve_identity','nooks_request_limit','nooks_community']);
});

test('disconnect remains active during native fetch response body consumption',{timeout:5000},async t=>{
 const headersSent=deferred(),upstreamClosed=deferred();let signal;
 const upstream=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{"id":');headersSent.resolve();res.once('close',upstreamClosed.resolve);});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 t.after(async()=>{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));});
 const h=await host(t,async(_url,init)=>{signal=init.signal;return fetch(`http://127.0.0.1:${upstream.address().port}/`,init)},{preparsed:true});
 const c=h.connect();await headersSent.promise;await h.pair.requestClosed.promise;c.req.destroy();await h.done;await upstreamClosed.promise;
 assert.equal(signal.aborted,true);assert.equal(h.calls.length,1);assert.deepEqual(h.pair.writes,{headers:0,end:0});assert.deepEqual(h.logs,[]);assertClean(h);
});

test('existing Auth/identity/RPC timeout signals retain duration and connected failure semantics',{timeout:5000},async t=>{
 const original=AbortSignal.timeout,requested=[];
 t.mock.method(AbortSignal,'timeout',ms=>{requested.push(ms);return original(ms===15000?30:ms)});
 const h=await host(t,(url,init)=>url.endsWith('nooks_request_limit')?waitForAbort(init.signal):ordinary(url),{preparsed:true});
 const c=h.connect();const result=await c.result;await h.done;
 assert.equal(result.status,503);assert.equal(result.body.error.code,'BACKEND_UNAVAILABLE');assert.equal(h.logs.length,1);assert.equal(h.logs[0].category,'timeout');assert.deepEqual(requested,[10000,10000,15000]);
 assert.deepEqual(h.pair.writes,{headers:1,end:1});assert.ok(!JSON.stringify(h.logs).includes('sb_secret_test'));assert.ok(!JSON.stringify(result).includes('fixture'));assertClean(h);
});

test('lifetime preserves Request/init options, original abort reason, and removes only its listeners',async()=>{
 const req=new EventEmitter(),res=new EventEmitter(),controller=new AbortController();req.complete=true;res.writableFinished=false;
 const existing=()=>{};req.on('close',existing);res.on('close',existing);
 let seen;const lifetime=createRequestLifetime(req,res,async(input,init)=>{seen={input,init};return waitForAbort(init.signal)});
 const input=new Request('https://nooks.invalid/only',{signal:controller.signal});const init={method:'POST',redirect:'manual',headers:{'x-fixture':'preserved'},body:'{}'};
 const pending=lifetime.fetch(input,init);const reason=new DOMException('Fixture timeout','TimeoutError');controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);assert.equal(lifetime.disconnected,false);assert.equal(seen.input,input);assert.equal(seen.init.redirect,'manual');assert.equal(seen.init.headers,init.headers);assert.equal(seen.init.body,'{}');
 req.emit('close');assert.equal(lifetime.disconnected,false);res.writableFinished=true;res.emit('close');assert.equal(lifetime.disconnected,false);
 lifetime.dispose();lifetime.dispose();assert.deepEqual(req.listeners('close'),[existing]);assert.deepEqual(res.listeners('close'),[existing]);assert.equal(req.listenerCount('aborted'),0);
});

test('already disconnected and caught cancellation cannot start subsequent fetches',async()=>{
 const req=new EventEmitter(),res=new EventEmitter();req.complete=false;req.aborted=true;let calls=0;
 const lifetime=createRequestLifetime(req,res,async()=>{calls++;return json({})});
 for(let i=0;i<2;i++)await assert.rejects(lifetime.fetch('https://nooks.invalid/'),{name:'AbortError'});
 assert.equal(calls,0);lifetime.dispose();assert.equal(req.listenerCount('close'),0);assert.equal(res.listenerCount('close'),0);
});

test('transport resolving despite disconnect cannot initiate another request or write a response',{timeout:5000},async t=>{
 const entered=deferred(),release=deferred();
 const h=await host(t,async url=>{entered.resolve();await release.promise;return ordinary(url)},{preparsed:true});
 const c=h.connect();await entered.promise;c.req.destroy();await once(h.pair.res,'close');release.resolve();await h.done;
 assert.equal(h.calls.length,1);assert.deepEqual(h.pair.writes,{headers:0,end:0});assert.deepEqual(h.logs,[]);assertClean(h);
});

test('preparsed stubs without lifecycle APIs still receive normal failures and no double response',async()=>{
 const logs=[],handler=createBrowserApiHandler({env,logger:e=>logs.push(e),fetchImpl:ordinary});
 const req={url:'/api/tools/profile_update',method:'POST',headers:{origin:env.NOOKS_PUBLIC_URL,authorization:'Bearer fixture','content-type':'application/json'},body:{displayName:[]}};
 const res={writes:0,ends:0,writeHead(status){this.writes++;this.status=status},end(body){this.ends++;this.body=JSON.parse(body);this.writableEnded=true}};
 await handler(req,res);assert.equal(res.status,400);assert.equal(res.writes,1);assert.equal(res.ends,1);
 await handler({...req,url:'/api/config',method:'GET'},res);assert.equal(res.writes,1);assert.equal(res.ends,1);
});

test('caught artwork hydration cancellation emits neither degradation nor response',{timeout:5000},async t=>{
 const workspace=createWorkspace('2026-10-08T00:00:00Z');workspace.artifacts=[];workspace.space={_storedBackground:{path:`${ID}/${'a'.repeat(64)}`,mime:'image/png'}};
 const entered=deferred();let signal;
 const h=await host(t,(url,init)=>{
  if(url.endsWith('nooks_workspace_read'))return json({revision:1,workspace});
  if(url.includes('/storage/v1/object/authenticated/')){signal=init.signal;entered.resolve();return waitForAbort(signal);}
  return ordinary(url);
 },{preparsed:true});
 const c=h.connect({path:'/api/workspace',method:'GET'});await entered.promise;c.req.destroy();await h.done;
 assert.equal(signal.aborted,true);assert.deepEqual(h.logs,[]);assert.deepEqual(h.pair.writes,{headers:0,end:0});assertClean(h);
});
