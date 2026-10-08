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
export function getAmbiencePreset(roomId: string) { return Object.hasOwn(ambiencePresets, roomId) ? ambiencePresets[roomId] : undefined; }
export function defaultAmbience(roomId: string): Preferences {
  return { levels: { ...(getAmbiencePreset(roomId)?.levels ?? { rain: 0, brown: 0, fire: 0, warm: 0 }) }, master: .45, local: .35 };
}
export function ambienceKey(roomId: string): string { return `nooks:ambience:v2:${encodeURIComponent(roomId)}`; }
export function loadAmbience(roomId: string, storage: Pick<Storage, 'getItem'>): Preferences {
  const defaults = defaultAmbience(roomId);
  try {
    const raw = storage.getItem(ambienceKey(roomId));
    const stored = JSON.parse(raw ?? 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaults;
    // Older releases automatically cached the global mix for every visited nook.
    // Ignore those uncustomized defaults so rain/fire don't leak into unrelated scenes.
    let legacy: { levels?: Levels } | null = null;
    try { legacy = JSON.parse(storage.getItem('notable:ambient-levels:v1') || 'null'); } catch { /* Ignore corrupt legacy settings. */ }
    const generic: Levels = { rain: .38, brown: .12, fire: .2, warm: .16 };
    if (!getAmbiencePreset(roomId) && !stored.customized && [generic, legacy?.levels].some(levels => levels && (Object.keys(generic) as Channel[]).every(key => stored.levels?.[key] === levels[key]))) return defaults;
    return {
      master: stored.master === undefined ? defaults.master : safeVolume(stored.master),
      local: stored.local === undefined ? defaults.local : safeVolume(stored.local),
      levels: Object.fromEntries(Object.keys(defaults.levels).map(key => [key,
        stored.levels?.[key] === undefined ? defaults.levels[key as Channel] : safeVolume(stored.levels[key])])) as Levels,
    };
  } catch { return defaults; }
}
