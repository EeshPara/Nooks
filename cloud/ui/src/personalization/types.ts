import type { CSSProperties } from 'react';

export type SpaceTheme = 'botanical' | 'moonlight' | 'sunrise' | 'lavender' | 'sky';
export type RoomCategory = 'cozy' | 'nature' | 'city' | 'elsewhere';
export type RoomStyle = 'cinematic' | 'anime' | 'illustrated' | 'watercolor' | 'pixel' | 'dreamlike' | 'photoreal';
export type RoomMood = 'rain' | 'snow' | 'petals' | 'stars' | 'sun' | 'sea' | 'city' | 'none';
export type RoomSurfaceSegment = readonly [number, number, number, number];
export interface RoomScene { id: string; title: string; caption: string; category: RoomCategory; style: RoomStyle; image: string; theme: SpaceTheme; mood: RoomMood; width: number; height: number; segments: readonly RoomSurfaceSegment[] }
export type SpaceCompanion = 'sleepy-dog' | 'sprout' | 'cat' | 'none' | 'bunny' | 'fox' | 'capybara' | 'red-panda' | 'owl' | 'turtle' | 'bear' | 'ghost';
export interface WorkspaceSpace {
  name: string;
  tagline: string;
  theme: SpaceTheme;
  room?: RoomId;
  accent: string;
  companion: SpaceCompanion;
  layout: 'calm' | 'focused';
  decorations: ('sparkles' | 'stickers')[];
  backgroundImage?: string;
}
export interface SpaceStats { xp: number; level: number; streak: number; focusMinutes: number }
export interface SharedSpace { id: string; url?: string; createdAt: string; space: WorkspaceSpace; description: string; stats?: SpaceStats; roomDisplay?: { roomId: string; placed: string[] } }
export const defaultSpace: WorkspaceSpace = { name: 'My study nook', tagline: 'A little focus. A little growth. A lot of possibility.', theme: 'botanical', accent: '#8bc8a7', companion: 'sleepy-dog', layout: 'calm', decorations: ['sparkles'] };
export const roomScenes = [
  {
    "id": "rainy-library",
    "title": "Rainy Library",
    "caption": "Amber lamps & city rain",
    "category": "cozy",
    "image": "/images/lofi-rainy-library.webp",
    "theme": "botanical",
    "mood": "rain",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "midnight-train",
    "title": "Night Train",
    "caption": "Moonlit countryside & quiet rails",
    "category": "elsewhere",
    "image": "/images/lofi-midnight-train.webp",
    "theme": "sky",
    "mood": "stars",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "sakura-garden",
    "title": "Cherry Garden",
    "caption": "Petals & afternoon light",
    "category": "nature",
    "image": "/images/lofi-sakura-garden.webp",
    "theme": "sunrise",
    "mood": "petals",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "seaside-studio",
    "title": "Seaside Studio",
    "caption": "Salt air, linen & a blue horizon",
    "category": "nature",
    "image": "/images/lofi-seaside-studio.webp",
    "theme": "sky",
    "mood": "sea",
    "width": 1672,
    "height": 940,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "alpine-cabin",
    "title": "Snow Cabin",
    "caption": "Mountain snow & a crackling fire",
    "category": "cozy",
    "image": "/images/lofi-alpine-cabin.webp",
    "theme": "moonlight",
    "mood": "snow",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "autumn-bookshop",
    "title": "Autumn Bookshop",
    "caption": "Rain, copper leaves & old pages",
    "category": "cozy",
    "image": "/images/lofi-autumn-bookshop.webp",
    "theme": "sunrise",
    "mood": "rain",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "moonlit-observatory",
    "title": "Hilltop Observatory",
    "caption": "A quiet desk beneath the stars",
    "category": "elsewhere",
    "image": "/images/lofi-moonlit-observatory.webp",
    "theme": "moonlight",
    "mood": "stars",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "sunlit-greenhouse",
    "title": "Sunlit Greenhouse",
    "caption": "Golden light through leafy glass",
    "category": "nature",
    "image": "/images/lofi-sunlit-greenhouse.webp",
    "theme": "botanical",
    "mood": "sun",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "neon-tokyo",
    "title": "Rooftop Tokyo",
    "caption": "Rooftop quiet & distant city lights",
    "category": "city",
    "image": "/images/lofi-neon-tokyo.webp",
    "theme": "lavender",
    "mood": "city",
    "width": 1672,
    "height": 941,
    "style": "cinematic",
    "segments": []
  },
  {
    "id": "paris-attic",
    "title": "Paris Attic",
    "caption": "Rooftops, linen & first light",
    "category": "city",
    "image": "/images/lofi-paris-attic.webp",
    "theme": "sunrise",
    "mood": "sun",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "kyoto-teahouse",
    "title": "Kyoto Teahouse",
    "caption": "Tatami, tea & bamboo rain",
    "category": "nature",
    "image": "/images/lofi-kyoto-teahouse.webp",
    "theme": "botanical",
    "mood": "rain",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "brooklyn-loft",
    "title": "Brooklyn Loft",
    "caption": "Vinyl, brick & afternoon sun",
    "category": "city",
    "image": "/images/lofi-brooklyn-loft.webp",
    "theme": "sunrise",
    "mood": "sun",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "cloud-bedroom",
    "title": "Cloud Bedroom",
    "caption": "Soft pink, ribbons & daydreams",
    "category": "cozy",
    "image": "/images/lofi-cloud-bedroom.webp",
    "theme": "lavender",
    "mood": "sun",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "oxford-library",
    "title": "Oak Library",
    "caption": "Oak shelves & rainy windows",
    "category": "cozy",
    "image": "/images/lofi-oxford-library.webp",
    "theme": "moonlight",
    "mood": "rain",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "lighthouse-study",
    "title": "Lighthouse Desk",
    "caption": "Salt air & a distant horizon",
    "category": "elsewhere",
    "image": "/images/lofi-lighthouse-study.webp",
    "theme": "sky",
    "mood": "sea",
    "style": "illustrated",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "tropical-veranda",
    "title": "Monsoon Veranda",
    "caption": "Rain on palm leaves",
    "category": "nature",
    "image": "/images/lofi-tropical-veranda.webp",
    "theme": "botanical",
    "mood": "rain",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "mossy-watermill",
    "title": "Moss Watermill",
    "caption": "A stream through the forest",
    "category": "nature",
    "image": "/images/lofi-mossy-watermill.webp",
    "theme": "botanical",
    "mood": "sun",
    "style": "illustrated",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "aurora-cabin",
    "title": "Aurora Cabin",
    "caption": "Arctic quiet & a warm blanket",
    "category": "nature",
    "image": "/images/lofi-aurora-cabin.webp",
    "theme": "sky",
    "mood": "stars",
    "style": "dreamlike",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "autumn-camper",
    "title": "Autumn Camper",
    "caption": "Autumn hills from your camper",
    "category": "elsewhere",
    "image": "/images/lofi-autumn-camper.webp",
    "theme": "sunrise",
    "mood": "sun",
    "style": "anime",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "ricefield-porch",
    "title": "Ricefield Porch",
    "caption": "An open porch in late summer",
    "category": "nature",
    "image": "/images/lofi-ricefield-porch.webp",
    "theme": "botanical",
    "mood": "sun",
    "style": "anime",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "lakeside-boathouse",
    "title": "Lakeside Boathouse",
    "caption": "Still water & summer light",
    "category": "nature",
    "image": "/images/lofi-lakeside-boathouse.webp",
    "theme": "sky",
    "mood": "sea",
    "style": "watercolor",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "castle-study",
    "title": "Castle Tower",
    "caption": "A desk above the sleeping town",
    "category": "elsewhere",
    "image": "/images/lofi-castle-study.webp",
    "theme": "moonlight",
    "mood": "stars",
    "style": "illustrated",
    "width": 1672,
    "height": 940,
    "segments": []
  },
  {
    "id": "desert-casita",
    "title": "Desert Casita",
    "caption": "Terracotta walls & sunset mesas",
    "category": "nature",
    "image": "/images/lofi-desert-casita.webp",
    "theme": "sunrise",
    "mood": "sun",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "underwater-study",
    "title": "Reef Study",
    "caption": "Blue depths & amber lamps",
    "category": "elsewhere",
    "image": "/images/lofi-underwater-study.webp",
    "theme": "sky",
    "mood": "sea",
    "style": "dreamlike",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "floating-airship",
    "title": "Cloud Airship",
    "caption": "Brass windows above the clouds",
    "category": "elsewhere",
    "image": "/images/lofi-floating-airship.webp",
    "theme": "sunrise",
    "mood": "sun",
    "style": "dreamlike",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "moon-base",
    "title": "Moon Base",
    "caption": "A quiet desk with an Earth view",
    "category": "elsewhere",
    "image": "/images/lofi-moon-base.webp",
    "theme": "moonlight",
    "mood": "stars",
    "style": "cinematic",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "woodland-treehouse",
    "title": "Woodland Treehouse",
    "caption": "Canopy light & timber shelves",
    "category": "nature",
    "image": "/images/lofi-woodland-treehouse.webp",
    "theme": "botanical",
    "mood": "sun",
    "style": "illustrated",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "lavender-cottage",
    "title": "Lavender Cottage",
    "caption": "Provence fields in watercolor",
    "category": "cozy",
    "image": "/images/lofi-lavender-cottage.webp",
    "theme": "lavender",
    "mood": "sun",
    "style": "watercolor",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "canal-apartment",
    "title": "Canal Apartment",
    "caption": "Amsterdam dusk & rain reflections",
    "category": "city",
    "image": "/images/lofi-canal-apartment.webp",
    "theme": "moonlight",
    "mood": "rain",
    "style": "anime",
    "width": 1672,
    "height": 941,
    "segments": []
  },
  {
    "id": "night-campus",
    "title": "Night Campus",
    "caption": "A pixel library after dark",
    "category": "cozy",
    "image": "/images/lofi-night-campus.webp",
    "theme": "moonlight",
    "mood": "stars",
    "style": "pixel",
    "width": 1672,
    "height": 941,
    "segments": []
  },
{
  "id": "mosslight-dungeon",
  "title": "Mosslight Dungeon",
  "caption": "Crystal pools & candlelit stone",
  "category": "elsewhere",
  "image": "/images/lofi-mosslight-dungeon.webp",
  "theme": "moonlight",
  "mood": "none",
  "style": "illustrated",
  "width": 1672,
  "height": 941,
  "segments": []
}
] as const satisfies readonly RoomScene[];
export type RoomId = (typeof roomScenes)[number]['id'];
export const roomCategories: { id: RoomCategory | 'all'; title: string }[] = [{ id: 'all', title: 'All' }, { id: 'cozy', title: 'Cozy' }, { id: 'nature', title: 'Nature' }, { id: 'city', title: 'City' }, { id: 'elsewhere', title: 'Elsewhere' }];
function curatedRoom(id: RoomId): RoomScene { return roomScenes.find(room => room.id === id) ?? roomScenes[0]; }
export const ROOM_SCENES: Record<SpaceTheme, RoomScene> = {
  botanical: curatedRoom('rainy-library'),
  moonlight: curatedRoom('rainy-library'),
  sunrise: curatedRoom('sakura-garden'),
  lavender: curatedRoom('sakura-garden'),
  sky: curatedRoom('midnight-train'),
};
export function getRoomScene(space: WorkspaceSpace): RoomScene {
  const selected = roomScenes.find(room => room.id === space.room) ?? ROOM_SCENES[space.theme] ?? roomScenes[0];
  const custom = safeBackgroundImage(space.backgroundImage);
  return custom ? { ...selected, image: custom, title: 'Your own nook', caption: 'Your uploaded artwork', mood: 'none', segments: [] } : selected;
}
export function getRoomImage(space: WorkspaceSpace): string { return getRoomScene(space).image; }
export const themes: { id: SpaceTheme; name: string; caption: string; colors: string[]; image: string }[] = [
  { id: 'botanical', name: 'Rainy library', caption: 'Amber lamps & city rain', image: ROOM_SCENES.botanical.image, colors: ['#f2f5e8', '#b8d9a4', '#e5c798'] },
  { id: 'moonlight', name: 'After hours', caption: 'Library nook · dark palette', image: ROOM_SCENES.moonlight.image, colors: ['#202c28', '#456c53', '#c5d5ac'] },
  { id: 'sunrise', name: 'Sakura garden', caption: 'Petals & afternoon light', image: ROOM_SCENES.sunrise.image, colors: ['#fff2e7', '#efc59f', '#d89779'] },
  { id: 'lavender', name: 'Rose dusk', caption: 'Garden nook · rose palette', image: ROOM_SCENES.lavender.image, colors: ['#f2eef8', '#c7b9e0', '#a899c8'] },
  { id: 'sky', name: 'Midnight train', caption: 'Moonlit countryside', image: ROOM_SCENES.sky.image, colors: ['#edf5f7', '#b7d6e2', '#91b6c6'] },
];
export const accents = [{ value: '#8bc8a7', name: 'Sage' }, { value: '#e9ab86', name: 'Peach' }, { value: '#b1a0d8', name: 'Lavender' }, { value: '#8cbad1', name: 'Sky' }, { value: '#d7a0b1', name: 'Rose' }];
const palettes: Record<SpaceTheme, { bg: string; surface: string; ink: string; muted: string; line: string }> = {
  botanical: { bg: '#f4f6ed', surface: '#fffef8', ink: '#283d32', muted: '#7a887d', line: '#e0e6d9' },
  moonlight: { bg: '#202d29', surface: '#2b3b34', ink: '#ebf2e6', muted: '#a5b5a7', line: '#425247' },
  sunrise: { bg: '#fff4e9', surface: '#fffcf7', ink: '#594438', muted: '#9e8978', line: '#efdfcf' },
  lavender: { bg: '#f4f0f9', surface: '#fffdff', ink: '#4b425a', muted: '#948b9e', line: '#e5dfef' },
  sky: { bg: '#eef5f7', surface: '#fcfeff', ink: '#334b54', muted: '#80959d', line: '#dce9ed' },
};
export function getSpaceStyle(space: WorkspaceSpace): CSSProperties {
  const palette = palettes[space.theme] ?? palettes.botanical;
  const accentStyles: Record<string, { ink: string; light: string; darkLight: string }> = {
    '#8bc8a7': { ink: '#33734d', light: '#e2f2e7', darkLight: '#314b3c' },
    '#e9ab86': { ink: '#97502d', light: '#fbe7d9', darkLight: '#514134' },
    '#b1a0d8': { ink: '#745297', light: '#eee7f8', darkLight: '#443c51' },
    '#8cbad1': { ink: '#356b85', light: '#e1eff6', darkLight: '#354951' },
    '#d7a0b1': { ink: '#924f66', light: '#f6e5ed', darkLight: '#4e3943' },
  };
  const selected = accentStyles[space.accent] ?? accentStyles[defaultSpace.accent];
  const dark = space.theme === 'moonlight';
  return { '--space-bg': palette.bg, '--space-surface': palette.surface, '--space-ink': palette.ink, '--space-muted': palette.muted, '--space-line': palette.line, '--space-accent': space.accent, '--bg': palette.bg, '--surface': palette.surface, '--ink': palette.ink, '--muted': palette.muted, '--line': palette.line, '--accent': dark ? space.accent : selected.ink, '--accent-light': dark ? selected.darkLight : selected.light, '--sidebar': dark ? '#26352d' : palette.surface, '--accent-foreground': dark ? '#23312a' : '#ffffff', colorScheme: dark ? 'dark' : 'light' } as CSSProperties;
}
export function safeBackgroundImage(image?: string): string | undefined {
  return image && image.length <= 1_000_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ? image : undefined;
}
