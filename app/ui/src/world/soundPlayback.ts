import { useEffect, useSyncExternalStore } from 'react';

export interface SoundPlayback {
  id: string;
  title: string;
  subtitle: string;
  kind: 'ambient' | 'soundtrack' | 'spotify';
  playing: boolean;
  muted: boolean;
  volume: number;
  busy: boolean;
  error?: string;
  togglePlayback: () => void;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
  stop: () => void;
}

const sources = new Map<string, SoundPlayback>();
const listeners = new Set<() => void>();
let snapshot: readonly SoundPlayback[] = [];
function emit() {
  snapshot = [...sources.values()];
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function getSnapshot() { return snapshot; }

/** Audio remains owned by its player; the island only subscribes to controls. */
export function useSoundPlayback(id: string, source: Omit<SoundPlayback, 'id'> | null) {
  useEffect(() => {
    if (source) { sources.set(id, { ...source, id }); emit(); }
    else if (sources.delete(id)) emit();
  }, [id, source]);
  useEffect(() => () => { if (sources.delete(id)) emit(); }, [id]);
}

export function useSoundSources() { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }
