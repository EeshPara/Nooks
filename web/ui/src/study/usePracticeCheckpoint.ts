import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { callTool, isPublicPreview } from '../bridge';
import { nooksAccount } from '../account/client';
import type { Artifact } from './types';
import { createPendingStudyStore } from './pendingStudyStore';
import { validPracticeCheckpoint } from './practiceCheckpointValidation';
import { getNativeRecoveryScope } from './studyRecoveryScope';

export interface PracticeCheckpoint<State = Record<string, unknown>> {
  version: 1;
  kind: 'flashcards' | 'quiz' | 'exam';
  artifactRevision: number;
  sessionId: string;
  roomId?: string;
  elapsedSeconds: number;
  state: State;
}

// A remounted study surface waits for its last pending write before restoring.
const writes = new Map<string, Promise<unknown>>();
const scope = () => isPublicPreview ? nooksAccount.getSnapshot().workspaceKey : getNativeRecoveryScope() ?? 'host';

export function usePracticeClock(section: RefObject<HTMLElement | null>, stopped: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (stopped) return;
    let previous = Date.now();
    const tick = () => {
      const now = Date.now();
      const delta = Math.min(5, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (!document.hidden && section.current && !section.current.closest('[hidden], [aria-hidden="true"]')) setSeconds(value => value + delta);
    };
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [section, stopped]);
  return { seconds: Math.floor(seconds), restore: setSeconds };
}

/** Server-owned checkpoints contain answers/positions, never completed practice awards. */
export function usePracticeCheckpoint<State>(artifact: Artifact, snapshot: PracticeCheckpoint<State>, onRestore: (saved: PracticeCheckpoint<State>) => void, section?: RefObject<HTMLElement | null>, enabled = true) {
  const workspaceScope = useRef(scope()).current;
  const key = `${workspaceScope}:${artifact.id}`;
  const recovery = useRef(createPendingStudyStore(workspaceScope, 'checkpoints')).current;
  const recoveryKey = `${artifact.id}:${artifact.revision ?? 1}`;
  const [ready, setReady] = useState(!enabled);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const latest = useRef(snapshot);
  const restore = useRef(onRestore);
  const loaded = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<PracticeCheckpoint<State> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastScheduled = useRef('');
  latest.current = snapshot;
  restore.current = onRestore;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (!enabled) { pending.current = null; return; }
    const value = pending.current;
    if (!value || scope() !== workspaceScope) return;
    recovery.retain(recoveryKey, value);
    pending.current = null;
    if (mounted.current) setSaving(true);
    const prior = writes.get(key);
    const writing = (async () => {
      await prior?.catch(() => {});
      if (scope() !== workspaceScope) return;
      await callTool('practice_checkpoint_save', { artifactId: artifact.id, checkpoint: value });
      recovery.acknowledge(recoveryKey, value);
    })();
    writes.set(key, writing);
    try {
      await writing;
      if (mounted.current) setError('');
    } catch (reason) {
      // Preserve the latest state for an explicit retry. No fallback to a different account/device.
      if (!pending.current) pending.current = latest.current;
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Practice position couldn’t be saved. Retry before leaving.');
    } finally {
      if (writes.get(key) === writing) writes.delete(key);
      if (mounted.current && !writes.has(key)) setSaving(false);
    }
  }, [artifact.id, key, workspaceScope, enabled, recovery, recoveryKey]);

  const load = useCallback(async () => {
    setError('');
    if (!enabled) { loaded.current = false; setReady(true); return; }
    try {
      await writes.get(key)?.catch(() => {});
      if (scope() !== workspaceScope) return;
      const result = await callTool('practice_checkpoint_get', { artifactId: artifact.id });
      if (!mounted.current || scope() !== workspaceScope) return;
      const retained = recovery.get(recoveryKey) as PracticeCheckpoint<State> | undefined;
      // A failed write from an earlier mount contains the student's newest answers.
      // Server checkpoints are permission-checked before any recovery is shown.
      if (retained && validPracticeCheckpoint(retained, artifact)) {
        restore.current(retained);
        pending.current = retained;
        setError('Your unfinished practice was recovered from this tab. Retry to save it.');
      } else if (result.checkpoint) {
        if (!validPracticeCheckpoint(result.checkpoint, artifact)) throw new Error('Your saved practice position could not be read safely. Your existing answers have been preserved.');
        restore.current(result.checkpoint as PracticeCheckpoint<State>);
      }
      loaded.current = true;
      setReady(true);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Your practice position couldn’t be restored. Retry to continue.');
    }
  }, [artifact.id, artifact.kind, artifact.revision, key, workspaceScope, enabled, recovery, recoveryKey]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); if (loaded.current) { pending.current = latest.current; void flush(); } };
  }, [flush, load]);

  // Position changes save promptly; an otherwise idle timer checkpoints every 15 seconds.
  const signature = JSON.stringify({ ...snapshot, elapsedSeconds: Math.floor(snapshot.elapsedSeconds / 15) * 15 });
  useEffect(() => {
    if (!enabled || !ready || signature === lastScheduled.current) return;
    lastScheduled.current = signature;
    pending.current = latest.current;
    if (!recovery.retain(recoveryKey, latest.current)) setError('Tab recovery is full or unavailable. Keep this practice open until it saves.');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 250);
  }, [enabled, ready, signature, flush, recovery, recoveryKey]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const preserve = () => {
      if (!document.hidden && !section?.current?.closest('[hidden], [aria-hidden="true"]')) return;
      pending.current = latest.current;
      void flush();
    };
    const observer = new MutationObserver(preserve);
    let ancestor: HTMLElement | null = section?.current ?? null;
    while (ancestor) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
      ancestor = ancestor.parentElement;
    }
    document.addEventListener('visibilitychange', preserve);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', preserve); };
  }, [enabled, ready, section, flush]);

  useEffect(() => {
    if (!enabled) return;
    const leaving = (event: BeforeUnloadEvent) => {
      if (!pending.current && !writes.has(key)) return;
      void flush();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, [enabled, flush, key]);

  return { ready, error, saving, retry: () => loaded.current ? void flush() : void load(), flush };
}
