import { librarySharingTools, invokeLibrarySharing } from './library-sharing.mjs';
import { StudyEngine, InputError } from './engine.mjs';
import { SupabaseStore } from './supabase-store.mjs';
import { createSupabaseIdentityVerifier, supabaseOrigin, serviceHeaders, sha256 } from './supabase-auth.mjs';
import { NookCreator, creatorToolNames } from './nook-creator.mjs';
import { communityTools, invokeCommunity, isCommunityTool } from './community-tools.mjs';
import { toolNames } from './tools.mjs';
import { generateStudyMaterial } from './study-generation.mjs';
import { createRequestLimiter } from './request-limiter.mjs';
import { createOperationalMonitor, failureStatus } from './operations.mjs';
import { createRequestLifetime } from './request-lifetime.mjs';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const json = (response, status, body, headers = {}) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', ...headers });
  response.end(JSON.stringify(body));
};
const failure = (response, error, monitor, context) => {
  const safe = error instanceof InputError;
  const code = safe ? error.code : 'BACKEND_UNAVAILABLE';
  const message = safe ? error.message : 'Nooks could not reach your account. Your saved work has not been replaced. Try again shortly.';
  const status = failureStatus(error);
  monitor.failure(context, error, { code, status });
  return json(response, status, { error: { code, message, requestId: context.requestId, ...(Number.isSafeInteger(error?.currentRevision) ? { currentRevision: error.currentRevision } : {}) } }, { 'X-Request-Id': context.requestId, ...(code === 'RATE_LIMITED' ? { 'Retry-After': String(error.retryAfter ?? 60) } : {}) });
};

/** Reject operator mistakes before anything resembling a server credential reaches the browser. */
export function isPublicSupabaseKey(value) {
  if (typeof value !== 'string' || !value || /\s/.test(value)) return false;
  if (value.startsWith('sb_publishable_')) return true;
  try { const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); return claims.role === 'anon' && value.split('.').length === 3; } catch { return false; }
}
export function browserBackendConfig(env = process.env) {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (!url || !isPublicSupabaseKey(publishableKey) || !serviceKey) return null;
    serviceHeaders(serviceKey);
    const origin = supabaseOrigin(url);
    return { url: origin, publishableKey, serviceKey, openaiKey: env.OPENAI_API_KEY || null, model: env.NOOKS_GENERATION_MODEL || 'gpt-4.1-mini' };
  } catch { return null; }
}
async function readBody(request) {
  if ((request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new InputError('Use a JSON request body.', 'INVALID_INPUT');
  const size = Number(request.headers['content-length']);
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) throw new InputError('This material is too large. Use a smaller selection.', 'TOO_LARGE');
  let raw;
  // Vercel may parse JSON before dispatching; size is checked in either representation.
  if (request.body !== undefined) {
    try { raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body); }
    catch (error) {
      if (error instanceof RangeError) throw new InputError('The request is too deeply nested. Use a simpler JSON object.', 'INVALID_INPUT');
      throw error;
    }
  }
  else {
    const chunks = []; let length = 0;
    for await (const chunk of request) { length += chunk.length; if (length > MAX_BODY_BYTES) throw new InputError('This material is too large. Use a smaller selection.', 'TOO_LARGE'); chunks.push(chunk); }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new InputError('This material is too large. Use a smaller selection.', 'TOO_LARGE');
  let value; try { value = JSON.parse(raw); } catch { throw new InputError('The request could not be read. Please try again.', 'INVALID_JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('A JSON object is required.');
  return value;
}

/** Same-origin browser transport. User identity only comes from Supabase Auth verification. */
export function createBrowserApiHandler({ env = process.env, fetchImpl = fetch, clock = () => new Date(), allowedOrigins, logger } = {}) {
  const config = browserBackendConfig(env);
  const origins = new Set(allowedOrigins ?? [env.NOOKS_PUBLIC_URL ?? 'https://nooks-study-space.vercel.app', ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : [])]);
  const monitor = createOperationalMonitor({ configured: !!config, operations: [...toolNames, ...creatorToolNames, ...communityTools.map(tool => tool.name)], clock, logger });
  // Early per-instance guard protects authentication from accidental loops. Authoritative
  // account quotas below are database-backed and survive serverless instance changes.
  const earlyRequests = createRequestLimiter({ limit: 600 });
  return async (request, response) => {
    const context = monitor.start();
    const lifetime = createRequestLifetime(request, response, fetchImpl);
    const reply = (status, body, headers) => { if (!lifetime.disconnected) return json(response, status, body, headers); };
    try {
      if (lifetime.disconnected) return;
      const origin = request.headers.origin;
      if (origin && !origins.has(origin)) return reply(403, { error: { code: 'FORBIDDEN', message: 'Open Nooks to use this feature.' } });
      if (request.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: { code: 'FORBIDDEN', message: 'Open Nooks to use this feature.' } });
      const path = new URL(request.url ?? '/', 'https://nooks.invalid').pathname;
      if (path === '/api/health' && request.method === 'GET') return reply(200, monitor.health());
      if (path === '/api/config' && request.method === 'GET') return reply(200, {
        backend: config ? 'supabase' : 'unconfigured',
        ...(config ? { supabaseUrl: config.url, publishableKey: config.publishableKey } : {}),
        generation: !!config?.openaiKey,
        capabilities: { librarySharing: !!config, accountSync: !!config, community: !!config, generation: !!config?.openaiKey },
      });
      const name = path === '/api/workspace' ? 'workspace_get' : path.startsWith('/api/tools/') ? path.slice('/api/tools/'.length) : null;
      const generation = path === '/api/generate';
      monitor.setOperation(context, generation ? 'generate' : name);
      if (!generation && (!name || (!toolNames.has(name) && !creatorToolNames.has(name) && !isCommunityTool(name) && !librarySharingTools.has(name)))) throw new InputError('This action is not available.', 'NOT_FOUND');
      const method = path === '/api/workspace' ? 'GET' : 'POST';
      if (request.method !== method) return reply(405, { error: { code: 'METHOD_NOT_ALLOWED', message: `Use ${method} for this action.` } }, { Allow: method });
      context.phase = 'configuration';
      if (!config) throw new InputError('Account sync is not connected yet. Your work on this device is still available.', 'BACKEND_UNAVAILABLE');
      const observedFetch = monitor.wrapFetch(context, lifetime.fetch, config.url);
      const verify = createSupabaseIdentityVerifier({ ...config, fetchImpl: observedFetch });
      context.phase = 'authentication';
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
      if (!match || match[1].length > 8192) throw new InputError('Sign in to save to your account and join study nooks.', 'AUTH_REQUIRED');
      // A serverless proxy may share one socket address across many students. Key this
      // loop guard by a one-way token hash; durable per-account quotas remain below.
      const remote = await sha256(match[1]);
      const now = clock().valueOf();
      const earlyLimit = earlyRequests(remote, now);
      if (!earlyLimit.allowed) { const error = new InputError('Too many requests. Please wait a moment.', 'RATE_LIMITED'); error.retryAfter = earlyLimit.retryAfter; throw error; }
      const identity = await verify(match[1]);
      if (!identity) throw new InputError('Your sign-in has expired. Sign in again to continue.', 'AUTH_REQUIRED');
      context.phase = 'quota';
      const store = new SupabaseStore({ ...config, identity, fetchImpl: observedFetch, clock, onArtworkUnavailable: details => { if (!lifetime.disconnected) monitor.artworkUnavailable(context, details); } });
      const limit = await store.rpc('nooks_request_limit', { p_account: identity.id, p_bucket: 'api', p_limit: 180, p_window_seconds: 60 });
      if (typeof limit?.allowed !== 'boolean') throw new Error('Invalid account quota response.');
      monitor.success();
      if (limit?.allowed !== true) { const error = new InputError('Please wait a moment before trying again.', 'RATE_LIMITED'); error.retryAfter = limit?.retryAfter ?? 60; throw error; }
      context.phase = 'validation';
      const args = request.method === 'POST' ? await readBody(request) : {};
      context.phase = 'backend';
      const engine = new StudyEngine(store, { clock, shareBaseUrl: env.NOOKS_PUBLIC_URL ?? 'https://nooks-study-space.vercel.app' });
      let result;
      if (librarySharingTools.has(name)) {
        result = await invokeLibrarySharing(store, identity, name, args, env.NOOKS_PUBLIC_URL ?? 'https://nooks-study-space.vercel.app');
        return reply(200, result);
      }
      if (generation) {
        // A saved retry should remain recoverable even if the generation quota is now full.
        if (typeof args.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.requestId)) {
          const savedWorkspace = await store.read(identity.id);
          const savedArtifact = savedWorkspace.artifacts.find(item => item.id === `generated-${args.requestId}`);
          if (savedArtifact) { savedWorkspace.backend = 'supabase'; return reply(200, { artifact: savedArtifact, workspace: savedWorkspace, authenticated: true, duplicate: true }); }
        }
        context.phase = 'generation';
        if (!config.openaiKey) throw new InputError('AI generation is not connected on the website yet. You can still create material in ChatGPT.', 'GENERATION_UNAVAILABLE');
        context.phase = 'quota';
        const quota = await store.rpc('nooks_request_limit', { p_account: identity.id, p_bucket: 'generation', p_limit: 20, p_window_seconds: 3600 });
        if (typeof quota?.allowed !== 'boolean') throw new Error('Invalid generation quota response.');
        if (quota?.allowed !== true) { const error = new InputError('You have reached the hourly generation limit. Keep studying your saved material and try again later.', 'RATE_LIMITED'); error.retryAfter = quota?.retryAfter ?? 3600; throw error; }
        context.phase = 'generation';
        result = await generateStudyMaterial({ args, engine, store, identity, apiKey: config.openaiKey, model: config.model, fetchImpl: observedFetch });
      } else result = creatorToolNames.has(name) ? await new NookCreator(store, { clock }).call(name, args, identity) : isCommunityTool(name) ? await invokeCommunity(store, name, args) : await engine.call(name, args, identity);
      if (result?.workspace) result.workspace.backend = 'supabase';
      return reply(200, result);
    } catch (error) {
      if (!lifetime.disconnected && !response.destroyed && !response.writableEnded) return failure(response, error, monitor, context);
    } finally { lifetime.dispose(); }
  };
}
