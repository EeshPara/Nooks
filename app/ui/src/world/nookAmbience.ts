export type Channel = 'rain' | 'brown' | 'fire' | 'warm' | 'scene';
export type Levels = Record<Channel, number>;
export interface Preferences { levels: Levels; master: number; local: number }
export function safeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
// Natural scene beds are independently adjustable; synthetic options are always off by default.
function naturalPreset(label: string, rain: number, fire: number, scene: number) {
  return { label, levels: { rain, fire, scene, brown: 0, warm: 0 } };
}
export const ambiencePresets: Record<string, { label: string; levels: Levels }> = {
  'rainy-library': naturalPreset('Rain against the windows', 0.48, 0, 0),
  'howls-moving-study': naturalPreset('A softly crackling stove', 0, 0.42, 0),
  'gryffindor-common-room': naturalPreset('Fire by the armchair', 0, 0.58, 0),
  'neon-tokyo': naturalPreset('City rain beyond the glass', 0.4, 0, 0.12),
  'alpine-cabin': naturalPreset('A sheltered hearth in the snow', 0, 0.43, 0.13),
  'totoro-forest-window': naturalPreset('Garden rain and a sheltered forest', 0.34, 0, 0.24),
  'slytherin-common-room': naturalPreset('Still stone halls beneath the lake', 0, 0, 0.3),
  'kikis-bakery-attic': naturalPreset('Sea air above the rooftops', 0, 0, 0.34),
  'midnight-train': naturalPreset('A soft carriage rhythm and window rain', 0.2, 0, 0.42),
  'hufflepuff-common-room': naturalPreset('A small hearth and a quiet garden', 0, 0.32, 0.2),
  'ravenclaw-tower': naturalPreset('A little wind around the tower', 0, 0, 0.3),
  'stardew-farmhouse': naturalPreset('Trees outside the farmhouse', 0, 0, 0.36),
  'spirited-bathhouse': naturalPreset('Warm water moving through the courtyard', 0, 0, 0.32),
  'bookshop-cat': naturalPreset('The quiet of a bookshop after closing', 0, 0, 0.28),
  'sunlit-greenhouse': naturalPreset('Rain on glass and leaves', 0.33, 0, 0.18),
  'dragon-hatchery': naturalPreset('Embers beside the sheltered nest', 0, 0.32, 0.16),
  'velaris-study': naturalPreset('A distant river at night', 0, 0, 0.32),
  'dragon-rider-study': naturalPreset('Hearth warmth and mountain air', 0, 0.38, 0.19),
  'hobbit-study': naturalPreset('A gentle breeze through the garden', 0, 0, 0.33),
  'animal-crossing-island': naturalPreset('Soft island surf and trees', 0, 0, 0.33),
  'cinnamoroll-cloud-cafe': naturalPreset('A quiet café above the clouds', 0, 0, 0.25),
  'witch-apothecary': naturalPreset('Night insects beyond the herb shelves', 0, 0, 0.3),
  'kyoto-teahouse': naturalPreset('Garden rain beyond the shoji', 0.4, 0, 0.14),
  'oxford-library': naturalPreset('A hushed stone reading room', 0, 0, 0.24),
  'capybara-onsen': naturalPreset('Soft water beside the warm pool', 0, 0, 0.36),
  'pokemon-research-cottage': naturalPreset('A quiet woodland outside the cottage', 0, 0, 0.35),
  'sakura-garden': naturalPreset('A breeze through the flowering courtyard', 0, 0, 0.32),
  'paris-attic': naturalPreset('Soft air through the balcony door', 0, 0, 0.26),
  'underwater-study': naturalPreset('A hushed observatory beneath the water', 0, 0, 0.28),
  'moonlit-observatory': naturalPreset('Night air outside the dome', 0, 0, 0.25),
  'frog-pond-studio': naturalPreset('A quiet pond and distant night life', 0, 0, 0.29),
  'kuromi-midnight-desk': naturalPreset('A softly sheltered midnight room', 0, 0, 0.22),
  'antique-workshop': naturalPreset('A quiet room above the old shop', 0, 0, 0.26),
  'minecraft-cottage': naturalPreset('Gentle rain around the cottage', 0.36, 0, 0.12),
  'hateno-study': naturalPreset('Grass and leaves beyond the research desk', 0, 0, 0.32),
  'sumeru-akademiya': naturalPreset('A soft breeze through hanging gardens', 0, 0, 0.31),
  'mage-archive': naturalPreset('Meadow air beyond the old books', 0, 0, 0.3),
  'cyberpunk-rain-loft': naturalPreset('Distant rain against the city windows', 0.42, 0, 0.12),
  'secret-door-study': naturalPreset('A sheltered, quiet attic', 0, 0, 0.22),
  'nevermore-study': naturalPreset('A hushed room and distant window rain', 0.24, 0, 0.16),
  'autumn-bakery': naturalPreset('A quiet bakery with trees outside', 0, 0, 0.26),
  'seoul-night-cafe': naturalPreset('Soft city rain outside the café', 0.31, 0, 0.18),
  'cloud-cafe': naturalPreset('Soft air around a quiet sky café', 0, 0, 0.25),
  'tiny-mouse-house': naturalPreset('A tiny hearth among the books', 0, 0.28, 0.12),
  'woodland-treehouse': naturalPreset('Leaves moving around the treehouse', 0, 0, 0.36),
  'aurora-cabin': naturalPreset('A low hearth and sheltered winter wind', 0, 0.32, 0.15),
  'lighthouse-study': naturalPreset('Long waves below the lighthouse', 0, 0, 0.38),
  'desert-casita': naturalPreset('A shaded fountain and quiet courtyard', 0, 0, 0.29),
  'stationery-studio': naturalPreset('The hush of a small writing room', 0, 0, 0.24),
  'thousand-sunny-study': naturalPreset('Gentle water alongside the ship', 0, 0, 0.36),
};
export function getAmbiencePreset(roomId: string) { return Object.hasOwn(ambiencePresets, roomId) ? ambiencePresets[roomId] : undefined; }
export function defaultAmbience(roomId: string): Preferences {
  return { levels: { ...(getAmbiencePreset(roomId)?.levels ?? { rain: 0, brown: 0, fire: 0, warm: 0, scene: 0 }) }, master: .45, local: .35 };
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
    const generic = { rain: .38, brown: .12, fire: .2, warm: .16 };
    if (!stored.customized && [generic, legacy?.levels].some(levels => levels && (Object.keys(generic) as (keyof typeof generic)[]).every(key => stored.levels?.[key] === levels[key]))) return defaults;
    return {
      master: stored.master === undefined ? defaults.master : safeVolume(stored.master),
      local: stored.local === undefined ? defaults.local : safeVolume(stored.local),
      levels: Object.fromEntries(Object.keys(defaults.levels).map(key => [key,
        stored.levels?.[key] === undefined ? (key === 'scene' && stored.levels ? 0 : defaults.levels[key as Channel]) : safeVolume(stored.levels[key])])) as Levels,
    };
  } catch { return defaults; }
}
