export interface OpeningHistory { hasSeen: (scope: string, version: string) => boolean; markSeen: (scope: string, version: string) => void }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const scopePattern = /^(?:device|account:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export function openingHistoryKey(scope: string | undefined, version: string) {
  return scope && scopePattern.test(scope) && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(version) ? `nooks:opening:v1:${scope.toLowerCase()}:${version}` : undefined;
}

/** One small seen marker per owner/version, with a session fallback if storage is blocked. */
export function createOpeningHistory(storage: () => StorageLike | undefined = () => window.localStorage): OpeningHistory {
  const memory = new Set<string>();
  return {
    hasSeen(scope, version) {
      const key = openingHistoryKey(scope, version); if (!key) return true;
      if (memory.has(key)) return true;
      try { return storage()?.getItem(key) === '1'; } catch { return false; }
    },
    markSeen(scope, version) {
      const key = openingHistoryKey(scope, version); if (!key) return;
      if (memory.size >= 128) memory.delete(memory.values().next().value!);
      memory.add(key);
      try { storage()?.setItem(key, '1'); } catch { /* The current session still remembers. */ }
    },
  };
}
