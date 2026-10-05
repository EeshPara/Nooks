/** The fragment keeps invitation secrets out of HTTP requests and referrers. */
export function invitationToken(value: string): string | undefined {
  if (/^[a-f0-9]{64}$/i.test(value.trim())) return value.trim().toLowerCase();
  try { const token = new URLSearchParams(new URL(value).hash.slice(1)).get('nook-invite'); return token && /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : undefined; } catch { return undefined; }
}
export function invitationLink(token: string, origin = window.location.origin): string {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid invitation.');
  const url = new URL('/', origin); url.hash = `nook-invite=${token.toLowerCase()}`; return url.toString();
}
export function currentInvitation(): string | undefined { return invitationToken(window.location.href); }
