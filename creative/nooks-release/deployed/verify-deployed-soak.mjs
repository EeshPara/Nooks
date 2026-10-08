#!/usr/bin/env node
/** Prepared bounded public soak. Execution requires separate root authorization. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {open,rename,writeFile} from 'node:fs/promises';
import {SOAK as SOAK_DEFAULT,assert,sleep,statistics,createHttpGate,readBounded,checkSnapshot,runSettledBatch} from './soak-control.mjs';
import {createFixtureRealtimeClient,channelDiagnostic,recordChannelDiagnostic,isAuthorizationDenial} from './soak-realtime.mjs';
const require=createRequire(new URL('../../../web/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const PROJECT='lcfcjglybfeozyrjjikk',DB=`https://${PROJECT}.supabase.co`,PUBLIC='https://nooks-study-space.vercel.app';
const diagnostic=process.argv[2]==='--run-authorized-realtime-proof';
if(process.argv.length!==3||!['--run-authorized-soak','--run-authorized-realtime-proof'].includes(process.argv[2])){console.log('Prepared only: each run requires separate approval and its explicit --run-authorized-soak or --run-authorized-realtime-proof flag.');process.exit(0);}
const SOAK=diagnostic?Object.freeze({...SOAK_DEFAULT,users:2,rooms:1,membersPerRoom:1,sockets:2,channels:6,durationMs:35000,publicCap:40,adminCap:6,cleanupCap:30,maxActive:2,cleanupDeadlineMs:180000}):SOAK_DEFAULT;
const runId=randomUUID(),stamp=new Date().toISOString().replaceAll(':','-'),started=performance.now();
const prefix=diagnostic?'realtime-proof':'soak';
const reportPath=new URL(`./${prefix}-report-${stamp}.json`,import.meta.url),manifestPath=new URL(`./${prefix}-fixtures-${stamp}.json`,import.meta.url);
const users=[],rooms=[],samples=[],pending=new Set(),background=new Set();
const report={runId,startedAt:new Date().toISOString(),project:PROJECT,publicOrigin:PUBLIC,bounds:SOAK,passed:false,phases:[],intervals:[],fanout:[],negativeChecks:[],reconnects:[],cleanup:[],limitations:['Actual public HTTPS plus direct Supabase WebSockets; one generator, no browser/email onboarding.','Fifteen minutes at a lower rate is not overnight stability, multi-region performance, 1000-user capacity or production approval.','Lossy invalidation hints are not content delivery guarantees. Reconnect convergence is checked with authorized snapshots.','No hosted disconnect cancellation, token-refresh/expiry, upload, artwork or populated-library evidence.']};
if(diagnostic)report.limitations=['Two disposable identities/one private room only; no load or long-soak result.','Direct Supabase WebSockets with public HTTP verification; no browser/email onboarding.','Fixture JWT callback retained in memory; only token-equality booleans are reported.'];
let admin,publicKey,phase='preflight',abortReason=null,abortPhase=null,cleanupMode=false,cleanupDeadline=Infinity,plateauStart=null,plateauEnd=null,writeChain=Promise.resolve(),lastLogin=-Infinity;
let channelCount=0,socketCount=0,peakChannels=0,peakSockets=0,profileRound=0,quietMutations=false,quietUntil=Infinity;
const safeCode=error=>/^[a-z0-9_]{1,80}$/.test(error?.message??'')?error.message:'operation_failed';
function stop(code){if(!abortReason){abortReason=safeCode({message:code});abortPhase=phase;}}
function guard(bucket){if(bucket==='cleanup'){assert(performance.now()<cleanupDeadline,'cleanup_deadline');return;}assert(!abortReason,abortReason??'stopped');assert(performance.now()-started<(diagnostic?180000:30*60*1000),'work_wall_deadline');if(bucket==='public'&&phase==='plateau')assert(gate.counts.public<SOAK.publicCap-250,'final_check_reserve_reached');}
const gate=createHttpGate({check:guard,maxActive:SOAK.maxActive,caps:{public:SOAK.publicCap,admin:SOAK.adminCap,cleanup:SOAK.cleanupCap}});
function journal(){
 const value={runId,project:PROJECT,createdAt:report.startedAt,updatedAt:new Date().toISOString(),phase,users:users.map(u=>({id:u.id,email:u.email,creation:u.creation,account:u.account,roomIndex:u.roomIndex,cleaned:u.cleaned??false})),rooms:rooms.map(r=>({index:r.index,ownerAuthId:r.owner.id,ownerAccount:r.owner.account,requestId:r.requestId,id:r.id,cleaned:r.cleaned??false})),throttleTopics:[...users.filter(u=>u.account).map(u=>`account:${u.account}`),...rooms.filter(r=>r.id).map(r=>`nook:${r.id}`)],sharedDirectoryTopic:'nooks:directory (never delete)',containsCredentials:false};
 const text=JSON.stringify(value,null,2)+'\n';
 const write=async()=>{const temp=new URL(manifestPath.href+'.tmp');const handle=await open(temp,'w',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}await rename(temp,manifestPath);const directory=await open(new URL('.',manifestPath),'r');try{await directory.sync();}finally{await directory.close();}};
 writeChain=writeChain.catch(()=>{}).then(write);return writeChain;
}
async function saveReport(){await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
async function publicRequest(path,{user,tool=path,args,expected=200}={}){
 const requestPhase=phase,queuedAt=performance.now(),quietDeadline=quietMutations&&tool==='profile_update'?quietUntil:null;
 return gate.run('public',async began=>{
  let status=0,ok=false,bytes=0,requestId,signal,requestBudgetMs=null,quietBudgetRemainingMs=null,failureCode;
  try{
   quietBudgetRemainingMs=quietDeadline===null?null:Math.floor(quietDeadline-performance.now());
   requestBudgetMs=quietBudgetRemainingMs===null?15000:Math.min(15000,quietBudgetRemainingMs);
   assert(requestBudgetMs>0,'fanout_quiet_deadline');signal=AbortSignal.timeout(requestBudgetMs);
   const response=await fetch(PUBLIC+path,{redirect:'error',signal,method:args===undefined?'GET':'POST',headers:{Accept:'application/json',...(user?{Origin:PUBLIC,Authorization:`Bearer ${user.token}`} :{}),...(args===undefined?{}:{'Content-Type':'application/json'})},...(args===undefined?{}:{body:JSON.stringify(args)})});
   status=response.status;requestId=response.headers.get('x-request-id');const raw=await readBounded(response);bytes=raw.length;
   if(status!==expected){report.lastHttpFailure={tool,status,requestId:/^[a-f0-9-]{36}$/.test(requestId??'')?requestId:undefined};throw new Error('unexpected_http_status');}
   let body;if(path==='/')body=raw;else{try{body=JSON.parse(raw);}catch{throw new Error('malformed_public_response');}}
   if(expected===403)assert(body?.error?.code==='FORBIDDEN','wrong_denial_contract');
   ok=true;return body;
  }catch(error){
   failureCode=quietDeadline!==null&&signal?.aborted&&signal.reason?.name==='TimeoutError'?'fanout_quiet_deadline':safeCode(error);
   stop(failureCode);throw new Error(failureCode);
  }
  finally{samples.push({phase:requestPhase,tool,roomIndex:user?.roomIndex,userIndex:user?.index,queuedMs:Math.round(queuedAt-started),startedMs:Math.round(began-started),queueWaitMs:Math.max(0,Math.round(began-queuedAt)),requestBudgetMs,quietBudgetRemainingMs,durationMs:Math.round(performance.now()-began),status,ok,expectedDenial:expected===403,responseBytes:bytes,...(failureCode?{failureCode}:{})});}
 });
}
const api=(user,tool,args={},expected=200)=>publicRequest(tool==='workspace'?'/api/workspace':`/api/tools/${tool}`,{user,tool,...(tool==='workspace'?{}:{args}),expected});
async function releaseIdentity(){
 const html=await publicRequest('/'),manifest=await publicRequest('/nooks-release.json');
 const htmlSha256=createHash('sha256').update(html).digest('hex');
 assert(/^[a-f0-9]{20,64}$/.test(manifest?.current?.id??'')&&manifest.current.indexSha256===htmlSha256,'release_manifest_mismatch');
 return {id:manifest.current.id,htmlSha256,manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
}
/** All direct administrative/auth HTTP is also paced; body buffering keeps its slot until consumed. */
async function hostedFetch(input,init){
 const target=new URL(typeof input==='string'?input:input.url);assert(target.origin===DB,'unexpected_hosted_origin');
 const passwordGrant=target.pathname==='/auth/v1/token'&&target.searchParams.get('grant_type')==='password';
 const bucket=cleanupMode?'cleanup':'admin';
 return gate.run(bucket,async began=>{
  if(passwordGrant)lastLogin=began;
  const own=AbortSignal.timeout(cleanupMode?10000:20000),signal=init?.signal?AbortSignal.any([own,init.signal]):own;
  const response=await fetch(input,{...init,redirect:'error',signal});const raw=await readBounded(response);
  return new Response([204,205,304].includes(response.status)?null:raw,{status:response.status,headers:response.headers});
 },{notBefore:passwordGrant?lastLogin+2500:-Infinity});
}
const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{timeout:5000},global:{fetch:hostedFetch}};
function markChannels(delta){channelCount+=delta;peakChannels=Math.max(peakChannels,channelCount);assert(channelCount>=0&&channelCount<=SOAK.channels,'channel_bound');}
async function subscribe(user,topic,{deny=false}={}){
 guard('public');markChannels(1);
 const record={topic,channel:null,closing:false};user.channels.push(record);
 const channel=user.client.channel(topic,{config:{private:true}});record.channel=channel;
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const diagnose=(status,error)=>recordChannelDiagnostic(report,channelDiagnostic({status,error,kind:topic==='nooks:directory'?'own_directory':topic===`account:${user.account}`?'own_account':deny?'foreign_room':'own_room',userIndex:user.index,phase,elapsedMs:performance.now()-started,tokenMatches:user.client.realtime.accessTokenValue===user.token,publicKeyMatches:user.client.realtime.accessTokenValue===publicKey,expectedDenial:deny&&isAuthorizationDenial(status,error)}));
  const timer=setTimeout(()=>{diagnose('LOCAL_TIMEOUT');stop('subscription_timeout');finish(new Error('subscription_timeout'));},15000);
  channel.on('broadcast',{event:'invalidate'},event=>{
   const value=event.payload;if(!value||value.v!==1||Object.keys(value).some(k=>k!=='v'&&k!=='id')){stop('unexpected_broadcast_payload');return;}
   if(topic.startsWith('nook:')){
    if(deny||topic!==`nook:${rooms[user.roomIndex].id}`){stop('foreign_room_broadcast');return;}
    user.hints++;user.lastHint=performance.now();
   }
  }).subscribe((status,error)=>{
   if(!record.closing&&!cleanupMode)diagnose(status,error);
   if(status==='SUBSCRIBED'){if(deny){stop('foreign_subscription_allowed');finish(new Error('foreign_subscription_allowed'));}else finish(null,record);}
   else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&!record.closing&&!cleanupMode){
    if(deny&&isAuthorizationDenial(status,error)){finish(null,record);return;}
    if(!deny||!settled)stop(deny?'foreign_denial_not_proven':'unexpected_channel_failure');
    finish(new Error(deny?'foreign_denial_not_proven':'unexpected_channel_failure'));
   }
  });
 });
}
async function removeChannel(user,record){
 record.closing=true;const result=await user.client.removeChannel(record.channel);
 assert(result==='ok','channel_removal_failed');user.channels.splice(user.channels.indexOf(record),1);markChannels(-1);
}
async function connect(user,{foreign=false}={}){
 assert(!user.connected&&user.channels.length===0,'duplicate_connection');
 if(!user.client)user.client=createFixtureRealtimeClient(createClient,DB,publicKey,user,clientOptions);
 if(diagnostic&&!user.heartbeatObserver){user.heartbeatObserver=true;user.socketHeartbeats={sent:0,ok:0};user.client.realtime.onHeartbeat(status=>{if(status==='sent'||status==='ok')user.socketHeartbeats[status]++;else if(status==='error'||status==='timeout')stop('diagnostic_heartbeat_failed');});}
 socketCount++;peakSockets=Math.max(peakSockets,socketCount);assert(socketCount<=SOAK.sockets,'socket_bound');user.socketCounted=true;
 await user.client.realtime.setAuth(user.token);
 await subscribe(user,'nooks:directory');await subscribe(user,`account:${user.account}`);
 if(foreign){
  const other=rooms[(user.roomIndex+1)%SOAK.rooms];const forbidden=await subscribe(user,`nook:${other.id}`,{deny:true});
  await removeChannel(user,forbidden);report.negativeChecks.push({type:'foreign_subscription',userIndex:user.index,roomIndex:other.index,denied:true});
 }
 await subscribe(user,`nook:${rooms[user.roomIndex].id}`);user.connected=true;
}
async function disconnect(user){
 if(!user.client)return;user.connected=false;
 for(const record of user.channels)record.closing=true;
 let statuses;
 try{statuses=await user.client.removeAllChannels();}
 finally{
  await user.client.realtime.disconnect();
  assert(user.client.realtime.connectionState()==='closed','socket_disconnect_failed');
  markChannels(-user.channels.length);user.channels=[];
  if(user.socketCounted){socketCount--;user.socketCounted=false;}
 }
 assert(statuses?.every(status=>status==='ok'),'channel_removal_failed');
}
function launch(work,set=pending){const task=Promise.resolve().then(work).catch(error=>{stop(safeCode(error));}).finally(()=>set.delete(task));set.add(task);return task;}
async function heartbeat(user){
 user.heartbeatPending=true;
 try{const body=await api(user,'nook_presence',{nookId:rooms[user.roomIndex].id});assert(body?.nookId===rooms[user.roomIndex].id,'heartbeat_room_mismatch');user.lastHeartbeat=performance.now();}
 finally{user.heartbeatPending=false;}
}
async function snapshot(user,online=true){const body=await api(user,'nook_snapshot',{nookId:rooms[user.roomIndex].id,limit:50});checkSnapshot(body,rooms[user.roomIndex],{online});return body;}
async function fanout(label){
 quietMutations=true;const quietStart=performance.now();quietUntil=quietStart+15000;
 try{
  // Set pause before draining so no new heartbeat can race into the measured mutation window.
  await Promise.allSettled([...pending]);guard('public');
  assert(users.every(user=>performance.now()-user.lastHeartbeat<=55000),'fanout_heartbeat_margin');
  const quietGuard=()=>{guard('public');assert(performance.now()<quietUntil,'fanout_quiet_deadline');};
  // Room invalidations throttle for two seconds. Wait beyond it after drain, plus one second of hint silence, within the same three-second settling bound.
  let lastChange=performance.now(),previous=users.map(user=>user.hints).join(','),settlingStart=performance.now();
  while(performance.now()-settlingStart<2100||performance.now()-lastChange<1000){
   quietGuard();assert(performance.now()-settlingStart<3000,'room_hints_unsettled_inconclusive');await sleep(50);
   const current=users.map(user=>user.hints).join(',');if(current!==previous){previous=current;lastChange=performance.now();}
  }
  assert(users.every(user=>performance.now()-user.lastHeartbeat<=55000),'fanout_heartbeat_margin');
  for(const room of rooms){
   quietGuard();assert(users.every(u=>u.connected),'fanout_requires_all_connected');
   const before=users.map(u=>u.hints),began=performance.now();
   await api(room.owner,'profile_update',{displayName:`Soak ${room.index} ${++profileRound}`,avatar:room.index});
   while(room.members.some(u=>u.hints<=before[u.index])){quietGuard();await sleep(50);}
   const own=room.members.map(u=>({ok:u.hints>before[u.index],durationMs:Math.max(0,Math.round(u.lastHint-began))}));
   await sleep(500);quietGuard();
   const foreignHints=users.filter(u=>u.roomIndex!==room.index).reduce((sum,u)=>sum+u.hints-before[u.index],0);
   if(foreignHints){report.fanout.push({label,roomIndex:room.index,inconclusive:true,otherRoomHints:foreignHints});throw new Error('room_hint_attribution_inconclusive');}
   report.fanout.push({label,roomIndex:room.index,expected:20,received:own.filter(row=>row.ok).length,foreignRoomHints:0,...statistics(own)});
  }
 }finally{
  quietMutations=false;quietUntil=Infinity;(report.mutationQuietWindows??=[]).push({label,durationMs:Math.round(performance.now()-quietStart),includesDrain:true,apiReadsContinue:phase==='plateau'});
 }
}
async function reconnect(round){
 const begin=performance.now(),rows=[];
 // Sequential reconnect is stricter than the two-at-a-time upper bound and does not block the API scheduler.
 for(const room of rooms){
  guard('public');const user=room.members[round],at=performance.now();await disconnect(user);await connect(user);await snapshot(user);
  rows.push({userIndex:user.index,roomIndex:room.index,durationMs:Math.round(performance.now()-at)});
 }
 report.reconnects.push({round,startedMs:Math.round(begin-plateauStart),durationMs:Math.round(performance.now()-begin),identities:5,rows});
}
function intervalReport(index){
 const lo=plateauStart-started+index*60000,hi=Math.min(lo+60000,(plateauEnd??performance.now())-started),rows=samples.filter(s=>s.phase==='plateau'&&s.startedMs>=lo&&s.startedMs<hi);
 return {index,wallMs:Math.max(0,Math.round(hi-lo)),actualStartsPerSecond:hi>lo?rows.length/((hi-lo)/1000):0,...statistics(rows),byOperation:Object.fromEntries([...new Set(rows.map(s=>s.tool))].map(tool=>[tool,statistics(rows.filter(s=>s.tool===tool))]))};
}
async function plateau(){
 phase='plateau';plateauStart=performance.now();let nextTick=plateauStart,nextMinute=60000,nextFanout=180000,reconnectRound=1,snapshotCursor=0,fanoutBusy=false,reconnectBusy=false;
 while(performance.now()-plateauStart<SOAK.durationMs&&!abortReason){
  const now=performance.now(),elapsed=now-plateauStart;guard('public');
  if(users.some(u=>now-u.lastHeartbeat>SOAK.maxHeartbeatGapMs)){stop('heartbeat_deadline');break;}
  const recent=samples.filter(s=>s.phase==='plateau'&&s.startedMs>now-started-60000),stats=statistics(recent);
  if(recent.length>=20&&stats.p95Ms>5000){stop('latency_safety_threshold');break;}
  if(elapsed>=nextMinute){const value=intervalReport(Math.floor(nextMinute/60000)-1);report.intervals.push(value);console.log(`Soak minute ${nextMinute/60000}: ${JSON.stringify(value)}`);nextMinute+=60000;await saveReport();}
  if(!reconnectBusy&&!fanoutBusy&&reconnectRound<=2&&elapsed>=reconnectRound*300000){const round=reconnectRound++;reconnectBusy=true;launch(()=>reconnect(round).finally(()=>{reconnectBusy=false}),background);}
  if(!fanoutBusy&&!reconnectBusy&&elapsed>=nextFanout){const label=`minute-${Math.floor(nextFanout/60000)}`;nextFanout+=180000;fanoutBusy=true;launch(()=>fanout(label).finally(()=>{fanoutBusy=false}),background);}
  // Keep reads flowing without filling the FIFO ahead of controlled profile writes.
  if(pending.size<(quietMutations?1:SOAK.maxActive)){
   const due=users.filter(u=>!quietMutations&&!u.heartbeatPending&&now-u.lastHeartbeat>=SOAK.heartbeatMs).sort((a,b)=>a.lastHeartbeat-b.lastHeartbeat)[0];
   if(due){due.heartbeatPending=true;launch(()=>heartbeat(due));}
   else{const user=users[snapshotCursor++%users.length];launch(()=>snapshot(user));}
  }else report.schedulerCapacitySkips=(report.schedulerCapacitySkips??0)+1;
  // No catch-up burst after delayed scheduling. All API paths still pass the shared hard gate.
  nextTick=Math.max(nextTick+250,performance.now()+1);await sleep(Math.max(1,nextTick-performance.now()));
 }
 plateauEnd=Math.min(performance.now(),plateauStart+SOAK.durationMs);const drainStart=performance.now();await Promise.allSettled([...pending,...background]);const drainMs=Math.round(performance.now()-drainStart);
 report.intervals=Array.from({length:Math.ceil((plateauEnd-plateauStart)/60000)},(_,i)=>intervalReport(i));
 const windowEnd=plateauEnd-started,rows=samples.filter(s=>s.phase==='plateau'&&s.startedMs<windowEnd);const late=samples.filter(s=>s.phase==='plateau'&&s.startedMs>=windowEnd);const starts=rows.map(s=>s.startedMs).sort((a,b)=>a-b);
 report.plateau={schedulerStopDelayMs:Math.round(drainStart-plateauEnd),drainMs,postWindowStarts:late.length,postWindow:statistics(late),wallMs:Math.round(plateauEnd-plateauStart),scheduledDurationMs:SOAK.durationMs,actualStartsPerSecond:rows.length/((plateauEnd-plateauStart)/1000),maxPublicStartGapMs:starts.slice(1).reduce((max,at,i)=>Math.max(max,at-starts[i]),0),intentionalApiPauses:0,reconnectRuns:report.reconnects.length,...statistics(rows)};
 assert(!abortReason,abortReason??'stopped');assert(report.reconnects.length===2,'reconnect_exercise_incomplete');
}
async function realtimeProof(){
 const [owner,outsider]=users;phase='diagnostic_join';
 const room={index:0,owner,members:[owner],requestId:randomUUID()};rooms.push(room);await journal();
 const created=await api(owner,'nook_create',{requestId:room.requestId,title:`Private proof ${runId.slice(0,8)}`,roomId:'rainy-library',visibility:'private'});
 assert(/^[a-f0-9-]{36}$/.test(created.nook?.id??''),'room_create_failed');room.id=created.nook.id;await journal();
 await api(outsider,'nook_snapshot',{nookId:room.id},403);report.negativeChecks.push({type:'foreign_snapshot',userIndex:1,status:403,denied:true});
 await connect(owner); // Sequential directory -> account -> own room with the corrected callback.
 outsider.client=createFixtureRealtimeClient(createClient,DB,publicKey,outsider,clientOptions);
 outsider.socketHeartbeats={sent:0,ok:0};outsider.client.realtime.onHeartbeat(status=>{if(status==='sent'||status==='ok')outsider.socketHeartbeats[status]++;else if(status==='error'||status==='timeout')stop('diagnostic_heartbeat_failed');});
 outsider.socketCounted=true;socketCount++;peakSockets=Math.max(peakSockets,socketCount);assert(socketCount<=SOAK.sockets,'socket_bound');
 await outsider.client.realtime.setAuth(outsider.token);await subscribe(outsider,'nooks:directory');await subscribe(outsider,`account:${outsider.account}`);
 const denied=await subscribe(outsider,`nook:${room.id}`,{deny:true});await removeChannel(outsider,denied);outsider.connected=true;
 report.negativeChecks.push({type:'foreign_subscription',userIndex:1,denied:true});
 phase='diagnostic_heartbeat';const began=performance.now();
 while(performance.now()-began<SOAK.durationMs){guard('public');await sleep(250);}
 report.heartbeatProof={observedMs:Math.round(performance.now()-began),users:users.map(user=>({userIndex:user.index,...user.socketHeartbeats,fixtureTokenCurrent:user.client.realtime.accessTokenValue===user.token,publishableKeyCurrent:user.client.realtime.accessTokenValue===publicKey}))};
 assert(report.heartbeatProof.users.every(user=>user.sent>=1&&user.ok>=1&&user.fixtureTokenCurrent&&!user.publishableKeyCurrent),'heartbeat_token_not_retained');
 phase='diagnostic_reconnect';await disconnect(owner);await connect(owner);
 const snapshot=await api(owner,'nook_snapshot',{nookId:room.id,limit:50});
 assert(snapshot.nook?.id===room.id&&snapshot.memberCount===1&&snapshot.members?.length===1&&snapshot.members[0].id===owner.account&&snapshot.members[0].focusMinutes===0,'diagnostic_room_integrity');
 phase='diagnostic_hint';const baseline=owner.hints,hintStart=performance.now();await api(owner,'profile_update',{displayName:'Proof student',avatar:0});
 while(owner.hints<=baseline&&performance.now()-hintStart<10000){guard('public');await sleep(50);}
 assert(owner.hints>baseline,'diagnostic_hint_missing');report.profileHint={ownRoomReceived:true,durationMs:Math.round(owner.lastHint-hintStart)};
 report.releaseEnd=await releaseIdentity();assert(JSON.stringify(report.releaseStart)===JSON.stringify(report.releaseEnd),'release_changed_inconclusive');
 report.finalIntegrity={privateRoomMembers:1,foreignReadDenied:true,foreignSubscriptionDenied:true,reconnectSucceeded:true,fixtureTokensRetained:users.every(user=>user.client.realtime.accessTokenValue===user.token)};
 assert(report.finalIntegrity.fixtureTokensRetained,'diagnostic_token_changed');assert(!abortReason,abortReason??'stopped');report.passed=true;
}
async function cleanup(){
 cleanupMode=true;phase='cleanup';cleanupDeadline=performance.now()+SOAK.cleanupDeadlineMs;
 await Promise.allSettled([...pending,...background]);
 for(let i=0;i<users.length;i+=5)await Promise.all(users.slice(i,i+5).map(async user=>{try{await disconnect(user);}catch{report.cleanup.push({type:'socket',userIndex:user.index,ok:false});}}));
 if(!admin)return;
 // Resolve an ambiguous create using its exact pre-journaled owner/request ID, never a list of unrelated rooms.
 for(const room of rooms){
  try{
   const found=await admin.from('nooks_rooms').select('id,owner_id,request_id,visibility').eq('owner_id',room.owner.account).eq('request_id',room.requestId).limit(2).retry(false);
   assert(!found.error&&found.data?.length<=1,'cleanup_room_lookup');
   if(found.data.length){const row=found.data[0];assert(row.owner_id===room.owner.account&&row.request_id===room.requestId&&row.visibility==='private'&&(!room.id||room.id===row.id),'cleanup_room_guard');room.id=row.id;await journal().catch(()=>{report.journalFailed=true;});
    const deleted=await admin.from('nooks_rooms').delete().eq('id',row.id).eq('owner_id',room.owner.account).eq('request_id',room.requestId).retry(false);assert(!deleted.error,'cleanup_room_delete');}
   const check=await admin.from('nooks_rooms').select('id').eq('owner_id',room.owner.account).eq('request_id',room.requestId).retry(false);assert(!check.error&&check.data?.length===0,'cleanup_room_remaining');room.cleaned=true;report.cleanup.push({type:'room',roomIndex:room.index,ok:true});await journal();
  }catch(error){report.cleanup.push({type:'room',roomIndex:room.index,ok:false,code:safeCode(error)});}
 }
 let cursor=0;
 async function worker(){while(cursor<users.length){const user=users[cursor++];let absent=false,guarded=false,accountLookupOk=false,accountContradiction=false;
  const record=(type,ok,error)=>report.cleanup.push({type,userIndex:user.index,ok,...(error?{code:safeCode(error)}:{})});
  try{
   const auth=await admin.auth.admin.getUserById(user.id);absent=auth.error?.status===404&&!auth.data?.user;
   assert(absent||(!auth.error&&auth.data?.user?.id===user.id&&auth.data.user.email===user.email&&auth.data.user.app_metadata?.nooks_qa_run===runId),'cleanup_identity_guard');guarded=true;
  }catch(error){record('identity_guard',false,error);}
  if(!guarded)continue;
  if(user.token){try{const revoked=await admin.auth.admin.signOut(user.token,'global');assert(!revoked.error||revoked.error.status===404,'cleanup_session_revoke');record('session',true);}catch(error){record('session',false,error);}}
  try{
   const accounts=await admin.from('nooks_accounts').select('id').eq('auth_user_id',user.id).retry(false);assert(!accounts.error,'cleanup_account_lookup');
   if(!Array.isArray(accounts.data)||accounts.data.length>1||accounts.data.some(row=>user.account&&row.id!==user.account)){accountContradiction=true;throw new Error('cleanup_account_contradiction');}
   accountLookupOk=true;
   for(const row of accounts.data){
    assert(user.creation==='confirmed'||!absent,'cleanup_account_guard');assert(!user.account||user.account===row.id,'cleanup_account_identity');user.account=row.id;
    await journal().catch(()=>{report.journalFailed=true;});
    const result=await admin.from('nooks_accounts').delete().eq('id',row.id).eq('auth_user_id',user.id).retry(false);assert(!result.error,'cleanup_account_delete');
   }
   record('account_delete',true);
  }catch(error){record('account_delete',false,error);}
  // Auth deletion sets account.auth_user_id NULL. Keep the link if lookup failed and its account ID is unknown.
  if(!absent){try{assert(!accountContradiction,'cleanup_auth_withheld_contradiction');assert(accountLookupOk||user.account,'cleanup_auth_withheld_unknown_account');const deleted=await admin.auth.admin.deleteUser(user.id);assert(!deleted.error,'cleanup_auth_delete');record('auth_delete',true);}catch(error){record('auth_delete',false,error);}}
  let authGone=false,accountGone=false;
  try{const auth=await admin.auth.admin.getUserById(user.id);assert(auth.error?.status===404&&!auth.data?.user,'cleanup_auth_remaining');authGone=true;record('auth_absent',true);}catch(error){record('auth_absent',false,error);}
  try{
   const account=await admin.from('nooks_accounts').select('id').eq(user.account?'id':'auth_user_id',user.account??user.id).retry(false);
   assert(!account.error&&account.data?.length===0&&(accountLookupOk||user.account),'cleanup_account_remaining');accountGone=true;record('account_absent',true);
  }catch(error){record('account_absent',false,error);}
  user.cleaned=authGone&&accountGone;await journal().catch(()=>{report.journalFailed=true;});
 }}
 await Promise.all(Array.from({length:4},worker));
 report.cleanupVerification={plannedUsers:users.length,identitiesVerifiedAbsent:users.filter(u=>u.cleaned).length,plannedRooms:rooms.length,roomsVerifiedAbsent:rooms.filter(r=>r.cleaned).length,allAbsent:users.every(u=>u.cleaned)&&rooms.every(r=>r.cleaned)};
 report.fixtureThrottleTopics=[...users.filter(u=>u.account).map(u=>`account:${u.account}`),...rooms.filter(r=>r.id).map(r=>`nook:${r.id}`)];
 report.throttleCleanup='Root must delete only these exact topics after account/room absence guards, preserving nooks:directory. No private throttle SQL runs in this harness.';
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>stop('operator_interrupted'));
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
await journal(); // Exists and is synced before the first external creation.
try{
 report.releaseStart=await releaseIdentity();
 const config=await publicRequest('/api/config');assert(config.backend==='supabase'&&config.supabaseUrl===DB&&config.capabilities?.community===true&&config.capabilities?.accountSync===true,'project_configuration_mismatch');
 publicKey=config.publishableKey;assert(typeof publicKey==='string'&&publicKey.startsWith('sb_publishable_'),'invalid_public_key');
 const {stdout}=await promisify(execFile)('supabase',['projects','api-keys','--project-ref',PROJECT,'--output','json'],{maxBuffer:2*1024*1024});
 const parsed=JSON.parse(stdout),keys=Array.isArray(parsed)?parsed:parsed.api_keys??parsed.keys;
 const serviceKey=keys?.find(key=>key.name==='service_role')?.api_key;assert(serviceKey,'service_credential_unavailable');admin=createClient(DB,serviceKey,clientOptions);
 phase='fixture_setup';const setupStart=performance.now();
 for(let index=0;index<SOAK.users;index++){
  guard('public');const id=randomUUID(),email=`nooks-soak-${runId}-${index}@example.invalid`,password=randomBytes(30).toString('base64url');
  const user={index,id,email,roomIndex:diagnostic?0:Math.floor(index/SOAK.membersPerRoom),creation:'intended',channels:[],connected:false,hints:0,lastHint:0,lastHeartbeat:-Infinity,heartbeatPending:false};users.push(user);await journal();
  // auth-js AdminUserAttributes explicitly supports a caller-provided UUID, journaled before create.
  const created=await admin.auth.admin.createUser({id,email,password,email_confirm:true,app_metadata:{nooks_qa_run:runId}});
  assert(!created.error&&created.data?.user?.id===id,'fixture_create_failed');user.creation='confirmed';await journal();
  const auth=createClient(DB,publicKey,clientOptions),signed=await auth.auth.signInWithPassword({email,password});
  assert(!signed.error&&signed.data.session?.access_token,'fixture_login_failed');user.token=signed.data.session.access_token;
  const claims=JSON.parse(Buffer.from(user.token.split('.')[1],'base64url'));assert(claims.sub===id&&claims.role==='authenticated'&&claims.iss===DB+'/auth/v1'&&claims.exp*1000>Date.now()+30*60*1000,'fixture_token_margin');
  const workspace=await api(user,'workspace');assert(workspace.authenticated===true&&workspace.mode==='connected'&&workspace.workspace?.artifacts?.length===0,'fixture_workspace_invalid');
  const account=workspace.recoveryScope?.slice(8);assert(/^account:[a-f0-9-]{36}$/.test(workspace.recoveryScope??''),'fixture_account_invalid');user.account=account;await journal();
  if((index+1)%10===0||diagnostic)console.log(`Prepared ${index+1}/${SOAK.users} disposable identities`);
 }
 assert(new Set(users.map(u=>u.account)).size===SOAK.users,'duplicate_fixture_identity');
 if(diagnostic){
  await realtimeProof();
 }else{
 for(let index=0;index<SOAK.rooms;index++){
  const members=users.filter(u=>u.roomIndex===index),owner=members[0],room={index,owner,members,requestId:randomUUID()};rooms.push(room);await journal();
  const created=await api(owner,'nook_create',{requestId:room.requestId,title:`Private soak ${runId.slice(0,8)} ${index}`,roomId:'rainy-library',visibility:'private'});
  assert(/^[a-f0-9-]{36}$/.test(created.nook?.id??''),'room_create_failed');room.id=created.nook.id;await journal();
  const invitation=await api(owner,'nook_invite_create',{nookId:room.id,maxUses:19});assert(typeof invitation.invite?.token==='string','invite_missing');
  for(const user of members.slice(1))await api(user,'nook_invite_accept',{token:invitation.invite.token});
  await snapshot(owner,false);
 }
 report.phases.push({name:'fixture_setup',durationMs:Math.round(performance.now()-setupStart),users:100,rooms:5});
 phase='isolation_and_socket_ramp';const rampStart=performance.now();
 for(const room of rooms){const foreign=rooms[(room.index+1)%SOAK.rooms];await api(room.owner,'nook_snapshot',{nookId:foreign.id},403);report.negativeChecks.push({type:'foreign_snapshot',userIndex:room.owner.index,roomIndex:foreign.index,status:403,denied:true});}
 // Five foreign channel attempts precede the full ramp; each replaces, rather than adds to, the user's room channel.
 for(const room of rooms)await connect(room.owner,{foreign:true});
 const rest=users.filter(u=>!u.connected);for(let offset=0;offset<rest.length;offset+=5){await runSettledBatch(rest.slice(offset,offset+5),user=>connect(user),error=>stop(safeCode(error)));await sleep(250);}
 report.phases.push({name:'socket_ramp_and_isolation',durationMs:Math.round(performance.now()-rampStart),sockets:socketCount,channels:channelCount});
 phase='warmup';const warmup=performance.now();for(const user of users)await heartbeat(user);for(const room of rooms)await snapshot(room.owner);await sleep(2200);await fanout('before');
 report.phases.push({name:'presence_warmup_and_pre_fanout',durationMs:Math.round(performance.now()-warmup)});
 assert(gate.counts.public<=350,'insufficient_final_check_reserve');await plateau();
 phase='final_checks';const finalStart=performance.now();for(const user of users)await heartbeat(user);for(const room of rooms)await snapshot(room.owner);await sleep(2200);await fanout('after');
 for(const user of users){const body=await api(user,'workspace');assert(body.workspace?.stats?.focusMinutes===0&&body.workspace?.focusSessions?.length===0,'unexpected_personal_focus_credit');}
 report.releaseEnd=await releaseIdentity();assert(JSON.stringify(report.releaseStart)===JSON.stringify(report.releaseEnd),'release_changed_inconclusive');
 report.finalIntegrity={rooms:5,membersPerRoom:20,allRoomMembersOwnedAndCorrect:true,allPresenceOnline:true,zeroPersonalAndRoomFocusCredit:true,releaseUnchanged:true};
 report.phases.push({name:'final_checks',durationMs:Math.round(performance.now()-finalStart)});assert(!abortReason,abortReason??'stopped');report.passed=true;
 }
}catch(error){stop(safeCode(error));report.failure={phase,code:safeCode(error)};report.passed=false;process.exitCode=1;console.log(`Soak stopped in ${phase}; cleaning fixture-only resources.`);}
finally{
 try{await cleanup();}catch(error){report.cleanup.push({type:'cleanup_exception',ok:false,code:safeCode(error)});}
 if(report.journalFailed||report.cleanup.some(row=>!row.ok)||(users.length>0&&report.cleanupVerification?.allAbsent!==true)){report.passed=false;process.exitCode=1;}
 report.finalCheckReserve=diagnostic?0:250;report.http={counts:gate.counts,peakActive:gate.peak,...statistics(samples),minimumStartGapMs:gate.starts.slice(1).reduce((min,row,i)=>Math.min(min,row.at-gate.starts[i].at),Infinity)};
 report.realtime={peakSockets,peakChannels,finalSockets:socketCount,finalChannels:channelCount};report.samples=samples;report.finishedAt=new Date().toISOString();
 await journal().catch(()=>{report.passed=false;report.journalFailed=true;process.exitCode=1;});
 // A late socket callback or operator stop must override any tentative success, even after final HTTP admission.
 if(abortReason){report.passed=false;report.failure={phase:abortPhase??phase,code:abortReason};process.exitCode=1;}
 await saveReport();
 console.log(`Soak passed: ${report.passed}; report: ${reportPath.pathname}`);
}
