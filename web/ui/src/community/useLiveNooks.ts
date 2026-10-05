import { useCallback, useEffect, useRef, useState } from 'react';
import { callTool } from '../bridge';

export interface LiveNook {
  id: string; title: string; description: string; visibility: 'public' | 'private'; roomId: string;
  joined: boolean; role?: 'owner' | 'member' | null; memberCount: number; onlineCount: number; createdAt?: string;
}
export interface LiveMember { id: string; displayName: string; avatar: number; role: string; online: boolean; focusMinutes: number }
export interface LiveLeaderboard { id: string; displayName: string; avatar: number; focusMinutes: number; rank: number }
export interface LiveProfile { id: string; displayName: string; avatar: number }
export interface LiveSnapshot { nook: LiveNook; members: LiveMember[]; memberCount: number; onlineCount: number; leaderboard: LiveLeaderboard[]; focusSession?: unknown }
export interface LiveInvite { id: string; nookId: string; expiresAt: string; token: string }
export interface LiveInviteStatus { id: string; nookId: string; expiresAt: string; uses: number; maxUses: number; revokedAt: string | null }
export interface LiveInvitePage { invites: LiveInviteStatus[]; offset: number; limit: number; hasMore: boolean; nextOffset: number | null }
export interface CreateLiveNook { requestId: string; title: string; description: string; roomId: string; visibility: 'public' | 'private' }

const accountScope = (value?: string) => typeof value === 'string' && /^account:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
const nookIdValue = (value?: string) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
const selectionKey = (scope: string) => `nooks:community-selection:v1:${scope}`;
function rememberedSelection(scope: string) { try { return nookIdValue(window.localStorage.getItem(selectionKey(scope)) ?? undefined); } catch { return undefined; } }
function rememberSelection(scope: string, nookId?: string) { try { if (nookId) window.localStorage.setItem(selectionKey(scope), nookId); else window.localStorage.removeItem(selectionKey(scope)); } catch { /* Reload recovery is optional when device storage is unavailable. */ } }
function verifiedProfile(value: unknown, scope: string): LiveProfile | undefined {
  const p = value as LiveProfile | undefined;
  return p && p.id === scope.slice(8) && typeof p.displayName === 'string' && !!p.displayName.trim() && p.displayName.length <= 80 && Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar <= 7 ? p : undefined;
}
function requireOwner(result: Record<string, any>, scope: string) {
  if (accountScope(result.recoveryScope) !== scope) throw Object.assign(new Error('Your account changed. Reopen Nooks in the current account.'), { code: 'ACCOUNT_CHANGED' });
}

/** Requires an authenticated workspace and its server-verified recovery scope. */
export function useLiveNooks({ enabled, recoveryScope, activeNookId }: { enabled: boolean; recoveryScope?: string; activeNookId?: string }) {
  const scope = accountScope(recoveryScope), connected = enabled && !!scope;
  const [directory, setDirectory] = useState({ offset: 0, joinedOnly: false, hasMore: false });
  const page = useRef({ offset: 0, joinedOnly: false });
  const [nooks, setNooks] = useState<LiveNook[]>([]);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [profile, setProfile] = useState<LiveProfile | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const live = useRef(false), mounted = useRef(false), generation = useRef(0), active = useRef<string | undefined>(undefined), owner = useRef<string | undefined>(undefined);
  const flight = useRef<Promise<void> | null>(null), pending = useRef(false), actionBusy = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback((): Promise<void> => {
    if (!live.current || !mounted.current || document.hidden) return Promise.resolve();
    if (flight.current) { pending.current = true; return flight.current; }
    const stamp = generation.current, nookId = active.current, requestedPage = { ...page.current }, expectedOwner = owner.current!;
    const current = () => mounted.current && live.current && stamp === generation.current && expectedOwner === owner.current;
    setLoading(true);
    const request = (async () => {
      try {
        const list = await callTool('nooks_list', { ...requestedPage, limit: 50 });
        if (!current()) return;
        requireOwner(list, expectedOwner);
        if (!Array.isArray(list.nooks)) throw new Error('The study directory could not be loaded.');
        const savedProfile = verifiedProfile(list.profile, expectedOwner);
        if (!savedProfile) throw new Error('Your saved study profile could not be loaded.');
        setProfile(previous => previous?.id === savedProfile.id && previous.displayName === savedProfile.displayName && previous.avatar === savedProfile.avatar ? previous : savedProfile);
        // A removed last-page item must not strand the directory on an empty page.
        if (!list.nooks.length && requestedPage.offset > 0) {
          page.current = { ...requestedPage, offset: Math.max(0, requestedPage.offset - 50) };
          generation.current++; pending.current = true;
          setDirectory({ ...page.current, hasMore: false }); return;
        }
        setNooks(list.nooks);
        setDirectory({ ...requestedPage, hasMore: list.hasMore === true });
        if (nookId) {
          // A remembered identifier is a hint, never permission to rejoin. Read
          // membership first; the heartbeat independently rechecks it in SQL.
          const detail = await callTool('nook_snapshot', { nookId });
          if (!current()) return;
          requireOwner(detail, expectedOwner);
          if (detail.nook?.id !== nookId || detail.nook.joined !== true || !Array.isArray(detail.members) || !Array.isArray(detail.leaderboard)) throw new Error('This nook could not be loaded.');
          if (document.hidden) return;
          const presence = await callTool('nook_presence', { nookId });
          if (!current()) return;
          requireOwner(presence, expectedOwner);
          setSnapshot(detail as LiveSnapshot); setSelectedId(nookId);
          rememberSelection(expectedOwner, nookId);
        } else setSnapshot(null);
        if (current()) { setError(null); setUpdatedAt(Date.now()); }
      } catch (cause) {
        if (current()) {
          setSnapshot(null);
          const code = (cause as { code?: string })?.code;
          if (code === 'FORBIDDEN' || code === 'ACCOUNT_CHANGED' || code === 'AUTH_REQUIRED') {
            active.current = undefined; setSelectedId(undefined); rememberSelection(expectedOwner);
          }
          if (code === 'ACCOUNT_CHANGED' || code === 'AUTH_REQUIRED') { setProfile(undefined); setNooks([]); live.current = false; }
          setError(cause instanceof Error ? cause.message : 'Your study nook could not refresh.');
        }
      } finally {
        flight.current = null;
        if (mounted.current) setLoading(false);
        if (pending.current && mounted.current && live.current && !document.hidden) {
          pending.current = false; queueMicrotask(() => { void refreshRef.current(); });
        }
      }
    })();
    flight.current = request; return request;
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true; live.current = connected; generation.current++; owner.current = scope;
    active.current = connected && scope ? nookIdValue(activeNookId) ?? rememberedSelection(scope) : undefined;
    page.current = { offset: 0, joinedOnly: false }; setDirectory({ ...page.current, hasMore: false });
    setSelectedId(undefined); setProfile(undefined); setNooks([]); setSnapshot(null); setError(null); setUpdatedAt(null);
    if (connected) void refresh();
    const onVisible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(onVisible, 20_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted.current = false; live.current = false; generation.current++; pending.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [connected, scope, refresh]);

  useEffect(() => {
    // A focus session arriving after workspace hydration may supply recovery.
    // Finishing that session must not deselect a lobby the user is still in.
    const candidate = nookIdValue(activeNookId);
    if (!connected || active.current || !candidate) return;
    active.current = candidate; generation.current++; setSnapshot(null); void refresh();
  }, [activeNookId, connected, refresh]);

  const select = useCallback((nookId?: string) => {
    if (!live.current || (nookId && !nookIdValue(nookId))) return;
    if (!nookId && owner.current) rememberSelection(owner.current);
    if (active.current !== nookId) { active.current = nookId; generation.current++; setSelectedId(undefined); setSnapshot(null); }
    void refresh();
  }, [refresh]);

  const browse = useCallback((offset: number, joinedOnly = page.current.joinedOnly) => {
    if (actionBusy.current || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return;
    page.current = { offset, joinedOnly }; generation.current++;
    setDirectory({ ...page.current, hasMore: false }); setNooks([]); void refresh();
  }, [refresh]);

  const runAction = useCallback(async (name: string, args: object, apply?: (result: Record<string, any>) => void) => {
    if (!live.current) throw new Error('Connect the production Nooks backend to use community features.');
    if (actionBusy.current) throw new Error('Please wait for your current study nook action.');
    actionBusy.current = true; generation.current++; const stamp = generation.current, expectedOwner = owner.current!;
    setBusy(true); setError(null);
    try {
      const result = await callTool(name, args);
      if (!mounted.current || !live.current || stamp !== generation.current) throw new Error('The study view changed. Refresh to see the saved result.');
      requireOwner(result, expectedOwner);
      apply?.(result); await refresh(); return result;
    } catch (cause) {
      if (mounted.current && live.current && stamp === generation.current && expectedOwner === owner.current) setError(cause instanceof Error ? cause.message : 'This action could not be completed.');
      throw cause;
    } finally { actionBusy.current = false; if (mounted.current) setBusy(false); }
  }, [refresh]);

  const join = useCallback(async (nookId: string) => runAction('nook_join', { nookId }, () => {
    active.current = nookId; setSelectedId(nookId); setSnapshot(null);
    setNooks(items => items.map(item => item.id === nookId ? { ...item, joined: true } : item));
  }), [runAction]);
  const leave = useCallback(async (nookId: string) => runAction('nook_leave', { nookId }, () => {
    if (active.current === nookId) { active.current = undefined; setSelectedId(undefined); setSnapshot(null); if (owner.current) rememberSelection(owner.current); }
  }), [runAction]);
  const archive = useCallback(async (nookId: string) => runAction('nook_archive', { nookId }, result => {
    if (result.archived !== true) throw new Error('This nook could not be archived.');
    if (active.current === nookId) { active.current = undefined; setSelectedId(undefined); setSnapshot(null); if (owner.current) rememberSelection(owner.current); }
    setNooks(items => items.filter(item => item.id !== nookId));
  }), [runAction]);
  const listInvites = useCallback(async (nookId: string, offset = 0): Promise<LiveInvitePage> => {
    const stamp = generation.current, expectedOwner = owner.current!;
    if (!live.current || !mounted.current) throw new Error('Connect your study account to review invitations.');
    const result = await callTool('nook_invites_list', { nookId, offset, limit: 50 });
    if (!mounted.current || !live.current || stamp !== generation.current) throw new Error('The study view changed. Refresh invitations.');
    requireOwner(result, expectedOwner);
    if (!Array.isArray(result.invites)) throw new Error('Invitations could not be loaded.');
    return result as LiveInvitePage;
  }, []);
  const revokeInvite = useCallback(async (nookId: string, inviteId: string) => runAction('nook_invite_revoke', { nookId, inviteId }, result => { if (result.revoked !== true) throw new Error('This invitation is unavailable. Refresh its current status.'); }), [runAction]);
  const updateProfile = useCallback(async (displayName: string, avatar: number) => runAction('profile_update', { displayName, avatar }, result => { const saved = verifiedProfile(result.profile, owner.current!); if (!saved) throw new Error('Your saved profile could not be verified.'); setProfile(saved); }), [runAction]);
  const create = useCallback(async (input: CreateLiveNook) => runAction('nook_create', input, result => { if (result.nook?.id) { active.current = result.nook.id; setSelectedId(result.nook.id); setSnapshot(null); } }), [runAction]);
  const createInvite = useCallback(async (nookId: string) => {
    const result = await runAction('nook_invite_create', { nookId, expiresInHours: 24, maxUses: 1 });
    if (!result.invite?.token) throw new Error('An invitation could not be created.');
    return result.invite as LiveInvite;
  }, [runAction]);
  const updateVisibility = useCallback(async (nookId: string, visibility: 'public' | 'private') => runAction('nook_visibility_update', { nookId, visibility }, result => {
    if (result.nook?.id !== nookId || result.nook.visibility !== visibility || result.nook.role !== 'owner') throw new Error('The saved nook privacy could not be verified.');
    setSnapshot(previous => previous?.nook.id === nookId ? { ...previous, nook: result.nook } : previous);
    setNooks(items => items.map(item => item.id === nookId ? result.nook : item));
  }), [runAction]);
  const acceptInvite = useCallback(async (token: string) => runAction('nook_invite_accept', { token }, result => { if (result.nookId) { active.current = result.nookId; setSelectedId(result.nookId); setSnapshot(null); } }), [runAction]);
  const visible = connected && scope === owner.current;
  return { enabled: connected, directory, browse, archive, listInvites, revokeInvite, nooks: visible ? nooks : [], snapshot: visible ? snapshot : null, profile: visible ? profile : undefined, activeNookId: visible ? selectedId : undefined, loading, busy, error, updatedAt, refresh, select, join, leave, updateVisibility, updateProfile, create, createInvite, acceptInvite };
}
export type LiveNooksState = ReturnType<typeof useLiveNooks>;
