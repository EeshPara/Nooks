import { InputError } from './errors.mjs';

export const defaultSpace = () => ({ name: 'My study nook', tagline: 'Small steps. A little room to grow.', theme: 'botanical', room: 'rainy-library', accent: '#8bc8a7', companion: 'sleepy-dog', layout: 'calm', decorations: ['sparkles'] });
// Includes retired IDs so existing saved nooks and progress remain valid.
export const ROOM_IDS = Object.freeze([
  "rainy-library",
  "howls-moving-study",
  "gryffindor-common-room",
  "neon-tokyo",
  "alpine-cabin",
  "totoro-forest-window",
  "slytherin-common-room",
  "kikis-bakery-attic",
  "midnight-train",
  "hufflepuff-common-room",
  "ravenclaw-tower",
  "stardew-farmhouse",
  "spirited-bathhouse",
  "bookshop-cat",
  "sunlit-greenhouse",
  "dragon-hatchery",
  "velaris-study",
  "dragon-rider-study",
  "hobbit-study",
  "animal-crossing-island",
  "cinnamoroll-cloud-cafe",
  "witch-apothecary",
  "kyoto-teahouse",
  "oxford-library",
  "capybara-onsen",
  "pokemon-research-cottage",
  "sakura-garden",
  "paris-attic",
  "underwater-study",
  "moonlit-observatory",
  "frog-pond-studio",
  "kuromi-midnight-desk",
  "antique-workshop",
  "minecraft-cottage",
  "hateno-study",
  "sumeru-akademiya",
  "mage-archive",
  "cyberpunk-rain-loft",
  "secret-door-study",
  "nevermore-study",
  "autumn-bakery",
  "seoul-night-cafe",
  "cloud-cafe",
  "tiny-mouse-house",
  "woodland-treehouse",
  "aurora-cabin",
  "lighthouse-study",
  "desert-casita",
  "stationery-studio",
  "thousand-sunny-study",
  "seaside-studio",
  "autumn-bookshop",
  "brooklyn-loft",
  "cloud-bedroom",
  "tropical-veranda",
  "mossy-watermill",
  "autumn-camper",
  "ricefield-porch",
  "lakeside-boathouse",
  "castle-study",
  "floating-airship",
  "moon-base",
  "lavender-cottage",
  "canal-apartment",
  "night-campus",
  "mosslight-dungeon"
]);
export const spaceEnums = { theme: ['botanical', 'moonlight', 'sunrise', 'lavender', 'sky'], room: ROOM_IDS, accent: ['#8bc8a7', '#e9ab86', '#b1a0d8', '#8cbad1', '#d7a0b1'], companion: ['sleepy-dog', 'sprout', 'cat', 'none', 'bunny', 'fox', 'capybara', 'red-panda', 'owl', 'turtle', 'bear', 'ghost'], layout: ['calm', 'focused'], decoration: ['sparkles', 'stickers'] };

export function validateSpace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('space must be an object.');
  const result = defaultSpace();
  // Existing spaces use their theme-to-room fallback until a room is chosen.
  if (input.room === undefined) delete result.room;
  for (const [key, max] of [['name', 80], ['tagline', 240]]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > max || (key === 'name' && !input[key].trim())) throw new InputError(`${key} must be text of at most ${max} characters.`);
    result[key] = input[key].trim();
  }
  for (const key of ['theme', 'room', 'accent', 'companion', 'layout']) {
    if (input[key] === undefined) continue;
    if (!spaceEnums[key].includes(input[key])) throw new InputError(`Invalid ${key}.`);
    result[key] = input[key];
  }
  if (input.decorations !== undefined) {
    if (!Array.isArray(input.decorations) || input.decorations.length > 2 || input.decorations.some(item => !spaceEnums.decoration.includes(item))) throw new InputError('Invalid decorations.');
    result.decorations = [...new Set(input.decorations)];
  }
  if (input.backgroundImage) {
    if (typeof input.backgroundImage !== 'string' || input.backgroundImage.length > 1024 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.backgroundImage)) throw new InputError('Background must be a PNG, JPEG or WebP image under 1MB.');
    const encoded = input.backgroundImage.slice(input.backgroundImage.indexOf(',') + 1);
    let bytes;
    try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); }
    catch { throw new InputError('Background must contain valid base64 image bytes.'); }
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
    if (!(input.backgroundImage.startsWith('data:image/png;') && png || input.backgroundImage.startsWith('data:image/jpeg;') && jpeg || input.backgroundImage.startsWith('data:image/webp;') && webp)) throw new InputError('Background image bytes do not match their declared format.');
    result.backgroundImage = input.backgroundImage;
  }
  return result;
}
