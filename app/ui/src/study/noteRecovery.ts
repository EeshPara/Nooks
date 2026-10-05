import type { Artifact } from './types';
import type { NoteDraft, NoteSaveState } from './noteAutosave';

type RecoveryEntry = { version: 1; artifact: Artifact; draft: NoteDraft; baseline: NoteDraft; persisted: boolean; capturedAt: string };
const maxNoteCharacters = 300000;
const maxBytes = 2 * 1024 * 1024;
const maxNotes = 24;
const transient = new Map<string, RecoveryEntry[]>();
const scopeKey = (scope?: string) => scope === 'device' || /^account:[A-Za-z0-9_-]{1,128}$/.test(scope || '') ? `nooks:note-recovery:v1:${encodeURIComponent(scope!)}` : null;
const equal = (a: NoteDraft, b: NoteDraft) => a.id === b.id && a.title === b.title && a.content === b.content;
function browserStorage() { try { return sessionStorage; } catch { return undefined; } }
function validDraft(value: unknown, id: string): value is NoteDraft {
 const draft = value as NoteDraft;
 return draft?.id === id && typeof draft.title === 'string' && draft.title.length <= 180 && typeof draft.content === 'string' && draft.content.length <= maxNoteCharacters;
}
function validEntry(value: unknown): value is RecoveryEntry {
 const entry = value as RecoveryEntry;
 return entry?.version === 1 && entry.artifact?.kind === 'note' && typeof entry.artifact.id === 'string' && entry.artifact.id.length <= 128 &&
  typeof entry.persisted === 'boolean' && typeof entry.capturedAt === 'string' && Number.isFinite(Date.parse(entry.capturedAt)) && validDraft(entry.draft, entry.artifact.id) && validDraft(entry.baseline, entry.artifact.id);
}

/** Tab-only recovery, never shared across account scopes or sent to a server automatically. */
export function createNoteRecovery(scope?: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = browserStorage(), memory = transient) {
 const key = scopeKey(scope);
 function read(): RecoveryEntry[] {
  if (!key) return [];
  const cached = memory.get(key); if (cached) return cached;
  let entries: RecoveryEntry[] = [];
  try { const raw = storage?.getItem(key); if (raw && raw.length <= maxBytes) { const value = JSON.parse(raw); if (Array.isArray(value)) entries = value.filter(validEntry).slice(0, maxNotes); } } catch { /* Storage may be blocked; in-document recovery still works. */ }
  memory.set(key, entries); return entries;
 }
 function persist(entries: RecoveryEntry[]) {
  if (!key) return true;
  const raw = JSON.stringify(entries);
  if (entries.length > maxNotes || new TextEncoder().encode(raw).length > maxBytes) return false;
  memory.set(key, entries);
  if (!storage) return false;
  try { if (entries.length) storage.setItem(key, raw); else storage.removeItem(key); return true; } catch { return false; }
 }
 function remove(id: string, acknowledged?: NoteDraft) {
  const current = read();
  // A save from an unmounted editor must not erase a newer editor's writing.
  return persist(current.filter(entry => entry.artifact.id !== id || (acknowledged && !equal(entry.draft, acknowledged))));
 }
 return {
  enabled: Boolean(key && storage),
  get: (id: string) => { const entry = read().find(entry => entry.artifact.id === id); return entry ? structuredClone(entry) : null; },
  list: () => read().sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).map(entry => ({ artifact: { ...entry.artifact, content: entry.baseline.content }, persisted: entry.persisted, updatedAt: entry.capturedAt })),
  remove,
  retain: (state: NoteSaveState) => {
   if (!key) return true; // Native host context has no verified browser-account scope.
   const dirty = !equal(state.draft, state.baseline) || (!state.persisted && Boolean(state.draft.content.trim()));
   if (!dirty) return remove(state.artifact.id, state.draft);
   if (!validDraft(state.draft, state.artifact.id) || !validDraft(state.baseline, state.artifact.id)) return false;
   const entries = read().filter(entry => entry.artifact.id !== state.artifact.id);
   if (entries.length >= maxNotes) return false; // Never evict another unsaved note silently.
   const { content: _content, cards: _cards, questions: _questions, ...metadata } = state.artifact;
   entries.push({ version: 1, artifact: metadata, draft: { ...state.draft }, baseline: { ...state.baseline }, persisted: state.persisted, capturedAt: new Date().toISOString() });
   return persist(entries);
  },
 };
}

export const listRecoverableNotes = (scope?: string) => createNoteRecovery(scope).list();
