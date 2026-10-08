import rain from './audio/rain-window.mp3?url';
import stove from './audio/stove-fire.mp3?url';
import hearth from './audio/hearth-fire.mp3?url';

import wind from './audio/wind-bed.mp3?url';
import forest from './audio/forest-bed.mp3?url';
import waves from './audio/waves-bed.mp3?url';
import stream from './audio/stream-bed.mp3?url';
import night from './audio/night-bed.mp3?url';
import train from './audio/train-bed.mp3?url';
import room from './audio/room-bed.mp3?url';

// Only selected recordings load on demand from the compiled, trusted asset registry.
export const recordedAmbience = { rain, stove, hearth, wind, forest, waves, stream, night, train, room };
export type RecordingKind = keyof typeof recordedAmbience;
export type SceneBed = Partial<Record<RecordingKind, number>>;
// Ratios describe distance from the desk. Each nook has an explicit sound perspective.
export const sceneSoundBeds: Record<string, SceneBed> = {
  'rainy-library': { room: .3 },
  'howls-moving-study': { wind: .3 },
  'gryffindor-common-room': { room: .3 },
  'neon-tokyo': { room: .65 },
  'alpine-cabin': { wind: .65 },
  'totoro-forest-window': { forest: .75 },
  'slytherin-common-room': { room: .8, stream: .12 },
  'kikis-bakery-attic': { waves: .45, wind: .3 },
  'midnight-train': { train: .9 },
  'hufflepuff-common-room': { forest: .35, room: .35 },
  'ravenclaw-tower': { wind: .7, room: .2 },
  'stardew-farmhouse': { forest: .85 },
  'spirited-bathhouse': { stream: .7, night: .15 },
  'bookshop-cat': { room: .85 },
  'sunlit-greenhouse': { forest: .55 },
  'dragon-hatchery': { wind: .45, room: .25 },
  'velaris-study': { stream: .55, night: .18 },
  'dragon-rider-study': { wind: .65 },
  'hobbit-study': { forest: .65, wind: .2 },
  'animal-crossing-island': { waves: .55, forest: .25 },
  'cinnamoroll-cloud-cafe': { room: .65, wind: .15 },
  'witch-apothecary': { night: .55, room: .25 },
  'kyoto-teahouse': { forest: .45 },
  'oxford-library': { room: .9 },
  'capybara-onsen': { stream: .8, wind: .12 },
  'pokemon-research-cottage': { forest: .8 },
  'sakura-garden': { forest: .5, wind: .3 },
  'paris-attic': { wind: .35, room: .5 },
  'underwater-study': { room: .8, stream: .12 },
  'moonlit-observatory': { wind: .5, room: .3 },
  'frog-pond-studio': { night: .65, stream: .18 },
  'kuromi-midnight-desk': { room: .7, night: .12 },
  'antique-workshop': { room: .8 },
  'minecraft-cottage': { forest: .5 },
  'hateno-study': { forest: .65, wind: .2 },
  'sumeru-akademiya': { forest: .55, wind: .3 },
  'mage-archive': { wind: .4, forest: .35 },
  'cyberpunk-rain-loft': { room: .75 },
  'secret-door-study': { room: .85 },
  'nevermore-study': { room: .65 },
  'autumn-bakery': { room: .6, wind: .2 },
  'seoul-night-cafe': { room: .65 },
  'cloud-cafe': { room: .55, wind: .25 },
  'tiny-mouse-house': { room: .65 },
  'woodland-treehouse': { forest: .7, wind: .2 },
  'aurora-cabin': { wind: .65 },
  'lighthouse-study': { waves: .8, wind: .12 },
  'desert-casita': { stream: .6, wind: .2 },
  'stationery-studio': { room: .9 },
  'thousand-sunny-study': { waves: .7, wind: .2 },
};
export function sceneBed(roomId: string): SceneBed {
  return Object.hasOwn(sceneSoundBeds, roomId) ? sceneSoundBeds[roomId] : {};
}
export function fireVariant(roomId: string): 'stove' | 'hearth' {
  return roomId === 'howls-moving-study' ? 'stove' : 'hearth';
}
export function recordingBytes(dataUrl: string): ArrayBuffer {
  if (!dataUrl.startsWith('data:audio/') || !dataUrl.includes(';base64,')) throw new Error('The nook sound recording is unavailable.');
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** A compiled asset allowlist prevents saved preferences from becoming network URLs. */
export async function loadRecordingBytes(url: string, request: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (!Object.values(recordedAmbience).includes(url)) throw new Error('Unknown nook recording.');
  if (url.startsWith('data:')) return recordingBytes(url);
  const response = await request(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 2_000_000) throw new Error('The nook recording could not load. Try again.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 2_000_000) throw new Error('The nook recording is unavailable.');
  return bytes;
}
