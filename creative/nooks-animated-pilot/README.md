# Quiet public-nook animation pilot

Three 7-second, 1280 × 720, 24 fps silent H.264 loops, made from the exact new public-nook stills. The existing WebP images remain the poster and reduced-motion fallback.

| Nook | Localized motion | Playback asset |
|---|---|---|
| Rainy Library | Rain behind window panes, faint steam over the existing coffee cup, low-amplitude practical-light glow | `/videos/nooks-animated-pilot/rainy-library.mp4` |
| Howl’s Moving Study | Stove flame, cup steam, tiny movement of the existing sleeping gray cat | `/videos/nooks-animated-pilot/howls-moving-study.mp4` |
| Gryffindor Common Room | Fireplace flame, candle flames, tiny movement of the existing sleeping orange cat | `/videos/nooks-animated-pilot/gryffindor-common-room.mp4` |

## Generation and finishing

- Higgsfield Seedance 1.5 Pro, 8-second 720p image-to-video, audio disabled.
- Each exact source artwork was supplied as both first and last reference frame. Camera movement, new subjects and scene changes were excluded in the prompt.
- Existing credits only: 206.07 before, 191.67 after; total 14.40 credits. Three successful generations. The plan's two-job concurrency limit rejected one initial request; that request was then submitted after a slot became available. No purchase, upgrade or paid regeneration.
- A feathered alpha matte restricts the generated pixels to actual windows, fire openings, cup steam and existing animals. The original illustration provides the static plate; the scene is not replaced wholesale by generative video.
- A one-second tail/head overlap makes a seven-second forward-running loop without reversing rain or fire. Muted, fast-start MP4. No separate ambient audio is included.
- Finishing fixed a luma-mask conversion issue that initially introduced unintended background shimmer. Final files use an explicit alpha channel.

## Review and scope

Source artwork and first/middle/last final frames were visually reviewed, including enlarged fireplaces and sleeping cats. Composition and furniture are held steady; no new creatures or camera movement are visible in the finished frames. Full-frame decode and `qa-metrics.json` verify dimensions, duration, absence of audio, temporal stability outside the motion mask, brightness variation and the loop boundary.

These are subtle cinemagraph pilots, not hand-rigged character animation. The sleeping animals remain in place. In-app playback, reduced-motion handling, visibility pausing and room switching are integrated and checked by the parent task; these media-only files do not change UI behavior themselves.

Commit the three public MP4s, this brief, `generation-spec.json`, `manifest.json`, `qa-metrics.json`, `generate.py`, `finish.py`, `review.py`, `.gitignore` and the three `prompt.txt` files. Raw generation responses, hosted media URLs, downloaded masters and temporary images are intentionally ignored. Rebuilding uses Python with Pillow/NumPy, ffmpeg and ffprobe. `generate.py` uses existing authenticated Higgsfield CLI access and consumes credits; finishing/review do not.
