export interface SpotifyLink {
  uri: string;
  url: string;
  embed: string;
  kind: 'track' | 'album' | 'playlist';
  title?: string;
  curator?: string;
}

export const spotifyKey = 'nook:spotify-link:v1';
export const spotifyMetadataKey = 'nook:spotify-metadata:v1';
export const nookSpotifyKey = (roomId: string) => `nooks:spotify-nook:v1:${encodeURIComponent(roomId)}`;

/** Each nook follows its current curated selection unless the student chooses a link or silence. */
export function savedNookSpotifyLink(roomId: string, recommendation: SpotifyLink): SpotifyLink | null {
  try {
    const saved = JSON.parse(localStorage.getItem(nookSpotifyKey(roomId)) || 'null');
    if (saved?.mode === 'off') return null;
    if (saved?.mode === 'custom' && typeof saved.url === 'string') {
      const link = parseSpotifyLink(saved.url);
      if (link) return withSpotifyMetadata(link, saved);
    }
  } catch { /* An unavailable or stale cache must not hide the nook's playlist. */ }
  return recommendation;
}

export function saveNookSpotifyLink(roomId: string, link: SpotifyLink | null, curated = false): void {
  try {
    localStorage.setItem(nookSpotifyKey(roomId), JSON.stringify(!link ? { mode: 'off' } : curated ? { mode: 'curated' } : { mode: 'custom', url: link.url, title: link.title, curator: link.curator }));
  } catch { /* Playback still works for the current visit when storage is unavailable. */ }
}

/** Display labels are optional; neither cached labels nor event payloads can change the embed URL. */
export function withSpotifyMetadata(link: SpotifyLink, metadata: unknown): SpotifyLink {
  if (!metadata || typeof metadata !== 'object') return link;
  const value = metadata as Record<string, unknown>;
  const text = (input: unknown, maximum: number) => typeof input === 'string' ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum) : '';
  const title = text(value.title, 120);
  const curator = text(value.curator, 80);
  return title ? { ...link, title, ...(curator ? { curator } : {}) } : link;
}

/** Accept share links, copied embeds, or Spotify URIs; never embed an arbitrary URL. */
export function parseSpotifyLink(value: string): SpotifyLink | null {
  const input = value.trim();
  let kind: string, id: string;
  const uri = /^spotify:(track|album|playlist):([a-zA-Z0-9]{22})$/.exec(input);
  if (uri) {
    [, kind, id] = uri;
  } else {
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.port || url.username || url.password) return null;
      const path = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist)\/([a-zA-Z0-9]{22})\/?$/.exec(url.pathname);
      const legacyPlaylist = /^\/user\/[a-zA-Z0-9._-]+\/playlist\/([a-zA-Z0-9]{22})\/?$/.exec(url.pathname);
      if (path) [, kind, id] = path;
      else if (legacyPlaylist) { kind = 'playlist'; id = legacyPlaylist[1]; }
      else return null;
    } catch { return null; }
  }
  return {
    uri: `spotify:${kind}:${id}`,
    url: `https://open.spotify.com/${kind}/${id}`,
    embed: `https://open.spotify.com/embed/${kind}/${id}?theme=0`,
    kind: kind as SpotifyLink['kind'],
  };
}

export function savedSpotifyLink(): SpotifyLink | null {
  try {
    const link = parseSpotifyLink(localStorage.getItem(spotifyKey) || '');
    if (!link) return null;
    try {
      const metadata = JSON.parse(localStorage.getItem(spotifyMetadataKey) || 'null');
      return metadata?.url === link.url ? withSpotifyMetadata(link, metadata) : link;
    } catch { return link; }
  }
  catch { return null; }
}
