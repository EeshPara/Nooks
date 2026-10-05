import type { Artifact } from './types';

export type NoteDraft = { id: string; title: string; content: string };
export type NoteSaveState = {
  draft: NoteDraft; baseline: NoteDraft; artifact: Artifact; persisted: boolean;
  phase: 'saved' | 'pending' | 'saving' | 'error' | 'conflict'; error: string;
};
export const noteDraftOf = (artifact: Artifact): NoteDraft => ({ id: artifact.id, title: artifact.title, content: artifact.content ?? '' });
const same = (a: NoteDraft, b: NoteDraft) => a.id === b.id && a.title === b.title && a.content === b.content;
export const noteIsDirty = (value: NoteSaveState) => !same(value.draft, value.baseline) || (!value.persisted && Boolean(value.draft.content.trim()));
// Clearing an existing document is a real edit. A brand-new empty draft still
// waits for writing before creating a library item.
const valid = (value: NoteSaveState) => Boolean(value.draft.title.trim() && (value.persisted || value.draft.content.trim()));
const revision = (artifact: Artifact) => artifact.revision ?? 1;
const conflict = (reason: unknown) => (reason as { code?: string })?.code === 'REVISION_CONFLICT' || /changed after|revision conflict|reload revision|stale revision/i.test(reason instanceof Error ? reason.message : String(reason));

/** One queue owns the draft and confirmed revision. A failed write always pauses the queue. */
export function createNoteAutosave(artifact: Artifact, persisted: boolean, save: (artifact: Artifact) => Promise<Artifact | void>, delay = 800) {
  let state: NoteSaveState = { draft: noteDraftOf(artifact), baseline: noteDraftOf(artifact), artifact, persisted, phase: 'saved', error: '' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | null = null;
  let deferred: Artifact | null = null;
  let generation = 0;
  let running = false;
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<NoteSaveState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
  const blocked = () => state.phase === 'error' || state.phase === 'conflict';
  const schedule = () => {
    cancelTimer();
    if (running && !inFlight && !blocked() && noteIsDirty(state) && valid(state)) timer = setTimeout(() => { void flush(); }, delay);
  };
  function receive(incoming: Artifact, isSaved = true) {
    if (incoming.id !== state.artifact.id) {
      generation++; cancelTimer(); deferred = null;
      emit({ draft: noteDraftOf(incoming), baseline: noteDraftOf(incoming), artifact: incoming, persisted: isSaved, phase: 'saved', error: '' });
      schedule(); return;
    }
    if (revision(incoming) < revision(state.artifact)) return;
    const next = noteDraftOf(incoming);
    if (same(next, state.baseline)) {
      // Metadata-only changes may advance the version without changing the human draft.
      emit({ artifact: incoming, persisted: state.persisted || isSaved }); return;
    }
    if (inFlight) { deferred = incoming; return; }
    if (same(next, state.draft)) {
      cancelTimer(); emit({ artifact: incoming, baseline: next, persisted: isSaved, phase: 'saved', error: '' }); return;
    }
    if (!noteIsDirty(state)) {
      emit({ artifact: incoming, draft: next, baseline: next, persisted: isSaved, phase: 'saved', error: '' }); return;
    }
    cancelTimer(); emit({ phase: 'conflict', error: 'A newer version is saved. Your writing is still here. Review both versions before continuing.' });
  }
  async function drain(ticket: number) {
    while (running && ticket === generation && noteIsDirty(state) && valid(state) && !blocked()) {
      const snapshot = { ...state.draft, title: state.draft.title.trim() };
      const sent = { ...state.artifact, ...snapshot, updatedAt: new Date().toISOString() };
      const wasPersisted = state.persisted;
      emit({ phase: 'saving', error: '' });
      try {
        const returned = await save(sent);
        if (ticket !== generation) return false;
        // Production supplies the committed artifact. If a legacy callback does not,
        // do not guess the next revision and write again against an unknown version.
        if (!returned || returned.id !== sent.id || !Number.isInteger(returned.revision) || (wasPersisted && revision(returned) <= revision(sent))) {
          emit({ phase: 'error', error: 'The save was sent, but its version was not confirmed. Review the saved note before continuing.' }); return false;
        }
        const stored = noteDraftOf(returned);
        const latest = state.draft;
        const unchanged = latest.content === snapshot.content && latest.title.trim() === snapshot.title;
        emit({ artifact: returned, baseline: stored, draft: unchanged ? stored : latest, persisted: true, phase: unchanged ? 'saved' : 'pending' });
        if (deferred && revision(deferred) > revision(returned)) {
          const update = deferred; deferred = null;
          if (!same(noteDraftOf(update), state.baseline)) {
            emit({ phase: 'conflict', error: 'The saved note changed again. Your writing is preserved; review the latest version.' }); return false;
          }
          emit({ artifact: update });
        }
        deferred = null;
      } catch (reason) {
        if (ticket !== generation) return false;
        emit({ phase: conflict(reason) ? 'conflict' : 'error', error: conflict(reason)
          ? 'A newer version is saved. Your writing is still here. Review both versions before continuing.'
          : 'Could not save. Your writing is still here; retry when you’re ready.' });
        return false;
      }
    }
    return !noteIsDirty(state);
  }
  function flush(): Promise<boolean> {
    cancelTimer();
    if (inFlight) return inFlight;
    if (blocked()) return Promise.resolve(false);
    inFlight = drain(generation).finally(() => { inFlight = null; schedule(); });
    return inFlight;
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { running = true; schedule(); },
    stop: () => { running = false; cancelTimer(); },
    receive,
    /** Restore a scoped browser draft before start; divergent server edits require review. */
    recover: (draft: NoteDraft, baseline: NoteDraft, wasPersisted: boolean) => {
      if (running || inFlight || draft.id !== state.artifact.id || baseline.id !== draft.id) return false;
      if (same(draft, state.baseline)) return false;
      const diverged = !same(baseline, state.baseline) || (wasPersisted && !state.persisted);
      emit({ draft: { ...draft }, phase: diverged ? 'conflict' : 'pending', error: diverged ? 'Recovered writing differs from the saved note. Review both versions before continuing.' : '' });
      return true;
    },
    update: (patch: Partial<Pick<NoteDraft, 'title' | 'content'>>) => {
      const draft = { ...state.draft, ...patch };
      emit({ draft, ...(blocked() ? {} : { phase: inFlight ? 'saving' : 'pending' }) }); schedule();
    },
    flush,
    retry: () => { if (state.phase === 'conflict') return Promise.resolve(false); emit({ phase: 'pending', error: '' }); return flush(); },
    /** Only call after the student explicitly compares the newly read saved version. */
    resolve: (current: Artifact, keepDraft: boolean) => {
      if (inFlight || current.id !== state.artifact.id) return false;
      cancelTimer(); deferred = null;
      emit({ artifact: current, baseline: noteDraftOf(current), draft: keepDraft ? state.draft : noteDraftOf(current), persisted: true, phase: keepDraft ? 'pending' : 'saved', error: '' });
      if (keepDraft) void flush();
      return true;
    },
  };
}
