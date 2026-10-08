import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';

export type PublicBackendConfig = {
 backend: 'supabase' | 'unconfigured';
 supabaseUrl?: string;
 publishableKey?: string;
 capabilities?: Record<string, boolean>;
};
export type NooksAccount = {
 status: 'loading' | 'device' | 'signed-out' | 'signed-in' | 'expired' | 'error';
 configured: boolean;
 user: { id: string; email?: string } | null;
 workspaceKey: string;
 configError: string | null;
 capabilities: Record<string, boolean>;
};
type RememberedAccount = { id: string; project: string };
type ClientFactory = (url: string, key: string, options: object) => SupabaseClient;
type Options = { fetch?: typeof fetch; storage?: Storage; createClient?: ClientFactory; origin?: string };
const selectionKey = 'nooks:account-workspace:v1';
const sessionKey = 'nooks:auth:v1';
const projectSessionKey = (project: string) => `${sessionKey}:${new URL(project).host}`;
const reconnectMessage = 'Reconnect your account to save. Your work has not been moved to device storage.';

/** Authentication only. The server verifies every bearer token and owns authorization. */
export function createAccountController(options: Options = {}) {
 const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
 const storage = options.storage ?? (() => { try { return localStorage; } catch { return undefined; } })();
 const listeners = new Set<() => void>();
 const realtimeCleanups = new Set<() => void>();
 let config: PublicBackendConfig | undefined;
 let client: SupabaseClient | undefined;
 let subscription: { unsubscribe(): void } | undefined;
 let loading: Promise<void> | undefined;
 let blocked = false;
 let deliberateSignOut = false;
 function readSelection(): RememberedAccount | null {
  try { const value = JSON.parse(storage?.getItem(selectionKey) || 'null'); return typeof value?.id === 'string' && typeof value?.project === 'string' ? value : null; } catch { return null; }
 }
 let selected = readSelection();
 let snapshot: NooksAccount = { status: 'loading', configured: false, user: null, workspaceKey: selected ? `account:${selected.id}` : 'device', configError: null, capabilities: {} };
 const update = (next: Partial<NooksAccount>) => { snapshot = { ...snapshot, ...next }; listeners.forEach(listener => listener()); };
 function remember(value: RememberedAccount | null) {
  selected = value;
  try { if (value) storage?.setItem(selectionKey, JSON.stringify(value)); else storage?.removeItem(selectionKey); } catch { /* The current session still works when persistence is disabled. */ }
 }
 function guest() {
  blocked = false;
  update({ status: config?.backend === 'supabase' ? 'signed-out' : 'device', user: null, workspaceKey: 'device', configError: null });
 }
 function applySession(session: Session | null, event?: string) {
  if (deliberateSignOut) return;
  if (session?.user && !blocked) {
   remember({ id: session.user.id, project: config!.supabaseUrl! });
   update({ status: 'signed-in', user: { id: session.user.id, email: session.user.email }, workspaceKey: `account:${session.user.id}`, configError: null });
  } else if (selected) {
   update({ status: 'expired', workspaceKey: `account:${selected.id}`, configError: reconnectMessage });
  } else if (event === 'SIGNED_OUT' || !session) guest();
 }
 async function initialize() {
  if (loading) return loading;
  loading = (async () => {
   try {
    const response = await request('/api/config', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.status === 404 || (response.ok && response.headers.get('content-type')?.includes('text/html'))) config = { backend: 'unconfigured' };
    else {
     if (!response.ok) throw new Error('Account service is temporarily unavailable. Try again.');
     const result = await response.json();
     if (result?.backend !== 'supabase' && result?.backend !== 'unconfigured') throw new Error('Account service configuration could not be verified.');
     config = result;
    }
    update({ configured: config!.backend === 'supabase', capabilities: config!.capabilities ?? {} });
    if (config!.backend === 'unconfigured') {
     if (selected) throw new Error('Your account service is unavailable. Reconnect before saving your account work.');
     guest(); return;
    }
    const project = new URL(config!.supabaseUrl!);
    if (!config!.publishableKey || config!.publishableKey.startsWith('sb_secret_') || project.username || project.password || (project.protocol !== 'https:' && !(project.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(project.hostname)))) throw new Error('Account service is not configured correctly.');
    const factory = options.createClient ?? (await import('@supabase/supabase-js')).createClient;
    client = factory(config!.supabaseUrl!, config!.publishableKey!, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: projectSessionKey(config!.supabaseUrl!), ...(storage ? { storage } : {}) } });
    subscription = client.auth.onAuthStateChange((event, session) => {
     // Keep this callback synchronous: Supabase holds its auth lock while calling it.
     if (event === 'SIGNED_IN') blocked = false;
     applySession(session, event);
    }).data.subscription;
    const { data, error } = await client.auth.getSession();
    if (error) { if (selected) { update({ status: 'expired', configError: reconnectMessage }); return; } throw error; }
    applySession(data.session);
   } catch (reason) {
    update({ status: 'error', configError: reason instanceof Error ? reason.message : 'Account service is unavailable. Try again.' });
   }
  })();
  return loading;
 }
 async function requireClient() {
  await initialize();
  if (!client || config?.backend !== 'supabase') throw new Error(snapshot.configError || 'Account sign-in is not available yet. You can keep studying on this device.');
  return client;
 }
 async function sendCode(email: string) {
  const authClient = await requireClient();
  const clean = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) throw new Error('Enter a valid email address.');
  const origin = options.origin ?? window.location.origin;
  const { error } = await authClient.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/` } });
  if (error) throw new Error(error.message);
 }
 async function verifyCode(email: string, token: string) {
  const authClient = await requireClient();
  if (!/^\d{6,10}$/.test(token.trim())) throw new Error('Enter the code from your email.');
  blocked = false;
  const { data, error } = await authClient.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('The code was not accepted. Request a new email and try again.');
  applySession(data.session);
 }
 function expire() { blocked = true; update({ status: 'expired', configError: reconnectMessage }); }
 async function signOut() {
  // Do not switch workspaces unless the local sign-out operation has completed.
  deliberateSignOut = true;
  try {
   if (client) { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw new Error(error.message); }
   if (!client && selected) { try { storage?.removeItem(projectSessionKey(selected.project)); } catch { /* Storage can be unavailable. */ } }
   remember(null); guest();
  } finally { deliberateSignOut = false; }
 }
 async function transport(): Promise<{ mode: 'device'; workspaceKey: string } | { mode: 'account'; workspaceKey: string; token: string }> {
  await initialize();
  if (snapshot.status === 'error') throw new Error(snapshot.configError || 'Account service is unavailable.');
  if (snapshot.workspaceKey === 'device') return { mode: 'device', workspaceKey: 'device' };
  if (blocked || snapshot.status === 'expired') throw new Error(reconnectMessage);
  const key = snapshot.workspaceKey;
  const authClient = await requireClient();
  const { data, error } = await authClient.auth.getSession();
  if (error || !data.session?.access_token) { expire(); throw new Error(reconnectMessage); }
  if (`account:${data.session.user.id}` !== key || snapshot.workspaceKey !== key) throw new Error('Your account changed. Reopen this action in the current workspace.');
  return { mode: 'account', workspaceKey: key, token: data.session.access_token };
 }
 async function authenticatedFetch(path: string, init: RequestInit = {}, expectedWorkspaceKey?: string) {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid account request.');
  const startingKey = expectedWorkspaceKey ?? (snapshot.status === 'loading' ? undefined : snapshot.workspaceKey);
  const authorization = await transport();
  if (startingKey && authorization.workspaceKey !== startingKey) throw new Error('Your account changed. Reopen this action in the current workspace.');
  if (authorization.mode !== 'account') throw new Error('Sign in to use this account feature.');
  const response = await request(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${authorization.token}` }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (snapshot.workspaceKey !== authorization.workspaceKey) throw new Error('Your account changed while this action was running. Reopen it in your current workspace.');
  if (response.status === 401) { expire(); throw new Error(reconnectMessage); }
  return response;
 }
 /** Receive only lossy invalidation hints; authorization and data stay on the server. */
 function subscribeCommunity(recoveryScope: string, nookId: string | undefined, invalidate: (topic: string) => void) {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  if (!new RegExp(`^account:${uuid}$`, 'i').test(recoveryScope) || (nookId && !new RegExp(`^${uuid}$`, 'i').test(nookId)) || snapshot.status !== 'signed-in') return () => {};
  // This is the browser auth workspace, deliberately NOT the server account ID.
  const workspaceKey = snapshot.workspaceKey;
  let stopped = false, revision = 0, attempt = 0, failures = 0, token: string | undefined;
  let channels: RealtimeChannel[] = [], retryTimer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !stopped && snapshot.status === 'signed-in' && snapshot.workspaceKey === workspaceKey;
  const remove = () => { const old = channels; channels = []; for (const channel of old) void client?.removeChannel(channel).catch(() => {}); };
  function stop() { if (stopped) return; stopped = true; revision++; attempt++; clearTimeout(retryTimer); remove(); listeners.delete(onAccount); realtimeCleanups.delete(stop); }
  function retry() {
   if (!current() || retryTimer) return;
   revision++; attempt++; remove(); token = undefined;
   // Quota/authorization/network failures must not become a channel-join storm.
   const delay = Math.min(120000, 15000 * 2 ** Math.min(failures++, 3)) + Math.random() * 5000;
   retryTimer = setTimeout(() => { retryTimer = undefined; void connect(); }, delay);
  }
  async function connect() {
   const stamp = ++attempt;
   try {
    const authorization = await transport();
    if (!current() || stamp !== attempt || authorization.mode !== 'account' || authorization.workspaceKey !== workspaceKey || !client) return;
    if (token === authorization.token && channels.length) return;
    // Rejoin on JWT refresh so channel RLS is recalculated, including revocations.
    const channelRevision = ++revision;
    remove(); await client.realtime.setAuth(authorization.token);
    if (!current() || stamp !== attempt) return;
    token = authorization.token;
    const topics = ['nooks:directory', recoveryScope.toLowerCase(), ...(nookId ? [`nook:${nookId.toLowerCase()}`] : [])];
    const ready = new Set<string>();
    for (const topic of topics) {
     if (!current() || stamp !== attempt) break;
     const channel = client.channel(topic, { config: { private: true } }); channels.push(channel);
     channel.on('broadcast', { event: 'invalidate' }, message => {
      if (current() && channelRevision === revision && message?.payload?.v === 1) invalidate(topic);
     }).subscribe(status => {
      if (!current() || channelRevision !== revision) return;
      if (status === 'SUBSCRIBED') { ready.add(topic); if (ready.size === topics.length) failures = 0; invalidate(topic); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') retry();
     });
    }
   } catch { if (current() && stamp === attempt) retry(); }
  }
  function onAccount() {
   if (!current()) { stop(); return; }
   // Never acquire the Supabase auth lock from inside onAuthStateChange.
   queueMicrotask(() => { if (current() && !retryTimer) void connect(); });
  }
  listeners.add(onAccount); realtimeCleanups.add(stop); void connect();
  return stop;
 }
 function onStorage(event: StorageEvent) {
  if (event.key !== selectionKey) return;
  selected = readSelection();
  if (!selected) guest();
  else if (`account:${selected.id}` !== snapshot.workspaceKey) update({ status: 'expired', user: null, workspaceKey: `account:${selected.id}`, configError: reconnectMessage });
 }
 if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
 return {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  initialize, sendCode, verifyCode, signOut, transport, authenticatedFetch, subscribeCommunity,
  retry: async () => { realtimeCleanups.forEach(stop => stop()); subscription?.unsubscribe(); client = undefined; loading = undefined; update({ status: 'loading', configError: null }); await initialize(); },
  destroy: () => { realtimeCleanups.forEach(stop => stop()); subscription?.unsubscribe(); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); listeners.clear(); },
 };
}

export const nooksAccount = createAccountController();
