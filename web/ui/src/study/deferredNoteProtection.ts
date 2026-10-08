import type { Artifact } from './types';
import { noteDraftOf, noteIsDirty } from './noteAutosave';
import type { createNoteRecovery } from './noteRecovery';

/** Protect material handed to a note before its downloaded editor can mount. */
export function protectDeferredNote(artifact: Artifact, saved: boolean, recovery: ReturnType<typeof createNoteRecovery>) {
  const existing = recovery.get(artifact.id);
  const draft = noteDraftOf(artifact);
  const state = existing
    ? { ...existing, phase: 'pending' as const, error: '' }
    : { artifact, draft, baseline: draft, persisted: saved, phase: 'pending' as const, error: '' };
  const dirty = noteIsDirty(state);
  // A recovered draft always wins over the baseline from a stale library item.
  // Existing data may only be in memory after a blocked-storage write. Confirm
  // durability again without replacing its recovered draft with the baseline.
  return { dirty, retained: !dirty || recovery.retain(state) };
}

export function leaveDeferredNote(pendingDirty: boolean, confirm: (message: string) => boolean, onBack: () => void) {
  if (pendingDirty && !confirm('Leave without saving your note changes?')) return;
  onBack();
}
