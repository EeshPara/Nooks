# Nook soundtracks — October 7, 2026

The active public catalog uses 34 public Spotify playlists matched to its 50 scenes. The full mapping, source URLs and research limitations are in `creative/nooks-50-backgrounds/spotify-research.json` and `.md` at repository root. `ui/src/world/nookPlaylists.ts` is the runtime catalog; retired nooks retain their soundtracks.

The main music widget defaults to the active nook’s recommendation. A manually chosen link or stopped state is saved per nook on this device. Choosing the nook default follows future curation changes. New nooks offer their own soundtrack without inheriting a previous nook’s global playlist; music never autoplays on entry.

Open playlist loads Spotify’s official embed without a developer Client ID. Closing the popup keeps that iframe mounted; Stop listening removes it. Changing nooks replaces the player. Direct Spotify links remain available when an embed cannot play. Existing authenticated SDK playback remains supported. Spotify controls track availability and may limit signed-out embeds to previews; full-track playback is not guaranteed.

Browser verification: Rainy Library loaded the Reading lofi embed and its preview changed to Pause after Play; outside click and X both closed the popup. Entering Stardew changed the widget and link to Calming stardew valley songs. No paid service or account setup was used.

Embed reference: https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed
