export interface NookPlaylist {
  title: string;
  curator: string;
  vibe: string;
  url: string;
}

// Public playlists selected for each setting, not playlists owned by Nooks.
// Titles, curators, and source links checked 2026-10-03; see docs/nook-soundtracks.md.
const selections = {
  lofi: { title: 'Lofi Girl - beats to relax/study to', curator: 'Lofi Girl', url: 'https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4FyS8kM' },
  reading: { title: 'Reading lofi', curator: 'Lofi Girl', url: 'https://open.spotify.com/playlist/0wF5xUDywPJxS1OBwFmzxY' },
  autumn: { title: 'autumn lofi mix 🍂', curator: 'Lofi Girl', url: 'https://open.spotify.com/playlist/74d3JOTVNyymjFuOjc2Jjm' },
  piano: { title: 'Peaceful Piano', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO' },
  focus: { title: 'Deep Focus', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
  ambient: { title: 'Ambient Relaxation', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY' },
  jazz: { title: 'Jazz in the Background', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWV7EzJMK2FUI' },
  classical: { title: 'Classical Reading', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWYkztttC1w38' },
  garden: { title: 'lofi garden', curator: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4t95PAs1EpY' },
  synthwave: { title: 'Synthwave - beats to chill/game to', curator: 'Lofi Girl', url: 'https://open.spotify.com/playlist/1YIe34rcmLjCYpY9wJoM2p' },
  ghibli: { title: 'Ghibli Piano', curator: 'Marcus Ding', url: 'https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa' },
  fantasy: { title: 'Fantasy Ambience - Exploration', curator: 'tektiv', url: 'https://open.spotify.com/playlist/4bp6skcfDwT7APkLKJD3nZ' },
  games: { title: 'Video Game Lofi & Chill Beats 🎮', curator: 'GlitchxCity', url: 'https://open.spotify.com/playlist/1XyJ3uxUgfiMgSKQcOXxac' },
  guitar: { title: 'This is James Shanon', curator: 'Lark Recordings', url: 'https://open.spotify.com/playlist/11S3Z2t0En1Lbk7Rr5jP81' },
} satisfies Record<string, Omit<NookPlaylist, 'vibe'>>;

function soundtrack(selection: keyof typeof selections, vibe: string): NookPlaylist {
  return { ...selections[selection], vibe };
}

export const nookPlaylists: Record<string, NookPlaylist> = {
  'rainy-library': soundtrack('lofi', 'Soft beats for a rainy reading session'),
  'midnight-train': soundtrack('focus', 'Unhurried instrumentals for the night ride'),
  'sakura-garden': soundtrack('ghibli', 'Gentle piano beneath the cherry blossoms'),
  'seaside-studio': soundtrack('guitar', 'Acoustic guitar and an open horizon'),
  'alpine-cabin': soundtrack('piano', 'Quiet piano beside the fire'),
  'autumn-bookshop': soundtrack('autumn', 'Warm beats for old books and autumn rain'),
  'moonlit-observatory': soundtrack('ambient', 'Spacious ambient for stargazing'),
  'sunlit-greenhouse': soundtrack('garden', 'Light beats among the leaves'),
  'neon-tokyo': soundtrack('synthwave', 'Soft synths above the city lights'),
  'paris-attic': soundtrack('jazz', 'Low-key jazz over the rooftops'),
  'kyoto-teahouse': soundtrack('reading', 'Minimal beats for tea and bamboo rain'),
  'brooklyn-loft': soundtrack('jazz', 'Easy jazz for a vinyl afternoon'),
  'cloud-bedroom': soundtrack('piano', 'Soft piano for a slower afternoon'),
  'oxford-library': soundtrack('classical', 'Classical pieces for a long reading session'),
  'lighthouse-study': soundtrack('piano', 'Quiet keys by the sea'),
  'tropical-veranda': soundtrack('garden', 'Mellow beats under the palm leaves'),
  'mossy-watermill': soundtrack('ghibli', 'Piano melodies beside the stream'),
  'aurora-cabin': soundtrack('ambient', 'Slow ambience under the northern lights'),
  'autumn-camper': soundtrack('autumn', 'Warm lofi for an autumn road trip'),
  'ricefield-porch': soundtrack('ghibli', 'Piano for an open summer porch'),
  'lakeside-boathouse': soundtrack('guitar', 'Gentle guitar by still water'),
  'castle-study': soundtrack('fantasy', 'Fantasy soundscapes for a candlelit tower'),
  'desert-casita': soundtrack('guitar', 'Warm acoustic strings at sunset'),
  'underwater-study': soundtrack('ambient', 'Drifting ambient below the surface'),
  'floating-airship': soundtrack('ghibli', 'Piano melodies above the clouds'),
  'moon-base': soundtrack('synthwave', 'Quiet synths with an Earth view'),
  'woodland-treehouse': soundtrack('garden', 'Soft beats in the forest canopy'),
  'lavender-cottage': soundtrack('piano', 'Delicate piano in the afternoon light'),
  'canal-apartment': soundtrack('reading', 'Low-key beats for a rainy canal evening'),
  'night-campus': soundtrack('games', 'Familiar game melodies for late-night focus'),
  'mosslight-dungeon': soundtrack('fantasy', 'Atmospheric game scores among the ruins'),
  'moonstone-annex': soundtrack('classical', 'Quiet classical in the moonlit annex'),
  'howls-moving-study': soundtrack('ghibli', 'Gentle piano for a storybook study session'),
  'gryffindor-common-room': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'totoro-forest-window': soundtrack('ghibli', 'Gentle piano for a storybook study session'),
  'slytherin-common-room': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'kikis-bakery-attic': soundtrack('jazz', 'Easy jazz for your cafe study session'),
  'hufflepuff-common-room': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'ravenclaw-tower': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'stardew-farmhouse': soundtrack('games', 'Game melodies for a focused study session'),
  'spirited-bathhouse': soundtrack('ghibli', 'Gentle piano for a storybook study session'),
  'bookshop-cat': soundtrack('lofi', 'Mellow beats for steady focus'),
  'dragon-hatchery': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'velaris-study': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'dragon-rider-study': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'hobbit-study': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'animal-crossing-island': soundtrack('games', 'Game melodies for a focused study session'),
  'cinnamoroll-cloud-cafe': soundtrack('jazz', 'Easy jazz for your cafe study session'),
  'witch-apothecary': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'capybara-onsen': soundtrack('garden', 'Light beats and an unhurried afternoon'),
  'pokemon-research-cottage': soundtrack('games', 'Game melodies for a focused study session'),
  'frog-pond-studio': soundtrack('garden', 'Light beats and an unhurried afternoon'),
  'kuromi-midnight-desk': soundtrack('piano', 'Soft piano for a cozy study session'),
  'antique-workshop': soundtrack('ghibli', 'Gentle piano for a storybook study session'),
  'minecraft-cottage': soundtrack('games', 'Game melodies for a focused study session'),
  'hateno-study': soundtrack('games', 'Game melodies for a focused study session'),
  'sumeru-akademiya': soundtrack('games', 'Game melodies for a focused study session'),
  'mage-archive': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'cyberpunk-rain-loft': soundtrack('synthwave', 'Soft synths above a neon city'),
  'secret-door-study': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'nevermore-study': soundtrack('fantasy', 'Quiet fantasy ambience for reading'),
  'autumn-bakery': soundtrack('jazz', 'Easy jazz for your cafe study session'),
  'seoul-night-cafe': soundtrack('jazz', 'Easy jazz for your cafe study session'),
  'cloud-cafe': soundtrack('jazz', 'Easy jazz for your cafe study session'),
  'tiny-mouse-house': soundtrack('piano', 'Soft piano for a cozy study session'),
  'stationery-studio': soundtrack('lofi', 'Mellow beats for steady focus'),
  'thousand-sunny-study': soundtrack('ghibli', 'Gentle piano for a storybook study session'),
  'crystal-vault': soundtrack('ambient', 'Spacious tones beneath the glowing crystals'),
};

const fallbackPlaylist = soundtrack('lofi', 'Soft beats for your study nook');

export function getNookPlaylist(roomId: string): NookPlaylist {
  return Object.hasOwn(nookPlaylists, roomId) ? nookPlaylists[roomId] : fallbackPlaylist;
}
