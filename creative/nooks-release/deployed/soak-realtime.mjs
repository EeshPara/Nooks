/** Socket-only fixture client: keep SDK connect/join/heartbeat refresh on the same in-memory JWT. */
export function createFixtureRealtimeClient(createClient,url,publicKey,user,options){
 return createClient(url,publicKey,{...options,accessToken:async()=>user.token});
}
/** Fixed categories only. Never persist a provider message, topic, token, URL or arbitrary cause. */
export function channelDiagnostic({status,error,kind,userIndex,phase,elapsedMs,tokenMatches,publicKeyMatches,expectedDenial=false}){
 const safeStatus=['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED','LOCAL_TIMEOUT'].includes(status)?status:'UNKNOWN';
 const message=[error?.message,error?.cause?.message,error?.cause?.reason].filter(value=>typeof value==='string').map(value=>value.slice(0,1024)).join(' ');
 let category='unknown';
 if(safeStatus==='SUBSCRIBED')category='none';
 else if(/\b(?:invalid|expired)\s+(?:jwt|(?:access\s+)?token)\b|\b(?:jwt|(?:access\s+)?token)\s+(?:(?:is|has)\s+)?(?:invalid|expired)\b/i.test(message))category='authentication';
 else if(/unauthoriz|permission|row.level.security/i.test(message))category='authorization';
 else if(/rate.limit|too.many|quota|maximum.*channel|maximum.*connection/i.test(message))category='capacity';
 else if(safeStatus==='TIMED_OUT'||safeStatus==='LOCAL_TIMEOUT'||/timeout|timed.out/i.test(message))category='timeout';
 else if(safeStatus==='CLOSED')category='closed';
 else if(/network|socket|connection|transport/i.test(message))category='transport';
 return {status:safeStatus,category,kind:['own_directory','own_account','own_room','foreign_room'].includes(kind)?kind:'unknown',userIndex:Number.isSafeInteger(userIndex)&&userIndex>=0&&userIndex<100?userIndex:null,phase:['isolation_and_socket_ramp','plateau','cleanup','diagnostic_join','diagnostic_heartbeat','diagnostic_reconnect','diagnostic_hint'].includes(phase)?phase:'other',elapsedMs:Math.max(0,Math.min(2700000,Math.round(elapsedMs))),fixtureTokenCurrent:tokenMatches===true,publishableKeyCurrent:publicKeyMatches===true,expectedDenial:expectedDenial===true};
}
export function recordChannelDiagnostic(report,event){
 const diagnostics=report.channelDiagnostics??={events:[],failures:[],suppressedEvents:0,suppressedFailures:0};
 if(diagnostics.events.length===40){diagnostics.events.shift();diagnostics.suppressedEvents++;}diagnostics.events.push(event);
 if(event.status!=='SUBSCRIBED'&&!event.expectedDenial){if(diagnostics.failures.length<40)diagnostics.failures.push(event);else diagnostics.suppressedFailures++;}
}

export function isAuthorizationDenial(status,error){return status==='CHANNEL_ERROR'&&channelDiagnostic({status,error,elapsedMs:0}).category==='authorization';}
