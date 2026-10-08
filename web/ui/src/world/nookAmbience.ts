export type Channel = 'rain' | 'brown' | 'fire' | 'warm';
export type Levels = Record<Channel, number>;
export interface Preferences { levels: Levels; master: number; local: number }
export function safeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
export const ambiencePresets: Record<string, { label: string; levels: Levels }> = {
  'rainy-library': { label: 'Rain against the windows', levels: { rain: .48, brown: 0, fire: 0, warm: 0 } },
  'howls-moving-study': { label: 'A softly crackling stove', levels: { rain: 0, brown: 0, fire: .42, warm: 0 } },
  'gryffindor-common-room': { label: 'Fire by the armchair', levels: { rain: 0, brown: 0, fire: .58, warm: 0 } },
};
export function defaultAmbience(roomId: string): Preferences {
  return { levels: { ...(ambiencePresets[roomId]?.levels ?? { rain: .38, brown: .12, fire: .2, warm: .16 }) }, master: .45, local: .35 };
}
export function ambienceKey(roomId: string): string { return `nooks:ambience:v2:${encodeURIComponent(roomId)}`; }
export function loadAmbience(roomId: string, storage: Pick<Storage, 'getItem'>): Preferences {
  const defaults = defaultAmbience(roomId);
  try {
    const raw = storage.getItem(ambienceKey(roomId));
    // Keep prior mixes for other nooks; the three pilot nooks start with their matching soundscape.
    const stored = JSON.parse(raw ?? (ambiencePresets[roomId] ? 'null' : storage.getItem('notable:ambient-levels:v1') ?? 'null'));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaults;
    return {
      master: stored.master === undefined ? defaults.master : safeVolume(stored.master),
      local: stored.local === undefined ? defaults.local : safeVolume(stored.local),
      levels: Object.fromEntries(Object.keys(defaults.levels).map(key => [key,
        stored.levels?.[key] === undefined ? defaults.levels[key as Channel] : safeVolume(stored.levels[key])])) as Levels,
    };
  } catch { return defaults; }
}
