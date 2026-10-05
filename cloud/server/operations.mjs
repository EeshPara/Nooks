import { InputError } from './errors.mjs';
const codes = new Set(['ARTWORK_LIMIT','ARTWORK_CONFLICT','AUTH_REQUIRED','FORBIDDEN','INSUFFICIENT_SCOPE','NOT_FOUND','UNKNOWN_TOOL','TOO_LARGE','CONFLICT','REVISION_CONFLICT','RATE_LIMITED','BACKEND_UNAVAILABLE','BACKEND_NOT_CONFIGURED','GENERATION_UNAVAILABLE','GENERATION_FAILED','INVALID_INPUT','INVALID_JSON','METHOD_NOT_ALLOWED','CONTENT_TYPE','SERVER_ERROR','FEATURE_UNAVAILABLE','STORAGE_FULL','STORAGE_INVALID','INVALID_STATE','INVALID_WORKSPACE','CONFIRMATION_REQUIRED','REWARD_LOCKED','ROOM_FULL','SESSION_EXPIRED','SESSION_LIMIT']);
const statuses = { ARTWORK_LIMIT: 429, ARTWORK_CONFLICT: 409, AUTH_REQUIRED: 401, FORBIDDEN: 403, INSUFFICIENT_SCOPE: 403, NOT_FOUND: 404, UNKNOWN_TOOL: 404, METHOD_NOT_ALLOWED: 405, CONFLICT: 409, REVISION_CONFLICT: 409, TOO_LARGE: 413, CONTENT_TYPE: 415, RATE_LIMITED: 429, BACKEND_UNAVAILABLE: 503, BACKEND_NOT_CONFIGURED: 503, STORAGE_INVALID: 503, INVALID_STATE: 503, INVALID_WORKSPACE: 503, GENERATION_UNAVAILABLE: 503, GENERATION_FAILED: 502 };
/** Logical failure status; MCP may still transport an isError tool result over HTTP 200. */
export function failureStatus(error, unexpectedStatus = 503) {
  if (!(error instanceof InputError) || error.code === 'SERVER_ERROR') return unexpectedStatus;
  return Object.hasOwn(statuses, error.code) ? statuses[error.code] : 400;
}
const phases = new Set(['request','configuration','authentication','quota','validation','backend','generation','resource']);
const rpcNames = new Set(['nooks_resolve_identity','nooks_request_limit','nooks_workspace_read','nooks_workspace_commit','nooks_share_read','nooks_community','nooks_outbox_claim','nooks_outbox_ack','nooks_webhook_receive','nooks_artwork_reserve','nooks_artwork_complete','nooks_artwork_cleanup_claim','nooks_artwork_cleanup_ack']);
const transportFailure = error => error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : error instanceof TypeError ? 'network' : 'unexpected';

/** Safe, bounded diagnostics. Never serialize an Error, identity, request, URL, or payload. */
export function createOperationalMonitor({ configured, operations = [], clock = () => new Date(), logger = event => console.error(JSON.stringify(event)), ttlMs = 60000, logLimit = 20 } = {}) {
  const allowed = new Set(['request','unknown','config','health','generate','resources_read','shared_read', ...operations]);
  let observation = null, artworkObservation = null, windowStartedAt = null, count = 0, suppressed = 0;
  const now = () => clock().valueOf();
  const operation = value => allowed.has(value) ? value : 'unknown';
  const observe = state => { if (configured) observation = { state, at: now() }; };
  const log = (event, timestamp) => {
    if (windowStartedAt === null || timestamp - windowStartedAt >= 60000 || timestamp < windowStartedAt) { windowStartedAt = timestamp; count = 0; }
    if (count >= logLimit) { suppressed = Math.min(1000000, suppressed + 1); return; }
    count++;
    const safe = { ...event, ...(suppressed ? { suppressedSinceLastLog: suppressed } : {}) }; suppressed = 0;
    try { logger(safe); } catch { /* Logging cannot replace the user's response. */ }
  };
  return {
    start(name = 'request') { return { requestId: crypto.randomUUID(), operation: operation(name), phase: 'request', startedAt: now(), upstream: null }; },
    setOperation(context, name) { context.operation = operation(name); },
    success() { observe('recent_success'); },
    artworkUnavailable(context, details = {}) {
      if (!context || context.artworkLogged) return;
      context.artworkLogged = true;
      const timestamp = now(); artworkObservation = timestamp;
      const affectedAppearances = Number.isSafeInteger(details.count) ? Math.max(1, Math.min(1000, details.count)) : 1;
      log({ event: 'nooks.artwork_degraded', requestId: context.requestId, operation: operation(context.operation), phase: 'backend', category: 'storage', code: 'ARTWORK_UNAVAILABLE', affectedAppearances, studyDataAvailable: true, durationMs: Math.max(0, Math.min(600000, timestamp - context.startedAt)) }, timestamp);
    },
    health() {
      const fresh = observation && now() >= observation.at && now() - observation.at < ttlMs;
      return { ok: true, liveness: 'alive', eventDelivery: { mode: 'disabled', consumerConfigured: false, uiUpdates: 'authenticated_polling' }, artwork: { observation: artworkObservation !== null && now() >= artworkObservation && now() - artworkObservation < ttlMs ? 'recent_degradation' : 'unknown', observedAt: artworkObservation === null ? null : new Date(artworkObservation).toISOString(), observationTtlSeconds: ttlMs / 1000, scope: 'this-instance' }, backend: { configured: !!configured, observation: fresh ? observation.state : 'unknown', observedAt: observation ? new Date(observation.at).toISOString() : null, observationTtlSeconds: ttlMs / 1000, scope: 'this-instance', evidence: 'recent authenticated operations; not a comprehensive readiness check' } };
    },
    wrapFetch(context, fetchImpl, origin) {
      return async (...args) => {
        let dependency = 'unknown', action = 'unknown';
        try {
          const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url ?? args[0].toString());
          if (url.origin === origin) {
            if (url.pathname === '/auth/v1/user') { dependency = 'authentication'; action = 'verify_user'; }
            else if (url.pathname.startsWith('/rest/v1/')) { dependency = 'database'; const name = url.pathname.slice('/rest/v1/rpc/'.length); action = rpcNames.has(name) ? name : 'read'; }
            else if (url.pathname.startsWith('/storage/v1/')) { dependency = 'storage'; action = args[1]?.method === 'DELETE' ? 'delete_artwork' : args[1]?.method === 'POST' ? 'write_artwork' : 'read_artwork'; }
          } else if (url.origin === 'https://api.openai.com' && url.pathname === '/v1/responses') { dependency = 'generation'; action = 'generate'; }
        } catch {}
        try {
          const response = await fetchImpl(...args);
          if (!response.ok) context.upstream = { dependency, action, status: response.status, failure: response.status >= 300 && response.status < 400 ? 'redirect' : 'http' };
          return response;
        } catch (error) {
          context.upstream = { dependency, action, failure: transportFailure(error) };
          throw error;
        }
      };
    },
    failure(context, error, { code = 'SERVER_ERROR', status = 500, transportStatus = status } = {}) {
      const safeCode = codes.has(code) ? code : 'SERVER_ERROR';
      const phase = phases.has(context.phase) ? context.phase : 'request';
      const category = ['RATE_LIMITED','ARTWORK_LIMIT'].includes(safeCode) ? 'quota' : ['AUTH_REQUIRED','FORBIDDEN','INSUFFICIENT_SCOPE'].includes(safeCode) ? 'authorization' : (context.upstream?.failure ?? transportFailure(error)) === 'timeout' ? 'timeout' : context.upstream?.dependency ?? (phase === 'backend' ? 'storage' : phase);
      // A user's denied action or a generation-provider outage does not establish a database outage.
      if (status >= 500 && (['authentication','quota','backend'].includes(phase) || ['authentication','database'].includes(context.upstream?.dependency)) && context.upstream?.dependency !== 'generation') observe('recent_failure');
      const timestamp = now();
      log({ event: 'nooks.request_failed', requestId: context.requestId, operation: operation(context.operation), phase, category, code: safeCode, status, transportStatus, durationMs: Math.max(0, Math.min(600000, timestamp - context.startedAt)), ...(context.upstream ? { upstream: context.upstream } : {}) }, timestamp);
    },
  };
}
