# Nooks intro release

Published 2026-10-04 (America/Chicago).

- Existing private Nooks Site: appgprj_6abf1d6c87c08191b8c6f30bc0267fe9. Audience unchanged.
- Source commit: e210fae94300582b3cc40a2833ac43cf0b0fb7ea.
- Deployment: appgdep_6ac321022db481918a3018dd146d7fa6, succeeded.
- Public media URL: https://nooks-study-space.vercel.app/media/opening-film/nooks-opening-v3.mp4
- Vercel deployment: https://nooks-study-space-4myzszrvb-eeshpara-1663s-projects.vercel.app
- Replay: About Nooks → Watch opening. App tool: nooks_present {presentation: opening}. Automatic first-visit playback remains disabled.
- Film: 11 seconds; original warm ambience/camera motion sound mix; current Nooks logo and library landing.
- Widget rewrites build-registered MP4 to the pinned allowed HTTPS origin, never embeds video bytes.
- Explicit replay preserves mounted study material and notes; close, enter, Escape, host navigation and owner changes dismiss safely.

## Verification
- 45 intro/app-tool/bridge tests and 32 cloud/server tests passed; TypeScript and cloud build passed.
- Public staging: 84 related tests, package guard and isolated API construction passed.
- Public video: HTTP 206, video/mp4, valid range; first-frame poster HTTP 200.
- Live browser playback reached readyState 4, playing, unmuted, no media error. Full playback returned to same Moss Watermill nook with unchanged paused focus time.
- Updated native workspace_render returned authenticated Supabase workspace. New embedded panel appeared as tab 11, but inspection timed out and it subsequently became unavailable. Full native playback is not yet verified. Existing old plugin instances and unsaved drafts were not closed/reloaded.

Unrelated pending primary backend/artwork changes were not included. No database or billing changes.
