/** Server-only authentication. Sites identity mapping does not create a Supabase login. */
const proofs = new WeakSet();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
export const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))].map(v => v.toString(16).padStart(2, '0')).join('');
export function supabaseOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Supabase must use a configured HTTPS origin.');
  return url.origin;
}
export function serviceHeaders(key) {
  if (typeof key !== 'string' || !key || /\s/.test(key)) throw new Error('Server-only Supabase key required.');
  if (key.startsWith('sb_publishable_')) throw new Error('A publishable key cannot perform server operations.');
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) };
}
export function isVerifiedSupabaseIdentity(identity) { return !!identity && proofs.has(identity); }
function proof(id, provider) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid verified account response.');
  const result = Object.freeze({ id, provider, scopes: Object.freeze(['notable.read', 'notable.write']) });
  proofs.add(result); return result;
}
async function resolveAccount({ url, serviceKey, namespace, subject, authUserId = null, fetchImpl = fetch }) {
  if (typeof namespace !== 'string' || !namespace || namespace.length > 120 || typeof subject !== 'string' || !subject.trim() || subject.length > 256) throw new Error('Server-verified identity required.');
  // Workers support manual redirects; reject the resulting non-2xx response below.
  // Never follow a redirect carrying the service credential to another endpoint.
  const response = await fetchImpl(`${supabaseOrigin(url)}/rest/v1/rpc/nooks_resolve_identity`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { ...serviceHeaders(serviceKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_namespace: namespace, p_subject_hash: await sha256(subject), p_auth_user_id: authUserId }),
  });
  if (!response.ok) throw new Error('Nooks account connection is temporarily unavailable.');
  const account = await response.json(); return proof(account.id, authUserId ? 'supabase' : 'sites');
}

/** Call only inside the Sites dispatcher; never enable this on a public Node listener. */
export function createSitesIdentityResolver({ url, serviceKey, namespace, trustedBoundary, fetchImpl = fetch }) {
  if (trustedBoundary !== 'sites-dispatcher') throw new Error('Sites identity requires the trusted Sites dispatcher boundary.');
  if (!namespace?.startsWith('sites:')) throw new Error('Use a stable sites:<project_id> identity namespace.');
  supabaseOrigin(url); serviceHeaders(serviceKey);
  return async ({ subject }) => resolveAccount({ url, serviceKey, namespace, subject, fetchImpl });
}

/** Verifies the bearer token with Supabase Auth, then maps its verified user UUID. */
export function createSupabaseIdentityVerifier({ url, publishableKey, serviceKey, fetchImpl = fetch }) {
  const origin = supabaseOrigin(url);
  if (!publishableKey) throw new Error('Supabase publishable key required for Auth verification.');
  serviceHeaders(serviceKey);
  return async token => {
    if (typeof token !== 'string' || !token || token.length > 8192 || /\s/.test(token)) return null;
    const response = await fetchImpl(`${origin}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    if ([401,403].includes(response.status)) return null;
    if (!response.ok) throw new Error('Supabase authentication is temporarily unavailable.');
    const user = await response.json();
    if (!UUID.test(user?.id ?? '')) return null;
    return resolveAccount({ url: origin, serviceKey, namespace: `supabase:${new URL(origin).hostname}`, subject: user.id, authUserId: user.id, fetchImpl });
  };
}

/** HMAC envelope; trusted caller supplies the configured endpoint secret and raw body. */
export async function verifySupabaseWebhook({ secret, timestamp, eventId, signature, rawBody, now = Date.now(), maxSkewSeconds = 300 }) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof rawBody !== 'string' || encoder.encode(rawBody).length > 131072
    || typeof eventId !== 'string' || !/^[A-Za-z0-9._:-]{1,180}$/.test(eventId) || !/^\d{10}$/.test(timestamp ?? '')
    || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? '') || Math.abs(now / 1000 - Number(timestamp)) > maxSkewSeconds) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const mac = Uint8Array.from(signature.slice(7).match(/../g), n => parseInt(n,16));
  if (!await crypto.subtle.verify('HMAC', key, mac, encoder.encode(`${timestamp}.${eventId}.${rawBody}`))) return null;
  let body; try { body = JSON.parse(rawBody); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return { eventId, payloadHash: await sha256(rawBody), body };
}
