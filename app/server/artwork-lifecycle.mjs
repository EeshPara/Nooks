import { serviceHeaders, supabaseOrigin } from './supabase-auth.mjs';

export const ARTWORK_BUCKET = 'nooks-private';
export const ARTWORK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const mimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** This is a stored, owner-bound reference, never a URL or a caller capability. */
export function parseArtworkReference(ref, owner) {
  if (!ARTWORK_UUID.test(owner ?? '') || !ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.path !== 'string' || !mimeTypes.has(ref.mime) || Object.keys(ref).some(key => !['path', 'mime'].includes(key))) throw new Error('Invalid private artwork reference.');
  const [account, hash, generation, ...extra] = ref.path.split('/');
  if (account !== owner || !/^[a-f0-9]{64}$/.test(hash ?? '') || extra.length || (generation !== undefined && !ARTWORK_UUID.test(generation))) throw new Error('Invalid private artwork reference.');
  return { path: ref.path, mime: ref.mime, hash, generation: generation ?? null };
}

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid artwork cleanup ${name}.`);
}

async function confirmsObjectAbsence(response) {
  if (![400, 404].includes(response.status) || !response.body) return false;
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength; if (bytes > 4096) return false; chunks.push(next.value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const error = JSON.parse(new TextDecoder().decode(joined));
    // Bucket, tenant, proxy, auth and generic 404s say nothing about this object.
    return error?.code === 'NoSuchKey' || (String(error?.statusCode) === '404' && error?.error === 'not_found' && error?.message === 'Object not found');
  } catch { return false; }
  finally { try { await reader.cancel(); } catch {} }
}

/** Bounded service-only operator client. No scheduler, browser route, or MCP tool.
 * A dry run is the default and never calls Storage. Mutating runs accept paths
 * only from a database claim, whose permanent fence survives lease expiry.
 */
export function createArtworkCleanup({ url, serviceKey, accountId, fetchImpl = fetch, clock = () => new Date() }) {
  if (!ARTWORK_UUID.test(accountId ?? '')) throw new Error('An exact artwork cleanup account is required.');
  const origin = supabaseOrigin(url), headers = serviceHeaders(serviceKey);
  const request = (...args) => fetchImpl(...args);
  async function rpc(name, args) {
    const response = await request(`${origin}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!response.ok) throw new Error('Artwork cleanup state is temporarily unavailable.');
    return response.json();
  }
  return {
    async run({ dryRun = true, limit = 25, minAgeSeconds = 2592000, leaseSeconds = 60 } = {}) {
      if (typeof dryRun !== 'boolean') throw new Error('Invalid artwork cleanup dry-run setting.');
      integer(limit, 1, 50, 'limit'); integer(minAgeSeconds, 86400, 31536000, 'retention'); integer(leaseSeconds, 15, 300, 'lease');
      const page = await rpc('nooks_artwork_cleanup_claim', { p_account: accountId, p_dry_run: dryRun, p_limit: limit, p_min_age_seconds: minAgeSeconds, p_lease_seconds: leaseSeconds });
      if (!page || page.bucket !== ARTWORK_BUCKET || page.dryRun !== dryRun || typeof page.quarantined !== 'boolean' || !Array.isArray(page.candidates) || page.candidates.length > limit || typeof page.hasMore !== 'boolean' || (page.quarantined && page.candidates.length)) throw new Error('Invalid artwork cleanup claim response.');
      const seen = new Set();
      // Validate the entire page before a single delete. Foreign, legacy, duplicate,
      // expired or malformed claims cannot partially authorize a cleanup batch.
      for (const candidate of page.candidates) {
        const ref = parseArtworkReference({ path: candidate?.path, mime: 'image/png' }, accountId);
        if (!ref.generation || candidate.generation !== ref.generation || !(dryRun ? ['reserved', 'ready', 'deleting', 'deleted'] : ['deleting', 'deleted']).includes(candidate.state) || seen.has(ref.path)) throw new Error('Invalid artwork cleanup candidate.');
        seen.add(ref.path);
        if (!dryRun && (!ARTWORK_UUID.test(candidate.claimToken ?? '') || !Number.isFinite(Date.parse(candidate.leaseUntil)) || Date.parse(candidate.leaseUntil) <= clock().valueOf())) throw new Error('Invalid artwork cleanup lease.');
      }
      if (dryRun) return { ...page, outcomes: [] };
      const outcomes = [];
      for (const candidate of page.candidates) {
        if (Date.parse(candidate.leaseUntil) <= clock().valueOf()) { outcomes.push({ path: candidate.path, status: 'lease-expired' }); continue; }
        let success = false;
        try {
          // Supabase Storage remove expects an array of exact paths, despite the
          // wire field's historical name `prefixes`. Never pass a directory here.
          const deleted = await request(`${origin}/storage/v1/object/${ARTWORK_BUCKET}`, { method: 'DELETE', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [candidate.path] }) });
          if (deleted.ok || deleted.status === 404) {
            const check = await request(`${origin}/storage/v1/object/authenticated/${ARTWORK_BUCKET}/${candidate.path}`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers });
            // A 2xx delete is not proof of absence. Auth/network/redirect errors
            // are unknown outcomes, never permission to mark bytes removed.
            success = await confirmsObjectAbsence(check);
            try { await check.body?.cancel(); } catch {}
          }
          await deleted.body?.cancel();
        } catch { /* Keep the generation fenced and retryable after any uncertainty. */ }
        try {
          const ack = await rpc('nooks_artwork_cleanup_ack', { p_account: accountId, p_path: candidate.path, p_claim_token: candidate.claimToken, p_success: success });
          const acknowledged = ack?.acknowledged === true && (success ? ack.state === 'deleted' : ['deleting', 'deleted'].includes(ack.state));
          outcomes.push({ path: candidate.path, status: acknowledged ? success ? 'deleted' : 'retry-needed' : 'acknowledgment-unknown' });
        } catch { outcomes.push({ path: candidate.path, status: 'acknowledgment-unknown' }); }
      }
      return { dryRun: false, quarantined: page.quarantined, hasMore: page.hasMore, outcomes };
    },
  };
}
