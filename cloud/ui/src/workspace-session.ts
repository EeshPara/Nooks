import { useEffect, useRef } from 'react';
import { callTool, isEmbedded, setWorkspaceSessionContext } from './bridge';
import { readCompleteMaterial } from './study/readMaterial';
import { readWorkspaceView } from './workspace-navigation';
import type { Artifact } from './study/types';

export type Presentation = { artifactId?: string; view?: string; alongsideArtifactId?: string };
export type PresentedData = { artifact?: Artifact; alongsideArtifact?: Artifact; unsaved?: false; navigation?: { view: string }; workspace?: Record<string, any>; recoveryScope?: string };
type PresentOutcome = { status: 'presented' | 'queued' };
type SessionReply = Record<string, any>;
type SessionOptions = {
  initialSessionId: string;
  call: (name: string, args: Record<string, unknown>) => Promise<SessionReply>;
  read: (id: string) => Promise<Artifact>;
  refresh?: () => Promise<SessionReply>;
  onPresent: (data: PresentedData) => 'presented' | 'queued';
  setContext: (id: string | null) => void;
  onSessionIdChange?: (id: string) => void;
  canPresent?: () => boolean;
  hidden?: () => boolean;
  now?: () => number;
  uuid?: () => string;
  random?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};
const navigationError = (message: string, code: string) => Object.assign(new Error(message), { code });
const isRecord = (value: unknown): value is SessionReply => !!value && typeof value === 'object' && !Array.isArray(value);

/** Fetch only explicitly selected saved items. IDs and permissions are checked by the server. */
export async function loadPresentation(target: Presentation, read: (id: string) => Promise<Artifact>): Promise<PresentedData> {
  if (!isRecord(target)) throw new Error('Choose a study item or workspace view.');
  const view = readWorkspaceView(target.view);
  if (view && !target.artifactId && !target.alongsideArtifactId) return { navigation: { view } };
  if (!target.artifactId || target.view) throw new Error('Choose a study item or workspace view.');
  const artifact = await read(target.artifactId);
  if (artifact?.id !== target.artifactId || !['note', 'flashcards', 'quiz', 'exam'].includes(artifact.kind)) throw new Error('This saved study item could not be opened.');
  const alongsideArtifact = target.alongsideArtifactId ? await read(target.alongsideArtifactId) : undefined;
  if (target.alongsideArtifactId && alongsideArtifact?.id !== target.alongsideArtifactId) throw new Error('The saved reference note could not be opened.');
  if (alongsideArtifact && (alongsideArtifact.kind !== 'note' || artifact.kind === 'note')) throw new Error('A reference note can sit beside flashcards, a quiz, or an exam.');
  return { artifact, ...(alongsideArtifact ? { alongsideArtifact } : {}), unsaved: false };
}

/** A completion-scheduled channel: no overlapping polls, writes only on registration/renewal. */
export function createWorkspaceSessionController(options: SessionOptions) {
  const now = options.now ?? Date.now;
  const hidden = options.hidden ?? (() => false);
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const random = options.random ?? Math.random;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? (timer => clearTimeout(timer));
  let sessionId = options.initialSessionId, active = false, disposed = false, registered = false;
  let sequence = 0, renewedAt = 0, failures = 0, requestVersion = 0, nextAllowedAt = 0, quietPolls = 0;
  let busy = false, timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) { clearTimer(timer); timer = undefined; } };
  const schedule = (delay: number) => { clear(); if (active) timer = setTimer(() => { timer = undefined; void tick(); }, delay); };
  const requireActive = () => { if (!active) throw navigationError('This Nooks view has closed.', 'APP_CLOSED'); };
  const requireEditable = () => { if (options.canPresent?.() === false) throw navigationError('Finish or close the study-set editor before changing this view. Your edits are still open.', 'EDITOR_BUSY'); };
  const validReply = (reply: SessionReply) => {
    if (!isRecord(reply) || reply.sessionId !== sessionId || !Number.isSafeInteger(reply.sequence) || reply.sequence < 0 ||
        typeof reply.expiresAt !== 'string' || !Number.isFinite(Date.parse(reply.expiresAt))) {
      throw navigationError('Nooks received an invalid tab session response.', 'INVALID_SESSION');
    }
  };
  async function present(target: Presentation): Promise<PresentOutcome> {
    requireActive();
    requireEditable();
    quietPolls = 0;
    const version = ++requestVersion;
    const data = await loadPresentation(target, async id => {
      requireActive();
      const artifact = await options.read(id);
      requireActive();
      if (version !== requestVersion) throw navigationError('A newer view was selected.', 'SUPERSEDED');
      return artifact;
    });
    requireActive();
    if (version !== requestVersion) throw navigationError('A newer view was selected.', 'SUPERSEDED');
    if (data.navigation && options.refresh) {
      // Chat-side timer/task mutations are not broadcast to every mounted view.
      // Refresh once for this explicit destination, never on an unchanged poll.
      const refreshed = await options.refresh();
      requireActive();
      if (version !== requestVersion) throw navigationError('A newer view was selected.', 'SUPERSEDED');
      if (!isRecord(refreshed.workspace) || !Array.isArray(refreshed.workspace.artifacts)) throw new Error('Your latest study workspace could not be loaded.');
      data.workspace = refreshed.workspace;
      if (typeof refreshed.recoveryScope === 'string') data.recoveryScope = refreshed.recoveryScope;
    }
    requireEditable();
    return { status: options.onPresent(data) };
  }
  async function tick() {
    if (!active || busy) return;
    if (now() < nextAllowedAt) { schedule(nextAllowedAt - now()); return; }
    busy = true;
    let delay = 2500;
    try {
      if (hidden()) { delay = 30_000; return; }
      if (!registered || now() - renewedAt >= 5 * 60_000) {
        const opened = await options.call('workspace_session_open', { sessionId });
        if (!active) return;
        validReply(opened);
        if (registered && opened.sequence < sequence) throw navigationError('Nooks received an older session cursor.', 'INVALID_SESSION');
        // New mounts start at the current cursor; renewing an existing view retains pending commands.
        if (!registered) sequence = opened.sequence;
        registered = true; renewedAt = now();
        options.setContext(sessionId);
      }
      const pollVersion = requestVersion;
      const result = await options.call('workspace_session_poll', { sessionId, afterSequence: sequence });
      if (!active) return;
      validReply(result);
      if (result.sequence < sequence) throw navigationError('Nooks received an older session cursor.', 'INVALID_SESSION');
      if (result.sequence > sequence) {
        quietPolls = 0;
        if (!isRecord(result.command) || result.command.sequence !== result.sequence) throw navigationError('Nooks received an incomplete navigation command.', 'INVALID_SESSION');
        // A direct app action arriving during this poll is newer than its response.
        if (pollVersion === requestVersion) {
          try { await present(result.command); }
          catch (error) { if ((error as { code?: string }).code !== 'SUPERSEDED') throw error; }
        }
        if (!active) return;
        // Failed reads retry. Successfully presented or queued commands are consumed once.
        sequence = result.sequence;
      } else quietPolls++;
      failures = 0;
      nextAllowedAt = 0;
      // The direct app tool presents immediately. Its server fallback stays within
      // five seconds while a quiet visible view halves its steady polling load.
      delay = quietPolls >= 3 ? 5000 : 2500;
    } catch (error) {
      if (!active) return;
      failures++;
      const details = error as { code?: string; retryAfter?: number };
      if (details.code === 'SESSION_EXPIRED') {
        registered = false; sequence = 0; requestVersion++;
        sessionId = uuid();
        options.onSessionIdChange?.(sessionId);
        options.setContext(null);
      }
      const retryAfter = typeof details.retryAfter === 'number' && Number.isFinite(details.retryAfter) ? Math.min(300_000, Math.max(0, details.retryAfter * 1000)) : 0;
      delay = Math.max(retryAfter, Math.min(30_000, 3000 * 2 ** Math.min(failures, 4)));
      nextAllowedAt = now() + delay;
    } finally {
      busy = false;
      if (active) schedule(hidden() ? Math.max(30_000, delay) : delay + Math.floor(Math.max(0, Math.min(1, random())) * 250));
    }
  }
  return {
    present,
    start() { if (active || disposed) return; active = true; void tick(); },
    wake() { if (!active || hidden() || busy) return; quietPolls = 0; clear(); void tick(); },
    stop() { if (disposed) return; disposed = true; active = false; requestVersion++; clear(); options.setContext(null); },
  };
}

/** One mounted app gets one destination. Its host teardown invalidates every pending read. */
export function useWorkspaceSession(onPresent: (data: PresentedData) => 'presented' | 'queued') {
  const sessionId = useRef<string | null>(null);
  if (sessionId.current === null) sessionId.current = crypto.randomUUID();
  const callback = useRef(onPresent); callback.current = onPresent;
  const controller = useRef<ReturnType<typeof createWorkspaceSessionController> | null>(null);
  useEffect(() => {
    if (!isEmbedded) return;
    const current = createWorkspaceSessionController({
      initialSessionId: sessionId.current!, call: callTool,
      read: id => readCompleteMaterial(id, (artifactId, offset) => callTool('artifact_get', { artifactId, offset, maxChars: 40000, limit: 50 })),
      refresh: () => callTool('workspace_get'),
      onPresent: data => callback.current(data), setContext: setWorkspaceSessionContext,
      onSessionIdChange: id => { sessionId.current = id; },
      canPresent: () => !document.querySelector('.study-editor'), hidden: () => document.hidden,
    });
    controller.current = current;
    const wake = () => current.wake();
    const teardown = () => { current.stop(); if (controller.current === current) controller.current = null; };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('notable:teardown', teardown);
    current.start();
    return () => { teardown(); document.removeEventListener('visibilitychange', wake); window.removeEventListener('notable:teardown', teardown); };
  }, []);
  return async (target: Presentation): Promise<PresentOutcome> => {
    if (!controller.current) throw navigationError('This Nooks view is not connected.', 'APP_CLOSED');
    return controller.current.present(target);
  };
}
