import { useCallback, useEffect, useRef, useState } from 'react';
import { createOpeningHistory, openingHistoryKey } from './openingFilmHistory';

export type OpeningDismissReason = 'enter' | 'close' | 'outside' | 'escape' | 'finished';
const history = createOpeningHistory();
type Presentation = { key: string; id: number; mode: 'first-visit' | 'replay' };

/** The parent decides whether this is a clean first visit; existing work never opts in implicitly. */
export function useOpeningFilm({ scopeKey, version = 'journey-v1', eligible = false, safeToOpen = false }: { scopeKey?: string; version?: string; eligible?: boolean; safeToOpen?: boolean }) {
  const key = openingHistoryKey(scopeKey, version);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const serial = useRef(0);
  const latest = useRef({ key, scopeKey, version, safeToOpen }); latest.current = { key, scopeKey, version, safeToOpen };
  useEffect(() => {
    if (!key || !scopeKey || !eligible || !safeToOpen || history.hasSeen(scopeKey, version)) return;
    // Seeing the opening once is enough. Closing early must not replay it on reload.
    history.markSeen(scopeKey, version);
    setPresentation({ key, id: ++serial.current, mode: 'first-visit' });
  }, [key, scopeKey, version, eligible, safeToOpen]);
  useEffect(() => {
    // A chat-driven note or another active task wins over the opening. Once
    // interrupted, it stays dismissed instead of resurfacing when work closes.
    if (!safeToOpen) setPresentation(null);
  }, [safeToOpen]);
  const replay = useCallback(() => {
    const selected = latest.current;
    if (!selected.key || !selected.scopeKey || !selected.safeToOpen) return false;
    history.markSeen(selected.scopeKey, selected.version);
    setPresentation({ key: selected.key, id: ++serial.current, mode: 'replay' });
    return true;
  }, []);
  const dismiss = useCallback((_reason?: OpeningDismissReason) => setPresentation(null), []);
  const current = key && presentation?.key === key ? presentation : null;
  return { open: safeToOpen && !!current, mode: current?.mode, presentationId: current?.id, replay, dismiss };
}
