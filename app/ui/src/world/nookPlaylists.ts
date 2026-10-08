export interface NookPlaylist { title: string; curator: string; vibe: string; url: string; }

// Public Spotify playlist metadata researched October 7, 2026.
// See creative/nooks-50-backgrounds/spotify-research.json for per-nook sources.
// These are third-party recommendations, not playlists owned by Nooks.
// Retired scenes retain their soundtracks for saved workspaces.
export const nookPlaylists: Record<string, NookPlaylist> = {
  "rainy-library": {
    "title": "Reading lofi",
    "curator": "Lofi Girl",
    "vibe": "Soft lo-fi for rain-streaked windows and long chapters",
    "url": "https://open.spotify.com/playlist/0wF5xUDywPJxS1OBwFmzxY"
  },
  "midnight-train": {
    "title": "Deep Focus",
    "curator": "Spotify",
    "vibe": "Spacious instrumentals for the long night ride",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"
  },
  "sakura-garden": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "vibe": "Gentle piano beneath drifting cherry blossoms",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa"
  },
  "seaside-studio": {
    "title": "This is James Shanon",
    "curator": "Lark Recordings",
    "url": "https://open.spotify.com/playlist/11S3Z2t0En1Lbk7Rr5jP81",
    "vibe": "Acoustic guitar and an open horizon"
  },
  "alpine-cabin": {
    "title": "Peaceful Piano",
    "curator": "Spotify",
    "vibe": "Quiet piano beside the fire and falling snow",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO"
  },
  "autumn-bookshop": {
    "title": "autumn lofi mix 🍂",
    "curator": "Lofi Girl",
    "url": "https://open.spotify.com/playlist/74d3JOTVNyymjFuOjc2Jjm",
    "vibe": "Warm beats for old books and autumn rain"
  },
  "moonlit-observatory": {
    "title": "Ambient Relaxation",
    "curator": "Spotify",
    "vibe": "Spacious ambient music for a sky full of stars",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY"
  },
  "sunlit-greenhouse": {
    "title": "lofi garden",
    "curator": "Spotify",
    "vibe": "Light lo-fi among leaves and terracotta pots",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4t95PAs1EpY"
  },
  "neon-tokyo": {
    "title": "Lofi Girl - beats to relax/study to",
    "curator": "Lofi Girl",
    "vibe": "Late-night beats above Tokyo’s rainy streets",
    "url": "https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4FyS8kM"
  },
  "paris-attic": {
    "title": "Jazz in the Background",
    "curator": "Spotify",
    "vibe": "Easy jazz above the Paris rooftops",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWV7EzJMK2FUI"
  },
  "kyoto-teahouse": {
    "title": "Music for Japanese Sweets and Tea",
    "curator": "KITCHEN. LABEL",
    "vibe": "A thoughtful tea-time selection for a quiet garden desk",
    "url": "https://open.spotify.com/playlist/2TAMYV2q5p69MzVXKNfx5f"
  },
  "brooklyn-loft": {
    "title": "Jazz in the Background",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWV7EzJMK2FUI",
    "vibe": "Easy jazz for a vinyl afternoon"
  },
  "cloud-bedroom": {
    "title": "Peaceful Piano",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO",
    "vibe": "Soft piano for a slower afternoon"
  },
  "oxford-library": {
    "title": "Classical Reading",
    "curator": "Spotify",
    "vibe": "Classical music for candlelit pages and old atlases",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWYkztttC1w38"
  },
  "lighthouse-study": {
    "title": "This is James Shanon",
    "curator": "Lark Recordings",
    "vibe": "Gentle acoustic strings with a wide sea horizon",
    "url": "https://open.spotify.com/playlist/11S3Z2t0En1Lbk7Rr5jP81"
  },
  "tropical-veranda": {
    "title": "lofi garden",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4t95PAs1EpY",
    "vibe": "Mellow beats under the palm leaves"
  },
  "mossy-watermill": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa",
    "vibe": "Piano melodies beside the stream"
  },
  "aurora-cabin": {
    "title": "Ambient Relaxation",
    "curator": "Spotify",
    "vibe": "Slow ambient music under the northern lights",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY"
  },
  "autumn-camper": {
    "title": "autumn lofi mix 🍂",
    "curator": "Lofi Girl",
    "url": "https://open.spotify.com/playlist/74d3JOTVNyymjFuOjc2Jjm",
    "vibe": "Warm lofi for an autumn road trip"
  },
  "ricefield-porch": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa",
    "vibe": "Piano for an open summer porch"
  },
  "lakeside-boathouse": {
    "title": "This is James Shanon",
    "curator": "Lark Recordings",
    "url": "https://open.spotify.com/playlist/11S3Z2t0En1Lbk7Rr5jP81",
    "vibe": "Gentle guitar by still water"
  },
  "castle-study": {
    "title": "Fantasy Ambience - Exploration",
    "curator": "tektiv",
    "url": "https://open.spotify.com/playlist/4bp6skcfDwT7APkLKJD3nZ",
    "vibe": "Fantasy soundscapes for a candlelit tower"
  },
  "desert-casita": {
    "title": "This is James Shanon",
    "curator": "Lark Recordings",
    "vibe": "Warm acoustic guitar for a shaded courtyard",
    "url": "https://open.spotify.com/playlist/11S3Z2t0En1Lbk7Rr5jP81"
  },
  "underwater-study": {
    "title": "Ambient Relaxation",
    "curator": "Spotify",
    "vibe": "Drifting ambient textures beneath the blue ocean",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY"
  },
  "floating-airship": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa",
    "vibe": "Piano melodies above the clouds"
  },
  "moon-base": {
    "title": "Synthwave - beats to chill/game to",
    "curator": "Lofi Girl",
    "url": "https://open.spotify.com/playlist/1YIe34rcmLjCYpY9wJoM2p",
    "vibe": "Quiet synths with an Earth view"
  },
  "woodland-treehouse": {
    "title": "🌿 magical worlds 🌳",
    "curator": "Madi",
    "vibe": "Fairytale forest music in a misty tree canopy",
    "url": "https://open.spotify.com/playlist/66MezgCyl3KzWQbTRgEAkm"
  },
  "lavender-cottage": {
    "title": "Peaceful Piano",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO",
    "vibe": "Delicate piano in the afternoon light"
  },
  "canal-apartment": {
    "title": "Reading lofi",
    "curator": "Lofi Girl",
    "url": "https://open.spotify.com/playlist/0wF5xUDywPJxS1OBwFmzxY",
    "vibe": "Low-key beats for a rainy canal evening"
  },
  "night-campus": {
    "title": "Video Game Lofi & Chill Beats 🎮",
    "curator": "GlitchxCity",
    "url": "https://open.spotify.com/playlist/1XyJ3uxUgfiMgSKQcOXxac",
    "vibe": "Familiar game melodies for late-night focus"
  },
  "mosslight-dungeon": {
    "title": "Fantasy Ambience - Exploration",
    "curator": "tektiv",
    "url": "https://open.spotify.com/playlist/4bp6skcfDwT7APkLKJD3nZ",
    "vibe": "Atmospheric game scores among the ruins"
  },
  "moonstone-annex": {
    "title": "Classical Reading",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWYkztttC1w38",
    "vibe": "Quiet classical in the moonlit annex"
  },
  "howls-moving-study": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "vibe": "Ghibli piano for a warm, wandering castle study",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa"
  },
  "gryffindor-common-room": {
    "title": "Harry Potter lofi⚡",
    "curator": "Chill Astronaut",
    "vibe": "Familiar wizarding melodies beside the common-room fire",
    "url": "https://open.spotify.com/playlist/7EEo7Ypc5Fy8yt0ljcmlkb"
  },
  "totoro-forest-window": {
    "title": "Studio Ghibli Lofi",
    "curator": "Slofi",
    "vibe": "Totoro melodies and soft beats for a rainy forest window",
    "url": "https://open.spotify.com/playlist/3pASaqQtpgNyJkpOTpCYMX"
  },
  "slytherin-common-room": {
    "title": "dark academia / classical gothic",
    "curator": "elisha",
    "vibe": "Shadowy classical music beneath the lake",
    "url": "https://open.spotify.com/playlist/5B5SXefpJijBzjKS1M94lG"
  },
  "kikis-bakery-attic": {
    "title": "Studio Ghibli Lofi",
    "curator": "Slofi",
    "vibe": "Ghibli lo-fi above a sunlit seaside bakery",
    "url": "https://open.spotify.com/playlist/3pASaqQtpgNyJkpOTpCYMX"
  },
  "hufflepuff-common-room": {
    "title": "Hufflepuff study session🦨",
    "curator": "Chill Astronaut",
    "vibe": "Warm wizarding beats among plants and copper kettles",
    "url": "https://open.spotify.com/playlist/4fvrhvXA1mSTb4JLaWukxc"
  },
  "ravenclaw-tower": {
    "title": "Studying in Hogwarts Library – Wizarding World Ambience",
    "curator": "Biel",
    "vibe": "Magical library ambience for a night of reading",
    "url": "https://open.spotify.com/playlist/3OSRQroLYYTwzY0FVyfqx1"
  },
  "stardew-farmhouse": {
    "title": "Calming stardew valley songs",
    "curator": "Finn",
    "vibe": "Gentle Stardew soundtrack favorites after a day on the farm",
    "url": "https://open.spotify.com/playlist/0qDW0TN6ZC5Kt5lsT299Iu"
  },
  "spirited-bathhouse": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "vibe": "Ghibli piano under lantern light and bathhouse steam",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa"
  },
  "bookshop-cat": {
    "title": "Jazz in the Background",
    "curator": "Spotify",
    "vibe": "Easy background jazz after the bookshop closes",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DWV7EzJMK2FUI"
  },
  "dragon-hatchery": {
    "title": "Fantasy Ambience - Exploration",
    "curator": "tektiv",
    "vibe": "Fantasy soundscapes beside a warm dragon nest",
    "url": "https://open.spotify.com/playlist/4bp6skcfDwT7APkLKJD3nZ"
  },
  "velaris-study": {
    "title": "✨ Acotar Ambience ✨",
    "curator": "jasmineemilyw",
    "vibe": "ACOTAR-inspired music beneath the city’s starlit sky",
    "url": "https://open.spotify.com/playlist/6gmDVEzTtyoaezXbCJEbi2"
  },
  "dragon-rider-study": {
    "title": "Fantasy IRL: ACOTAR, TOG, Fourth Wing inspired",
    "curator": "theriverfindsaway",
    "vibe": "Bookish fantasy music for a dragon rider’s evening study",
    "url": "https://open.spotify.com/playlist/7gzLq4i2AgDU7IRcvrUw76"
  },
  "hobbit-study": {
    "title": "Lord of the Rings lofi🌳",
    "curator": "Chill Astronaut",
    "vibe": "Middle-earth melodies for second breakfast and a good book",
    "url": "https://open.spotify.com/playlist/4kFtXvEAAP7rVQuLa7PIhG"
  },
  "animal-crossing-island": {
    "title": "Animal Crossing & Chill 📓 lofi beats",
    "curator": "GameChops",
    "vibe": "Island-life remixes for an unhurried study session",
    "url": "https://open.spotify.com/playlist/79KjaLmT3p98Dmsph0sPo2"
  },
  "cinnamoroll-cloud-cafe": {
    "title": "🌸aesthetic kawaii lofi🌸",
    "curator": "katheryn",
    "vibe": "Cute, gentle lo-fi for cloud seats and tiny pastries",
    "url": "https://open.spotify.com/playlist/5wrWb8YOLBo893PRGaYidp"
  },
  "witch-apothecary": {
    "title": "🌿 magical worlds 🌳",
    "curator": "Madi",
    "vibe": "Woodland fantasy music among herbs and moonlit bottles",
    "url": "https://open.spotify.com/playlist/66MezgCyl3KzWQbTRgEAkm"
  },
  "capybara-onsen": {
    "title": "Ambient Relaxation",
    "curator": "Spotify",
    "vibe": "Slow, spacious sounds for a warm-pool afternoon",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY"
  },
  "pokemon-research-cottage": {
    "title": "Pokémon & Chill 🌆 lofi beats",
    "curator": "GameChops",
    "vibe": "Pokémon lo-fi for field notes and familiar places",
    "url": "https://open.spotify.com/playlist/2Ryg9Mq25idinvrNCw4cK0"
  },
  "frog-pond-studio": {
    "title": "lofi garden",
    "curator": "Spotify",
    "vibe": "Light beats beside lily pads and watercolor sketches",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4t95PAs1EpY"
  },
  "kuromi-midnight-desk": {
    "title": "🌸aesthetic kawaii lofi🌸",
    "curator": "katheryn",
    "vibe": "Soft kawaii beats for a lilac midnight desk",
    "url": "https://open.spotify.com/playlist/5wrWb8YOLBo893PRGaYidp"
  },
  "antique-workshop": {
    "title": "Ghibli Piano",
    "curator": "Marcus Ding",
    "vibe": "Ghibli piano among antique clocks and well-worn books",
    "url": "https://open.spotify.com/playlist/5vwNi0Km340HsC5UfwaaIa"
  },
  "minecraft-cottage": {
    "title": "Minecraft Soothing Scenes: Playlist",
    "curator": "Samael Berg",
    "vibe": "Familiar Minecraft calm beside lanterns and rainy windows",
    "url": "https://open.spotify.com/playlist/5h9eMvU43GoTj3kS8tjWkO"
  },
  "hateno-study": {
    "title": "Zelda & Chill (Complete)",
    "curator": "GameChops",
    "vibe": "Zelda lo-fi for research notes and green hills",
    "url": "https://open.spotify.com/playlist/4XKH4rEyBy8kOXSPi3VVno"
  },
  "sumeru-akademiya": {
    "title": "Vourukasha Oasis",
    "curator": "falrasyid",
    "vibe": "Sumeru oasis music for a leafy scholarly terrace",
    "url": "https://open.spotify.com/playlist/2Qi0spej1g10ygUGEcQ08P"
  },
  "mage-archive": {
    "title": "Frieren OST / Fantasy Ambient",
    "curator": "Ouranio Recordings",
    "vibe": "Frieren and fantasy ambience for a spellbook afternoon",
    "url": "https://open.spotify.com/playlist/6mN7JOPU4jWwwwlbIQOcv2"
  },
  "cyberpunk-rain-loft": {
    "title": "Synthwave - beats to chill/game to",
    "curator": "Lofi Girl",
    "vibe": "Soft synths above the wet neon skyline",
    "url": "https://open.spotify.com/playlist/1YIe34rcmLjCYpY9wJoM2p"
  },
  "secret-door-study": {
    "title": "dark academia /royalcore/ classical /instrumental",
    "curator": "Fyndswan",
    "vibe": "Whimsical, shadowy instrumentals for a mysterious attic",
    "url": "https://open.spotify.com/playlist/55Ugv6NeGULSE9i1pvemlE"
  },
  "nevermore-study": {
    "title": "dark academia /royalcore/ classical /instrumental",
    "curator": "Fyndswan",
    "vibe": "Gothic piano and strings for stained glass and black ink",
    "url": "https://open.spotify.com/playlist/55Ugv6NeGULSE9i1pvemlE"
  },
  "autumn-bakery": {
    "title": "autumn lofi mix 🍂",
    "curator": "Lofi Girl",
    "vibe": "Warm autumn lo-fi with bread fresh from the oven",
    "url": "https://open.spotify.com/playlist/74d3JOTVNyymjFuOjc2Jjm"
  },
  "seoul-night-cafe": {
    "title": "korean jazz cafe",
    "curator": "ChaeYeon ☽",
    "vibe": "Korean café jazz for desserts and late-night city rain",
    "url": "https://open.spotify.com/playlist/7i8gR2sTN3AmVk5moQw8KP"
  },
  "cloud-cafe": {
    "title": "Peaceful Piano",
    "curator": "Spotify",
    "vibe": "Gentle piano in peach light above the clouds",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO"
  },
  "tiny-mouse-house": {
    "title": "🌸aesthetic kawaii lofi🌸",
    "curator": "katheryn",
    "vibe": "Tiny, cozy lo-fi for a teacup-sized study break",
    "url": "https://open.spotify.com/playlist/5wrWb8YOLBo893PRGaYidp"
  },
  "stationery-studio": {
    "title": "Reading lofi",
    "curator": "Lofi Girl",
    "vibe": "Calm lo-fi for ink, paper, and handwritten pages",
    "url": "https://open.spotify.com/playlist/0wF5xUDywPJxS1OBwFmzxY"
  },
  "thousand-sunny-study": {
    "title": "one piece background music for reading one piece",
    "curator": "PonderingAtlas",
    "vibe": "One Piece reading music for maps and a calm sea",
    "url": "https://open.spotify.com/playlist/4kF6SSxHMEnfNa37USPXfk"
  },
  "crystal-vault": {
    "title": "Ambient Relaxation",
    "curator": "Spotify",
    "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY",
    "vibe": "Spacious tones beneath the glowing crystals"
  }
};

const fallbackPlaylist: NookPlaylist = { title: 'Lofi Girl - beats to relax/study to', curator: 'Lofi Girl', vibe: 'Soft beats for your study nook', url: 'https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4FyS8kM' };
export function getNookPlaylist(roomId: string): NookPlaylist {
  return Object.hasOwn(nookPlaylists, roomId) ? nookPlaylists[roomId] : fallbackPlaylist;
}
