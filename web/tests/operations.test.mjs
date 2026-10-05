import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { createOperationalMonitor, failureStatus } from '../server/operations.mjs';
import { InputError } from '../server/errors.mjs';
import { createBrowserApiHandler } from '../server/browser-api.mjs';
import { createNotableServer } from '../server/index.mjs';
import { createWorkspace } from '../server/seed.mjs';

const account = '00000000-0000-4000-8000-000000000001';
const secret = 'DO_NOT_LOG_STUDY_CONTENT_OR_CREDENTIAL';
const env = { SUPABASE_URL: 'https://nooks-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_KEY: `sb_secret_${secret}`, NOOKS_PUBLIC_URL: 'https://nooks.example' };

test('failure statuses preserve operational configuration faults and distinguish client errors', () => {
  for (const code of ['BACKEND_NOT_CONFIGURED','BACKEND_UNAVAILABLE','INVALID_WORKSPACE','INVALID_STATE','STORAGE_INVALID']) assert.equal(failureStatus(new InputError(secret, code)), 503);
  for (const [code, status] of [['FORBIDDEN',403],['AUTH_REQUIRED',401],['REVISION_CONFLICT',409],['NOT_FOUND',404],['TOO_LARGE',413],['CONTENT_TYPE',415],['RATE_LIMITED',429],['ARTWORK_LIMIT',429],['ARTWORK_CONFLICT',409],['INVALID_INPUT',400]]) assert.equal(failureStatus(new InputError(secret, code)), status);
  assert.equal(failureStatus(new Error(secret)), 503); assert.equal(failureStatus(new Error(secret), 500), 500);
  const logs = [], monitor = createOperationalMonitor({ logger: event => logs.push(event) });
  for (const code of ['BACKEND_NOT_CONFIGURED','INVALID_WORKSPACE','CONTENT_TYPE']) monitor.failure(monitor.start(), new InputError(secret, code), { code, status: failureStatus(new InputError(secret, code)) });
  assert.deepEqual(logs.map(event => event.code), ['BACKEND_NOT_CONFIGURED','INVALID_WORKSPACE','CONTENT_TYPE']);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});
async function invoke(handler, path, { body, token = secret } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.url = path; request.method = body === undefined ? 'GET' : 'POST';
  request.headers = { authorization: `Bearer ${token}`, 'x-request-id': secret, origin: 'https://nooks.example', 'content-type': 'application/json' };
  let status, headers, value;
  await handler(request, { writeHead(nextStatus, nextHeaders) { status = nextStatus; headers = nextHeaders; }, end(raw) { value = JSON.parse(raw); } });
  return { status, headers, value };
}

test('browser failures correlate safely and health exposes only expiring observations without probing', async () => {
  const logs = []; let now = new Date('2026-10-04T00:00:00Z'), mode = 'success', calls = 0;
  const handler = createBrowserApiHandler({ env, clock: () => now, logger: event => logs.push(event), fetchImpl: async (url, options) => {
    calls++;
    if (url.endsWith('/auth/v1/user')) {
      if (mode === 'throw') throw new Error(secret);
      if (mode === 'denied') return Response.json({}, { status: 401 });
      return Response.json({ id: account });
    }
    if (url.endsWith('nooks_resolve_identity')) return Response.json({ id: account });
    if (url.endsWith('nooks_request_limit')) return Response.json({ allowed: mode !== 'quota', retryAfter: 17 });
    if (url.endsWith('nooks_workspace_read')) return mode === 'database' ? Response.json({ message: secret }, { status: 503 }) : Response.json(null);
    assert.fail('Unexpected upstream operation');
  } });
  let health = (await invoke(handler, '/api/health')).value;
  assert.equal(calls, 0); assert.equal(health.liveness, 'alive'); assert.equal(health.backend.configured, true); assert.equal(health.backend.observation, 'unknown');
  assert.equal((await invoke(handler, '/api/workspace')).status, 200);
  health = (await invoke(handler, '/api/health')).value;
  assert.equal(health.backend.observation, 'recent_success'); assert.equal(health.backend.scope, 'this-instance');
  mode = 'database';
  const failure = await invoke(handler, '/api/tools/artifact_save', { body: { artifact: { kind: 'note', title: secret, content: secret } } });
  assert.equal(failure.status, 503);
  assert.equal(failure.value.error.requestId, logs.at(-1).requestId); assert.equal(failure.headers['X-Request-Id'], logs.at(-1).requestId);
  assert.match(failure.value.error.requestId, /^[a-f0-9-]{36}$/); assert.notEqual(failure.value.error.requestId, secret);
  assert.equal(logs.at(-1).operation, 'artifact_save'); assert.equal(logs.at(-1).category, 'database');
  assert.deepEqual(logs.at(-1).upstream, { dependency: 'database', action: 'nooks_workspace_read', status: 503, failure: 'http' });
  const beforeHealth = calls;
  health = (await invoke(handler, '/api/health')).value;
  assert.equal(health.backend.observation, 'recent_failure'); assert.equal(calls, beforeHealth);
  now = new Date(now.valueOf() + 60000);
  assert.equal((await invoke(handler, '/api/health')).value.backend.observation, 'unknown'); assert.equal(calls, beforeHealth);
  mode = 'quota';
  assert.equal((await invoke(handler, '/api/workspace')).status, 429); assert.equal(logs.at(-1).category, 'quota');
  assert.equal((await invoke(handler, '/api/health')).value.backend.observation, 'recent_success', 'a working quota denial is not a backend outage');
  const unknown = await invoke(handler, `/api/tools/${secret}`, { body: {} });
  assert.equal(unknown.status, 404); assert.equal(logs.at(-1).operation, 'unknown');
  mode = 'throw';
  assert.equal((await invoke(handler, '/api/workspace')).status, 503);
  assert.equal(logs.at(-1).upstream.action, 'verify_user');
  mode = 'success';
  assert.equal((await invoke(handler, '/api/generate', { body: { requestId: '00000000-0000-4000-8000-000000000003', kind: 'note', instruction: secret } })).status, 503);
  assert.equal(logs.at(-1).category, 'generation');
  assert.equal((await invoke(handler, '/api/health')).value.backend.observation, 'recent_success', 'missing optional generation configuration is not a database outage');
  const serialized = JSON.stringify(logs);
  for (const privateValue of [secret, account, env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY]) assert.equal(serialized.includes(privateValue), false);
  assert.equal(JSON.stringify(failure.value).includes(secret), false);
  const unconfigured = createBrowserApiHandler({ env: {}, allowedOrigins: ['https://nooks.example'], logger: () => {}, fetchImpl: () => assert.fail('health must not probe') });
  health = (await invoke(unconfigured, '/api/health')).value;
  assert.equal(health.backend.configured, false); assert.equal(health.backend.observation, 'unknown');
});

test('diagnostic volume is bounded, timeout classification is safe, and failed log sinks do not throw', async () => {
  const logs = []; let now = new Date(0);
  const monitor = createOperationalMonitor({ configured: true, operations: ['workspace_get'], logger: event => logs.push(event), clock: () => now, logLimit: 2 });
  for (let index = 0; index < 5; index++) {
    const context = monitor.start(secret); context.phase = 'authentication';
    const observedFetch = monitor.wrapFetch(context, async () => { throw new DOMException(secret, 'TimeoutError'); }, env.SUPABASE_URL);
    await assert.rejects(observedFetch(`${env.SUPABASE_URL}/auth/v1/user`));
    monitor.failure(context, new Error(secret));
  }
  assert.equal(logs.length, 2); assert.equal(logs[0].category, 'timeout'); assert.equal(logs[0].operation, 'unknown');
  now = new Date(60000);
  monitor.failure(monitor.start('workspace_get'), new Error(secret));
  assert.equal(logs.length, 3); assert.equal(logs[2].suppressedSinceLastLog, 3); assert.equal(JSON.stringify(logs).includes(secret), false);
  const broken = createOperationalMonitor({ configured: false, logger: () => { throw new Error(secret); } });
  assert.doesNotThrow(() => broken.failure(broken.start(), new Error(secret)));
});

test('MCP tool failures include correlated diagnostics despite HTTP 200 and health never reads the store', async t => {
  const logs = []; let broken = false, reads = 0;
  const { server } = createNotableServer({ demo: true, logger: event => logs.push(event), store: { async read() { reads++; if (broken) throw new Error(secret); return createWorkspace('2026-10-04T00:00:00Z'); } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = async () => (await fetch(`${origin}/health`)).json();
  const call = async name => {
    const response = await fetch(`${origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': secret }, body: JSON.stringify({ jsonrpc: '2.0', id: secret, method: 'tools/call', params: { name, arguments: {} } }) });
    return { response, body: await response.json() };
  };
  assert.equal((await health()).backend.observation, 'unknown'); assert.equal(reads, 0);
  await call('workspace_get'); assert.equal((await health()).backend.observation, 'recent_success');
  broken = true;
  const failed = await call('workspace_get');
  assert.equal(failed.response.status, 200); assert.equal(failed.body.result.isError, true);
  assert.equal(failed.body.result.structuredContent.error.requestId, logs.at(-1).requestId);
  assert.equal(failed.response.headers.get('x-request-id'), logs.at(-1).requestId);
  assert.equal(logs.at(-1).transportStatus, 200); assert.equal(logs.at(-1).status, 500); assert.equal(logs.at(-1).category, 'storage');
  const before = reads;
  assert.equal((await health()).backend.observation, 'recent_failure'); assert.equal(reads, before);
  await call(secret); assert.equal(logs.at(-1).operation, 'unknown');
  assert.equal(JSON.stringify(logs).includes(secret), false);
});

test('artwork degradation has a separate expiring signal, one event per request, and no private details', () => {
  const logs=[];let now=new Date(0);
  const monitor=createOperationalMonitor({configured:true,operations:['workspace_get'],clock:()=>now,logger:event=>logs.push(event),logLimit:2});
  const context=monitor.start('workspace_get');monitor.success();
  monitor.artworkUnavailable(context,{count:4,path:secret,error:new Error(secret),image:secret});
  monitor.artworkUnavailable(context,{count:20});
  assert.equal(logs.length,1);assert.equal(logs[0].event,'nooks.artwork_degraded');assert.equal(logs[0].affectedAppearances,4);assert.equal(logs[0].requestId,context.requestId);
  assert.equal(monitor.health().backend.observation,'recent_success');assert.equal(monitor.health().artwork.observation,'recent_degradation');
  assert.deepEqual(monitor.health().eventDelivery,{mode:'disabled',consumerConfigured:false,uiUpdates:'authenticated_polling'});
  const failed=monitor.start();monitor.failure(failed,new Error(secret));
  monitor.artworkUnavailable(monitor.start(),{count:100000});assert.equal(logs.length,2,'degradation shares the existing bounded log budget');
  now=new Date(60000);assert.equal(monitor.health().artwork.observation,'unknown');
  monitor.artworkUnavailable(monitor.start(),{count:100000});assert.equal(logs.at(-1).affectedAppearances,1000);assert.equal(logs.at(-1).suppressedSinceLastLog,1);
  assert.equal(JSON.stringify(logs).includes(secret),false);
  const broken=createOperationalMonitor({logger(){throw new Error(secret);}});assert.doesNotThrow(()=>broken.artworkUnavailable(broken.start(),{count:1}));
});

test('a private artwork outage logs degradation while returning saved study work successfully', async () => {
  const logs=[];const workspace=createWorkspace('2026-10-04T00:00:00Z');workspace.artifacts=[];workspace.space={};
  workspace.space._storedBackground={path:`${account}/${'a'.repeat(64)}`,mime:'image/png'};delete workspace.space.backgroundImage;
  const handler=createBrowserApiHandler({env,logger:event=>logs.push(event),fetchImpl:async url=>{
    if(url.endsWith('/auth/v1/user')||url.endsWith('nooks_resolve_identity'))return Response.json({id:account});
    if(url.endsWith('nooks_request_limit'))return Response.json({allowed:true});
    if(url.endsWith('nooks_workspace_read'))return Response.json({revision:1,workspace});
    if(url.includes('/storage/v1/object/authenticated/'))return Response.json({message:secret},{status:503});
    assert.fail('Unexpected operation');
  }});
  const result=await invoke(handler,'/api/workspace');assert.equal(result.status,200);assert.equal(result.value.workspace.artworkWarnings.length,1);
  assert.equal(logs.length,1);assert.equal(logs[0].event,'nooks.artwork_degraded');assert.equal(logs[0].operation,'workspace_get');assert.equal(logs[0].studyDataAvailable,true);
  assert.equal(JSON.stringify(logs).includes(secret),false);assert.equal(JSON.stringify(logs).includes(account),false);
  const health=(await invoke(handler,'/api/health')).value;assert.equal(health.artwork.observation,'recent_degradation');assert.equal(health.backend.observation,'recent_success');
});
