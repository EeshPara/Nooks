import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../ui/src/account/client.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });
const { createAccountController } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const config = { backend: 'supabase', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', capabilities: { generation: false } };
const session = (id = 'alice') => ({ access_token: `token-for-${id}`, refresh_token: 'not-used-here', user: { id, email: `${id}@example.com` } });
function fixture({ initialSession = null, configResponse, marker, apiResponse } = {}) {
 const saved = new Map(marker ? [['nooks:account-workspace:v1', JSON.stringify(marker)]] : []);
 const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
 let currentSession = initialSession;
 let authCallback;
 let sessionError = null;
 let signOutError = null;
 const requests = [];
 const otpRequests = [];
 const client = createAccountController({
  storage,
  origin: 'https://nooks.example',
  fetch: async (path, init) => {
   requests.push({ path, init });
   if (path === '/api/config') return configResponse ? configResponse() : Response.json(config);
   return apiResponse ? apiResponse(path, init) : Response.json({ workspace: { backend: 'supabase' } });
  },
  createClient: () => ({ auth: {
   onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
   getSession: async () => ({ data: { session: currentSession }, error: sessionError }),
   signInWithOtp: async payload => { otpRequests.push(payload); return { error: null }; },
   verifyOtp: async () => { currentSession = session(); authCallback('SIGNED_IN', currentSession); return { data: { session: currentSession }, error: null }; },
   signOut: async () => { if (signOutError) return { error: signOutError }; currentSession = null; authCallback('SIGNED_OUT', null); return { error: null }; },
  } }),
 });
 return { client, requests, otpRequests, saved, failSession: () => { sessionError = new Error('Refresh failed'); }, failSignOut: () => { signOutError = new Error('Offline'); }, emit: (event, value) => { currentSession = value; authCallback(event, value); } };
}

test('unconfigured public preview stays explicitly on this device', async () => {
 const { client } = fixture({ configResponse: () => Response.json({ backend: 'unconfigured' }) });
 assert.deepEqual(await client.transport(), { mode: 'device', workspaceKey: 'device' });
 assert.equal(client.getSnapshot().status, 'device');
 await assert.rejects(client.sendCode('student@example.com'), /not available/);
 client.destroy();
});
test('signed-out users can use device mode; email code creates a separate account workspace', async () => {
 const { client, otpRequests } = fixture();
 assert.equal((await client.transport()).mode, 'device');
 assert.equal(client.getSnapshot().status, 'signed-out');
 await client.sendCode(' alice@example.com ');
 assert.equal(otpRequests[0].email, 'alice@example.com');
 assert.equal(otpRequests[0].options.emailRedirectTo, 'https://nooks.example/');
 await client.verifyCode('alice@example.com', '123456');
 assert.equal(client.getSnapshot().workspaceKey, 'account:alice');
 assert.equal(client.getSnapshot().status, 'signed-in');
 client.destroy();
});
test('bearer calls use the account token; no token appears in a URL', async () => {
 const { client, requests } = fixture({ initialSession: session() });
 await client.authenticatedFetch('/api/workspace');
 const request = requests.find(item => item.path === '/api/workspace');
 assert.equal(request.init.headers.Authorization, 'Bearer token-for-alice');
 assert.equal(request.init.credentials, 'omit');
 assert.equal(request.path, '/api/workspace');
 client.destroy();
});
test('a rejected bearer token locks the account rather than silently saving locally', async () => {
 const { client } = fixture({ initialSession: session(), apiResponse: () => Response.json({ error: 'Expired' }, { status: 401 }) });
 await assert.rejects(client.authenticatedFetch('/api/tools/artifact_save', { method: 'POST' }), /Reconnect/);
 assert.equal(client.getSnapshot().status, 'expired');
 assert.equal(client.getSnapshot().workspaceKey, 'account:alice');
 await assert.rejects(client.transport(), /Reconnect/);
 client.destroy();
});
test('failed refresh keeps account identity and blocks writes', async () => {
 const f = fixture({ initialSession: session() });
 await f.client.initialize(); f.failSession();
 await assert.rejects(f.client.transport(), /Reconnect/);
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:alice');
 assert.equal(f.client.getSnapshot().status, 'expired');
 f.client.destroy();
});
test('automatic SIGNED_OUT never changes an open account workspace to device storage', async () => {
 const f = fixture({ initialSession: session() });
 await f.client.initialize(); f.emit('SIGNED_OUT', null);
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:alice');
 assert.equal(f.client.getSnapshot().status, 'expired');
 await assert.rejects(f.client.transport(), /Reconnect/);
 f.client.destroy();
});
test('deliberate sign-out changes workspace only after success', async () => {
 const f = fixture({ initialSession: session() });
 await f.client.initialize(); await f.client.signOut();
 assert.equal(f.client.getSnapshot().workspaceKey, 'device');
 assert.equal((await f.client.transport()).mode, 'device');
 assert.equal(f.saved.has('nooks:account-workspace:v1'), false);
 f.client.destroy();
 const failed = fixture({ initialSession: session() });
 await failed.client.initialize(); failed.failSignOut();
 await assert.rejects(failed.client.signOut(), /Offline/);
 assert.equal(failed.client.getSnapshot().workspaceKey, 'account:alice');
 failed.client.destroy();
});
test('missing configuration cannot downgrade a remembered account to device mode', async () => {
 const f = fixture({ marker: { id: 'alice', project: config.supabaseUrl }, configResponse: () => Response.json({ backend: 'unconfigured' }) });
 await assert.rejects(f.client.transport(), /account service is unavailable/);
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:alice');
 assert.equal(f.client.getSnapshot().status, 'error');
 f.client.destroy();
});
test('retry recovers a failed configuration request before reopening the remembered account', async () => {
 let attempts = 0;
 const f = fixture({
  initialSession: session(),
  marker: { id: 'alice', project: config.supabaseUrl },
  configResponse: () => ++attempts === 1 ? new Response('Unavailable', { status: 503 }) : Response.json(config),
 });
 const statuses = [];
 const unsubscribe = f.client.subscribe(() => statuses.push(f.client.getSnapshot().status));
 await assert.rejects(f.client.transport(), /temporarily unavailable/);
 await assert.rejects(f.client.transport(), /temporarily unavailable/);
 assert.equal(attempts, 1, 'ordinary workspace retries do not refresh cached configuration');
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:alice');
 await f.client.retry();
 assert.equal(attempts, 2);
 assert.ok(statuses.includes('loading'));
 assert.equal(f.client.getSnapshot().status, 'signed-in');
 assert.deepEqual(await f.client.transport(), { mode: 'account', workspaceKey: 'account:alice', token: 'token-for-alice' });
 assert.ok(!statuses.includes('device'), 'account recovery must never switch to local storage');
 unsubscribe(); f.client.destroy();
});
test('retry that still cannot load configuration keeps account writes blocked', async () => {
 const f = fixture({ marker: { id: 'alice', project: config.supabaseUrl }, configResponse: () => new Response('Unavailable', { status: 503 }) });
 await f.client.initialize();
 await f.client.retry();
 assert.equal(f.requests.filter(item => item.path === '/api/config').length, 2);
 assert.equal(f.client.getSnapshot().status, 'error');
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:alice');
 await assert.rejects(f.client.authenticatedFetch('/api/tools/artifact_save', { method: 'POST' }), /temporarily unavailable/);
 assert.equal(f.requests.filter(item => item.path !== '/api/config').length, 0);
 f.client.destroy();
});
test('an in-flight response is rejected if identity changed while awaiting it', async () => {
 let finish;
 let entered;
 const started = new Promise(resolve => { entered = resolve; });
 const f = fixture({ initialSession: session(), apiResponse: () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
 const pending = f.client.authenticatedFetch('/api/workspace');
 await started; f.emit('SIGNED_IN', session('bob')); finish(Response.json({ private: 'alice' }));
 await assert.rejects(pending, /account changed/);
 assert.equal(f.client.getSnapshot().workspaceKey, 'account:bob');
 f.client.destroy();
});
test('bad email and code are rejected before a provider request', async () => {
 const f = fixture();
 await assert.rejects(f.client.sendCode('not an email'), /valid email/);
 await assert.rejects(f.client.verifyCode('alice@example.com', 'abc'), /code/);
 assert.equal(f.otpRequests.length, 0);
 f.client.destroy();
});

test('a write planned for one account cannot start under a different account', async () => {
 const f = fixture({ initialSession: session() });
 await f.client.initialize(); f.emit('SIGNED_IN', session('bob'));
 await assert.rejects(f.client.authenticatedFetch('/api/tools/artifact_save', { method: 'POST' }, 'account:alice'), /account changed/);
 assert.equal(f.requests.filter(item => item.path === '/api/tools/artifact_save').length, 0);
 f.client.destroy();
});
