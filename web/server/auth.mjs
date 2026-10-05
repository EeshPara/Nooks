/** Access tokens are verified by a fixed, operator-configured OAuth provider. */
export function createIntrospectionVerifier({ endpoint, issuer, audience, clientId, clientSecret, fetchImpl = fetch }) {
  if (!endpoint || !issuer || !audience || !clientId || !clientSecret) return null;
  if (![endpoint, issuer, audience].every(value => new URL(value).protocol === 'https:')) throw new Error('Production OAuth URLs must use HTTPS.');
  return async token => {
    if (!token || token.length > 8192) return null;
    const response = await fetchImpl(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(5000), redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
    });
    if (!response.ok) return null;
    const claims = await response.json();
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.active !== true || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 || claims.iss !== issuer || !audiences.includes(audience) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000) return null;
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(/\s+/) : [];
    if (!scopes.includes('notable.read')) return null;
    return { id: `${issuer}|${claims.sub}`, scopes };
  };
}

export async function requestIdentity(request, config) {
  // Local demo access is explicit, loopback bound, and never enabled through a header.
  if (config.demo) return { id: 'notable-local-demo', demo: true, scopes: ['notable.read', 'notable.write'] };
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
  if (!match) return null;
  if (!config.verifyToken) return null;
  const user = await config.verifyToken(match[1]);
  if (!user?.id || !user.scopes?.includes('notable.read')) return null;
  return user;
}
