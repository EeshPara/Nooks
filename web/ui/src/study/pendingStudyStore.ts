import type { ProgressEvent } from './types';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Envelope = { version: 1; entries: Record<string, unknown> };
const transient = new Map<string, Envelope>();
const maxBytes = 2 * 1024 * 1024;
const verifiedScope = (scope: string) => scope === 'device' || /^account:[A-Za-z0-9_-]{1,128}$/.test(scope);
function browserStorage() { try { return sessionStorage; } catch { return undefined; } }

/** Pending work stays in its originating tab/account. Native hosts use memory only. */
export function createPendingStudyStore(scope: string, category: 'results' | 'checkpoints' | 'editors', storage: StorageLike | undefined = browserStorage(), memory = transient) {
  const key = `nooks:pending-study:v1:${category}:${encodeURIComponent(scope)}`;
  const durable = verifiedScope(scope);
  function read(): Envelope {
    const cached = memory.get(key);
    if (cached) return cached;
    let value: Envelope = { version: 1, entries: {} };
    if (durable && storage) {
      try {
        const raw = storage.getItem(key);
        if (raw && raw.length <= maxBytes) {
          const parsed = JSON.parse(raw);
          if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries)) value = parsed;
        }
      } catch { /* Recovery must not prevent opening the workspace. */ }
    }
    memory.set(key, value);
    return value;
  }
  function persist(value: Envelope) {
    try {
      const raw = JSON.stringify(value);
      if (Object.keys(value.entries).length > 500 || new TextEncoder().encode(raw).length > maxBytes) return false;
      memory.set(key, value);
      if (!durable) return true;
      if (!storage) return false;
      if (Object.keys(value.entries).length) storage.setItem(key, raw);
      else storage.removeItem(key);
      return true;
    } catch { return false; }
  }
  return {
    entries: () => Object.entries(read().entries).map(([id, value]) => [id, structuredClone(value)] as const),
    get: (id: string) => { const entries = read().entries; return Object.hasOwn(entries, id) ? structuredClone(entries[id]) : undefined; },
    retain: (id: string, value: unknown) => persist({ version: 1, entries: { ...read().entries, [id]: structuredClone(value) } }),
    acknowledge: (id: string, value: unknown) => {
      const current = read();
      if (!Object.hasOwn(current.entries, id)) return;
      // A delayed acknowledgement must never erase a newer answer or restart.
      if (JSON.stringify(current.entries[id]) !== JSON.stringify(value)) return;
      const entries = { ...current.entries }; delete entries[id];
      persist({ version: 1, entries });
    },
  };
}

export function isPendingProgress(value: unknown): value is ProgressEvent {
  const event = value as ProgressEvent;
  return !!event && typeof event === 'object' && typeof event.artifactId === 'string' && event.artifactId.length <= 128 &&
    (event.artifactRevision === undefined || Number.isSafeInteger(event.artifactRevision) && event.artifactRevision >= 1) &&
    typeof event.sessionId === 'string' && event.sessionId.length <= 128 && ['flashcards', 'quiz', 'exam', 'match', 'sprint'].includes(event.kind) &&
    Number.isSafeInteger(event.total) && event.total > 0 && Number.isSafeInteger(event.score) && event.score >= 0 && event.score <= event.total &&
    Number.isFinite(event.xp) && event.xp >= 0;
}
