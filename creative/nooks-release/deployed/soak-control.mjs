/** Pure/local controls shared by the prepared soak and its no-network tests. */
export const SOAK = Object.freeze({users:100,rooms:5,membersPerRoom:20,sockets:100,channels:300,durationMs:900000,publicCap:4200,adminCap:350,cleanupCap:800,minStartGapMs:250,maxActive:8,heartbeatMs:40000,maxHeartbeatGapMs:70000,cleanupDeadlineMs:900000});
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assert(condition,code){if(!condition)throw new Error(code);}
/** Stop admission promptly on first failure, but await every started connection before cleanup. */
export async function runSettledBatch(items,run,onFailure){
 const outcomes=await Promise.allSettled(items.map(async item=>{try{return await run(item);}catch(error){onFailure(error);throw error;}}));
 const failed=outcomes.find(row=>row.status==='rejected');if(failed)throw failed.reason;
}
export function statistics(rows){
 const values=rows.map(row=>row.durationMs).sort((a,b)=>a-b),pick=p=>values[Math.max(0,Math.ceil(values.length*p)-1)]??null;
 return {requests:rows.length,unexpectedErrors:rows.filter(row=>!row.ok).length,expectedDenials:rows.filter(row=>row.expectedDenial&&row.ok).length,p50Ms:pick(.5),p95Ms:pick(.95),p99Ms:pick(.99),maxMs:values.at(-1)??null};
}
/** Task must consume the response body before resolving. Slots include queued start pacing. */
export function createHttpGate({minGapMs=SOAK.minStartGapMs,maxActive=SOAK.maxActive,caps={public:SOAK.publicCap,admin:SOAK.adminCap,cleanup:SOAK.cleanupCap},now=()=>performance.now(),wait=sleep,check=()=>{}}={}){
 let active=0,peak=0,lastStart=-Infinity,queue=Promise.resolve();const counts={public:0,admin:0,cleanup:0},starts=[];
 return {
  async run(bucket,task,{notBefore=-Infinity}={}){
   let release;const previous=queue;queue=new Promise(resolve=>{release=resolve});
   await previous;
   try{
    check(bucket);
    assert(Object.hasOwn(caps,bucket)&&counts[bucket]<caps[bucket],'http_cap_reached');
    while(active>=maxActive){await wait(10);check(bucket);}
    while(now()<Math.max(lastStart+minGapMs,notBefore))await wait(Math.max(1,Math.max(lastStart+minGapMs,notBefore)-now()));
    check(bucket);assert(counts[bucket]<caps[bucket],'http_cap_reached');
    lastStart=now();counts[bucket]++;active++;peak=Math.max(peak,active);starts.push({at:lastStart,bucket});
   }catch(error){release();throw error;}
   release();
   try{return await task(lastStart);}finally{active--;}
  },
  get active(){return active},get peak(){return peak},get counts(){return {...counts}},get starts(){return starts.slice()},
 };
}
export async function readBounded(response,maxBytes=2*1024*1024){
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;assert(bytes<=maxBytes,'response_too_large');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
export function checkSnapshot(body,room,{online=false}={}){
 const expected=new Set(room.members.map(user=>user.account));
 assert(body?.nook?.id===room.id&&body.memberCount===20&&Array.isArray(body.members)&&body.members.length===20,'room_membership_mismatch');
 assert(new Set(body.members.map(member=>member.id)).size===20&&body.members.every(member=>expected.has(member.id)),'cross_room_member_leak');
 assert(Array.isArray(body.leaderboard)&&body.leaderboard.every(member=>expected.has(member.id)&&member.focusMinutes===0)&&body.members.every(member=>member.focusMinutes===0),'unexpected_focus_credit_or_member');
 if(online)assert(body.onlineCount===20&&body.members.every(member=>member.online===true),'presence_integrity_failed');
}
