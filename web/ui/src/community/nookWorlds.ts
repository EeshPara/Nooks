import { allRoomScenes, type RoomCategory } from '../personalization/types';

export type NookWorldRoom = { roomId: string; title: string; minutes: number };
export type NookWorld = {
  id: string; title: string; description: string; category: RoomCategory;
  coverRoomId: string; rooms: NookWorldRoom[]; progression: boolean;
};
export type RoomFocusProgress = Readonly<Record<string, { focusSeconds?: number } | undefined>>;
export type WorldMilestone =
  | { kind: 'item'; id: string; title: string; minutes: number; art: string; description: string }
  | { kind: 'room'; roomId: string; title: string; minutes: number };
function world(id: string, title: string, description: string, category: RoomCategory, ids: string[], progression = false): NookWorld {
  return { id, title, description, category, coverRoomId: ids[0], progression, rooms: ids.map(roomId => {
    const scene = allRoomScenes.find(room => room.id === roomId);
    if (!scene) throw new Error(`Unknown world room: ${roomId}`);
    return { roomId, title: progression ? scene.title.replace('Hogwarts — ', '') : scene.title, minutes: progression ? roomId === 'castle-study' ? 45 : roomId === 'moonlit-observatory' ? 120 : 0 : 0 };
  }) };
}
/** All50 curated scenes appear once; existing castle artwork extends Hogwarts. */
export const nookWorlds: NookWorld[] = [
  world('hogwarts', 'Hogwarts', 'Choose your common room, then study toward more castle hideaways.', 'elsewhere', ['gryffindor-common-room', 'slytherin-common-room', 'hufflepuff-common-room', 'ravenclaw-tower', 'castle-study', 'moonlit-observatory'], true),
  world('ghibli', 'Ghibli corners', 'Quiet little studies among familiar animated worlds.', 'elsewhere', ['howls-moving-study', 'totoro-forest-window', 'kikis-bakery-attic', 'spirited-bathhouse', 'antique-workshop']),
  world('cozy-games', 'Cozy game worlds', 'Return to a favorite cottage, island, or village desk.', 'elsewhere', ['stardew-farmhouse', 'animal-crossing-island', 'pokemon-research-cottage', 'minecraft-cottage', 'hateno-study']),
  world('dragon-realms', 'Dragon realms', 'Warm hearths, mountain academies, and a little dragon magic.', 'elsewhere', ['dragon-hatchery', 'dragon-rider-study', 'velaris-study']),
  world('fantasy-lands', 'Fantasy lands', 'A chapter among hillside homes, scholars, and spellbooks.', 'elsewhere', ['hobbit-study', 'sumeru-akademiya', 'mage-archive']),
  world('witch-apothecary', 'The apothecary', 'Herbs, glass bottles, and a moonlit place to think.', 'elsewhere', ['witch-apothecary']),
  world('dark-academia', 'Dark academia', 'Old colleges and mysterious rooms for your next chapter.', 'cozy', ['oxford-library', 'nevermore-study', 'secret-door-study']),
  world('city-nights', 'City nights', 'Find a warm desk above the rain and neon.', 'city', ['neon-tokyo', 'cyberpunk-rain-loft']),
  world('bookish-corners', 'Bookish corners', 'Rainy windows, long shelves, and a bookshop cat.', 'cozy', ['rainy-library', 'bookshop-cat']),
  world('mountain-cabins', 'Mountain cabins', 'Firelight inside, snow and northern skies outside.', 'cozy', ['alpine-cabin', 'aurora-cabin']),
  world('garden-retreats', 'Garden retreats', 'Study beside blossoms, leafy glass, and a quiet tea garden.', 'nature', ['sunlit-greenhouse', 'sakura-garden', 'kyoto-teahouse']),
  world('small-friends', 'Small friends', 'Pond studios and tiny hideaways with gentle company.', 'nature', ['capybara-onsen', 'frog-pond-studio', 'tiny-mouse-house']),
  world('soft-little-worlds', 'Soft little worlds', 'Cloud cafés and a cozy midnight desk.', 'elsewhere', ['cinnamoroll-cloud-cafe', 'kuromi-midnight-desk', 'cloud-cafe']),
  world('ocean-worlds', 'Ocean worlds', 'Follow the water from a lighthouse to a ship and an underwater library.', 'nature', ['lighthouse-study', 'thousand-sunny-study', 'underwater-study']),
  world('quiet-journeys', 'Quiet journeys', 'A lamplit compartment with the landscape passing by.', 'elsewhere', ['midnight-train']),
  world('creative-corners', 'Creative corners', 'Rooftop light, paper, and a desk for your next idea.', 'city', ['paris-attic', 'stationery-studio']),
  world('open-air-hideaways', 'Open-air hideaways', 'Sheltered desks beside a green canopy or a still courtyard.', 'nature', ['woodland-treehouse', 'desert-casita']),
  world('little-cafes', 'Little cafés', 'Warm bakery windows and a late-night city café.', 'cozy', ['autumn-bakery', 'seoul-night-cafe']),
];
export function getNookWorld(roomId: string): NookWorld | undefined {
  return nookWorlds.find(world => world.rooms.some(room => room.roomId === roomId));
}
function roomSeconds(progress: RoomFocusProgress, roomId: string): number {
  if (!Object.hasOwn(progress, roomId)) return 0;
  const seconds = progress[roomId]?.focusSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
}
/** Saved focus seconds only; duplicate rooms and unrelated worlds never add credit. */
export function worldProgress(world: NookWorld, progress: RoomFocusProgress): number {
  return [...new Set(world.rooms.map(room => room.roomId))].reduce((total, id) => Math.min(Number.MAX_VALUE, total + roomSeconds(progress, id)), 0);
}
export function roomUnlocked(world: NookWorld, room: NookWorldRoom, progress: RoomFocusProgress, currentRoomId?: string): boolean {
  const member = world.rooms.find(candidate => candidate.roomId === room.roomId);
  if (!member) return false;
  return member.minutes === 0 || member.roomId === currentRoomId || roomSeconds(progress, member.roomId) > 0 || worldProgress(world, progress) >= member.minutes * 60;
}
/** Local design projection, using existing art. Does not award or place backend inventory. */
export function worldMilestones(world: NookWorld): WorldMilestone[] {
  if (world.id !== 'hogwarts' || !world.progression) return [];
  const items: WorldMilestone[] = [
    {kind:'item',id:'hogwarts-letter',title:'Hogwarts admission letter',minutes:15,art:'letter',description:'A letter marks the beginning of your study journey.'},
    {kind:'item',id:'hogwarts-wand',title:'First wand',minutes:30,art:'wand',description:'A wand for the discoveries ahead.'},
    {kind:'item',id:'hogwarts-cloak',title:'Traveller’s cloak',minutes:75,art:'cloak',description:'A cloak for quiet journeys through the castle.'},
    {kind:'item',id:'hogwarts-spellbook',title:'Book of constellations',minutes:105,art:'spellbook',description:'A guide to the stars before your observatory visit.'},
  ];
  return [...items, ...world.rooms.filter(room => room.minutes > 0).map(room => ({kind:'room' as const,...room}))].sort((a,b)=>a.minutes-b.minutes);
}
