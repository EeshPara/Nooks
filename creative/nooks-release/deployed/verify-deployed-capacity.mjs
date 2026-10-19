/** Authorized bounded hosted fixture test. No production source changes or email sends. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { communityTools } from '../../../web/server/community-tools.mjs';
const require = createRequire(new URL('../../../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const PROJECT = 'lcfcjglybfeozyrjjikk', url = `https://${PROJECT}.supabase.co`;
const profileNames={pre:'CQA pre',post:'CQA post',200:'CQA update 200',500:'CQA update 500',750:'CQA update 750'};
const profileSchema=communityTools.find(tool=>tool.name==='profile_update')?.inputSchema;
for(const name of Object.values(profileNames))assertFixtureName(name);
function assertFixtureName(name){const field=profileSchema?.properties?.displayName;if(!field||name.length<field.minLength||name.length>field.maxLength)throw new Error('Capacity fixture profile violates current product schema');}
if (!process.argv.includes('--run-authorized-100')) { console.log('Prepared. Explicit bounded run requires --run-authorized-100.'); process.exit(0); }
const stamp = new Date().toISOString().replaceAll(':', '-');
const reportPath = new URL(`./report-${stamp}.json`, import.meta.url);
const manifestPath = new URL(`./fixtures-${stamp}.json`, import.meta.url);
const report = { startedAt: new Date().toISOString(), project: PROJECT,
  transport: 'Actual deployed HTTPS https://nooks-study-space.vercel.app; real hosted Supabase Auth, DB and direct Supabase WebSockets. Not browser or email onboarding verification.',
  bound: { users: 100, sockets: 100, privateChannelsPerSocket: 3, durationSeconds: 120, scheduledApiPerSecond: 8, absoluteApiPerSecond: 12 },
  phases: [], cleanup: [], socketFailures: [], delivery: [], limitations: ['Admin-confirmed fixtures bypass email onboarding', 'Single generator and private room; no browser rendering', 'Short bounded sample, not 1000-user or production readiness proof', 'API scheduling pauses during sequential reconnect of 10 identities; 120 seconds is wall duration'] };
const users = [], rooms = [], samples = [], inFlight = new Set();
const origin='https://nooks-study-space.vercel.app';
let admin, publicKey, abortReason, stopping = false, phase = 'setup', lastApiStart = 0, rateQueue = Promise.resolve();
let roomId, setupStarted = performance.now(), monitor, stoppedBySignal = false, lastLoginStart = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) } };
function safeError(error) { return { name: error?.name ?? 'Error', status: Number.isInteger(error?.status) ? error.status : undefined }; }
function stats(rows) { const values = rows.map(s => s.ms).sort((a,b) => a-b), pick = p => values[Math.max(0, Math.ceil(values.length*p)-1)] ?? null; return { requests: rows.length, errors: rows.filter(s=>!s.ok).length, errorRate: rows.length ? rows.filter(s=>!s.ok).length/rows.length : 0, p50Ms: pick(.5), p95Ms: pick(.95), p99Ms: pick(.99), maxMs: values.at(-1) ?? null }; }
async function checkpoint() { await writeFile(manifestPath, JSON.stringify({ project: PROJECT, startedAt: report.startedAt, users: users.map(u=>({id:u.id, account:u.account})), rooms, throttleTopics: [...users.filter(u=>u.account).map(u=>`account:${u.account}`),...rooms.map(id=>`nook:${id}`)], sharedDirectoryTopic: 'nooks:directory (never delete shared topic)' }, null, 2)+'\n'); }
async function api(user, tool, args = {}, measured = false) {
  const turn = rateQueue.then(async () => { await sleep(Math.max(0, 90-(performance.now()-lastApiStart))); lastApiStart=performance.now(); });
  rateQueue=turn.catch(()=>{}); await turn;
  const started=performance.now(); let status=0, ok=false;
  try { const response=await fetch(`${origin}${tool==='workspace'?'/api/workspace':`/api/tools/${tool}`}`, { redirect:'error', method:tool==='workspace'?'GET':'POST', headers:{ origin, 'content-type':'application/json', authorization:`Bearer ${user.token}` }, ...(tool==='workspace'?{}:{body:JSON.stringify(args)}), signal:AbortSignal.timeout(15000) }); status=response.status; const body=await response.json(); if(!response.ok)report.lastHttpFailure={tool,status:response.status,requestId:response.headers.get('x-request-id'),code:/^[A-Z_]+$/.test(body?.error?.code??'')?body.error.code:'unknown'}; assert(response.ok, `API ${tool} returned ${status}; code ${/^[A-Z_]+$/.test(body?.error?.code??'')?body.error.code:'unknown'}`); ok=true; return body; }
  finally { if(measured) samples.push({tool,ms:Math.round(performance.now()-started),status,ok}); }
}
async function connect(user) {
  const client=user.socket ??= createClient(url,publicKey,clientOptions);
  await client.realtime.setAuth(user.token); user.channelCounts={}; user.connected=false; user.expectedDisconnect=false;
  const topics=['nooks:directory',`account:${user.account}`,`nook:${roomId}`];
  await Promise.all(topics.map(topic=>new Promise((resolve,reject)=>{
    let settled=false; const timer=setTimeout(()=>{ if(!settled){settled=true;reject(new Error('Subscription timeout'));} },15000);
    const channel=client.channel(topic,{config:{private:true}}).on('broadcast',{event:'invalidate'},event=>{
      const p=event.payload; if(!p||p.v!==1||Object.keys(p).some(k=>k!=='v'&&k!=='id')){abortReason='Unexpected broadcast payload';return;}
      user.channelCounts[topic]=(user.channelCounts[topic]??0)+1;
      if(topic===`nook:${roomId}`) {user.roomHints=(user.roomHints??0)+1;user.lastRoomHint=performance.now();}
    }).subscribe(status=>{
      if(status==='SUBSCRIBED'&&!settled){settled=true;clearTimeout(timer);resolve();}
      else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&!user.expectedDisconnect&&!stopping){
        report.socketFailures.push({userIndex:users.indexOf(user),topicKind:topic.split(':')[0],status,phase});
        if(!settled){settled=true;clearTimeout(timer);reject(new Error(`Subscription ${status}`));}
        else abortReason='Unexpected socket/channel failure';
      }
    });
  })));
  user.connected=true;
}
async function disconnect(user) { if(!user.socket)return; user.expectedDisconnect=true; user.connected=false; await user.socket.removeAllChannels(); user.socket.realtime.disconnect(); }
async function fanout(label) {
  const baseline=users.map(u=>u.roomHints??0),start=performance.now();
  await api(users[0],'profile_update',{displayName:profileNames[label],avatar:0});
  for(let i=0;i<40&&users.some((u,n)=>(u.roomHints??0)<=baseline[n]);i++)await sleep(250);
  const rows=users.map((u,n)=>({received:(u.roomHints??0)>baseline[n],ms:Math.round((u.lastRoomHint??start)-start)}));
  report.delivery.push({label,received:rows.filter(x=>x.received).length,requested:users.length,elapsedMs:Math.round(performance.now()-start),...stats(rows.filter(x=>x.received).map(x=>({ms:x.ms,ok:true})))});
  assert(rows.every(x=>x.received),'Fanout missing recipients');
}
async function cleanup() {
  stopping=true; clearInterval(monitor); await Promise.allSettled([...inFlight]);
  for(const user of users) {try{await disconnect(user);}catch{report.cleanup.push({type:'socket',id:user.id,ok:false});}}
  if(admin){
    for(const id of rooms){try{const r=await admin.from('nooks_rooms').delete().eq('id',id);report.cleanup.push({type:'room',id,ok:!r.error});}catch(e){report.cleanup.push({type:'room',id,ok:false,...safeError(e)});}}
    for(const user of users){
      try {const lookup=await admin.from('nooks_accounts').select('id').eq('auth_user_id',user.id);assert(!lookup.error,'cleanup lookup');for(const row of lookup.data??[]){user.account=row.id;const r=await admin.from('nooks_accounts').delete().eq('id',row.id);report.cleanup.push({type:'account',id:row.id,ok:!r.error});}}catch(e){report.cleanup.push({type:'account',id:user.id,ok:false,...safeError(e)});}
      try{if(user.token){const s=await admin.auth.admin.signOut(user.token,'global');report.cleanup.push({type:'session-revoke',id:user.id,ok:!s.error||s.error.status===404});}const r=await admin.auth.admin.deleteUser(user.id);report.cleanup.push({type:'auth-user',id:user.id,ok:!r.error});}catch(e){report.cleanup.push({type:'auth-user',id:user.id,ok:false,...safeError(e)});}
    }
    const remainingAccounts=await admin.from('nooks_accounts').select('id').in('auth_user_id',users.map(u=>u.id));
    const remainingRooms=rooms.length?await admin.from('nooks_rooms').select('id').in('id',rooms):{data:[],error:null};
    report.cleanupVerification={accountsRemaining:remainingAccounts.data?.length??null,roomsRemaining:remainingRooms.data?.length??null,queryOk:!remainingAccounts.error&&!remainingRooms.error};
    report.fixtureThrottleTopics=[...users.filter(u=>u.account).map(u=>`account:${u.account}`),...rooms.map(id=>`nook:${id}`)];
    report.throttleCleanup='Private throttle table is not exposed to Data API; exact fixture topics recorded for separately authorized SQL cleanup. Shared directory topic must be preserved.';
  }
  await checkpoint();
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stoppedBySignal=true;abortReason='Interrupted; bounded ramp/workload stopping';});
try {
  const configured=await fetch(`${origin}/api/config`,{redirect:'error',signal:AbortSignal.timeout(20000)});const config=await configured.json();assert(configured.ok&&config.backend==='supabase'&&config.supabaseUrl===url&&config.capabilities?.community===true,'Deployed project configuration mismatch');report.deployedConfig={origin,supabaseUrl:config.supabaseUrl,backend:config.backend,community:config.capabilities.community};
  const {stdout}=await promisify(execFile)('supabase',['projects','api-keys','--project-ref',PROJECT,'--output','json'],{maxBuffer:2*1024*1024});
  const parsed=JSON.parse(stdout),keys=Array.isArray(parsed)?parsed:parsed.api_keys??parsed.keys;
  publicKey=config.publishableKey;
 assert(typeof publicKey==='string'&&publicKey.startsWith('sb_publishable_'),'Expected deployed public publishable key');
  const serviceKey=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.api_key?.startsWith('sb_secret_'))?.api_key;
  assert(publicKey&&serviceKey,'Missing project keys');admin=createClient(url,serviceKey,clientOptions);
  const health=await fetch(`${url}/auth/v1/health`,{headers:{apikey:publicKey},signal:AbortSignal.timeout(10000)});assert(health.ok,`Auth preflight ${health.status}`);
  const db=await admin.from('nooks_rooms').select('id',{head:true,count:'exact'});assert(!db.error,'Database preflight failed');
  report.preflight={authStatus:health.status,databaseRead:true};
  for(let i=0;i<100;i++){
    assert(!abortReason,abortReason);const email=`nooks-capacity-${randomUUID()}@example.invalid`,password=randomBytes(30).toString('base64url');
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!created.error&&created.data?.user?.id,`Fixture creation failed at ${i}`);
    const user={id:created.data.user.id};users.push(user);await checkpoint();
    // Respect the documented token-endpoint bucket (150/5min; burst30).
    // Do not spoof IPs, raise limits, or bypass the normal password grant.
    await sleep(Math.max(0,2500-(performance.now()-lastLoginStart)));lastLoginStart=performance.now();
    const auth=createClient(url,publicKey,clientOptions);const signed=await auth.auth.signInWithPassword({email,password});
    if(signed.error||!signed.data.session?.access_token){report.authSetupFailure={index:i,...safeError(signed.error),code:/^[a-z_]+$/.test(signed.error?.code??'')?signed.error.code:undefined};throw new Error(`Fixture login failed at ${i}; status ${signed.error?.status??'unknown'}`);}user.token=signed.data.session.access_token;
    const workspace=await api(user,'workspace');user.account=workspace.recoveryScope?.slice(8);if(!user.account){const mapped=await admin.from('nooks_accounts').select('id').eq('auth_user_id',user.id).single();assert(!mapped.error&&mapped.data?.id,'Mapping failed');user.account=mapped.data.id;}
    await checkpoint();if((i+1)%10===0)console.log(`Created ${i+1}/100 distinct authenticated fixtures`);
  }
  assert(new Set(users.map(u=>u.id)).size===100&&new Set(users.map(u=>u.account)).size===100,'Fixture identities not unique');
  const created=await api(users[0],'nook_create',{requestId:randomUUID(),title:'Ephemeral bounded capacity fixture',roomId:'rainy-library',visibility:'private'});roomId=created.nook.id;rooms.push(roomId);await checkpoint();
  for(let offset=1;offset<100;offset+=25){const invite=(await api(users[0],'nook_invite_create',{nookId:roomId,maxUses:25})).invite;for(const user of users.slice(offset,offset+25))await api(user,'nook_invite_accept',{token:invite.token});}
  const snapshot=await api(users[0],'nook_snapshot',{nookId:roomId});assert(snapshot.memberCount===100,'Expected100members');
  report.phases.push({name:'fixture setup',users:100,members:snapshot.memberCount,elapsedMs:Math.round(performance.now()-setupStarted)});
  phase='socket ramp';const rampStart=performance.now();for(let i=0;i<100;i+=5){assert(!abortReason,abortReason);await Promise.all(users.slice(i,i+5).map(connect));console.log(`Subscribed ${i+5}/100 sockets, ${(i+5)*3}/300 private channels`);await sleep(250);}
  report.phases.push({name:'socket ramp',sockets:100,channels:300,elapsedMs:Math.round(performance.now()-rampStart)});phase='pre-workload fanout';await sleep(2200);await fanout('pre');
  phase='steady';const start=performance.now();let issued=0,reconnected=false,lastLog=0;
  monitor=setInterval(()=>{const s=stats(samples);if(samples.length>=20&&(s.errorRate>.02||s.p95Ms>5000))abortReason=`Safety threshold exceeded: ${s.errors}/${s.requests} errors, p95 ${s.p95Ms}ms`;},500);
  while(performance.now()-start<120000&&!abortReason){
    const elapsed=performance.now()-start;
    if(!reconnected&&elapsed>=60000){reconnected=true;phase='subset reconnect';const began=performance.now();for(const user of users.slice(0,10)){await disconnect(user);await connect(user);}report.phases.push({name:'subset reconnect',identities:10,elapsedMs:Math.round(performance.now()-began)});phase='steady';}
    const user=users[issued%100],cycle=Math.floor(issued/100),tool=cycle%4===3?'nook_presence':'nook_snapshot';
    const operation=api(user,tool,{nookId:roomId},true).then(body=>{if(tool==='nook_snapshot'&&body.memberCount!==100)abortReason='Snapshot membership integrity failed';}).catch(()=>{}).finally(()=>inFlight.delete(operation));inFlight.add(operation);issued++;
    if(issued===200||issued===500||issued===750){const write=api(users[0],'profile_update',{displayName:profileNames[issued],avatar:0},true).catch(()=>{}).finally(()=>inFlight.delete(write));inFlight.add(write);}
    if(elapsed-lastLog>=15000){console.log(`Steady ${Math.floor(elapsed/1000)}s: ${JSON.stringify(stats(samples))}`);lastLog=elapsed;}
    await sleep(125);
  }
  await Promise.allSettled([...inFlight]);clearInterval(monitor);report.steady={elapsedMs:Math.round(performance.now()-start),...stats(samples),byOperation:Object.fromEntries([...new Set(samples.map(s=>s.tool))].map(tool=>[tool,stats(samples.filter(s=>s.tool===tool))]))};
  assert(!abortReason,abortReason);assert(report.steady.errorRate<=.02&&report.steady.p95Ms<=5000,'Final threshold failed');
  phase='post-workload fanout';await sleep(2200);await fanout('post');
  const final=await api(users[0],'nook_snapshot',{nookId:roomId});assert(final.memberCount===100&&final.leaderboard.every(m=>m.focusMinutes===0),'Final membership/credit integrity failed');
  report.finalIntegrity={memberCount:100,zeroFocusCredit:true};report.passed=true;
} catch(error) { report.passed=false;report.failure={phase,message:/Bearer |eyJ|sb_secret_|password|token/i.test(error?.message??'')?'Redacted failure':String(error?.message??'Error').slice(0,250),...safeError(error)};console.log(`Stopped in ${phase}; cleaning owned fixtures`);process.exitCode=1; }
finally {try{await cleanup();}catch(error){report.cleanup.push({type:'cleanup exception',ok:false,...safeError(error)});}
  if(report.cleanup.some(x=>!x.ok)||report.cleanupVerification?.accountsRemaining||report.cleanupVerification?.roomsRemaining||report.cleanupVerification?.queryOk===false){report.passed=false;process.exitCode=1;}
  report.finishedAt=new Date().toISOString();await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`Report: ${reportPath.pathname}`);console.log(`Passed: ${report.passed}; cleanup failures: ${report.cleanup.filter(x=>!x.ok).length}`);
}
