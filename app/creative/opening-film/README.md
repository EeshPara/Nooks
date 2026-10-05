# Current release status — October 5, 2026

The accepted V3 film is complete and deployed. Use `exports/nooks-opening-v3.mp4` (11 seconds), `assemble-v2.py` for visuals and `mix-soundscape.py` for the warm ambience. The user removed the forest/green detour; do not revert to the original four-world cut. The current plural Nooks logo is composited in post and fades into Rainy Library. Watch intro replays it in the existing workspace.

For rebuilding, install ffmpeg/ffprobe on PATH and Python packages Pillow and NumPy. Scripts reuse the included rendered title overlays. To deliberately rerender typography, set `NOOKS_FONT` to a local TrueType font path and remove the relevant generated overlay first. Fresh video generation requires Higgsfield sign-in on the new computer; completed assets can be used without that or further credits.

Raw generation-job responses/logs were omitted from this portable export. All reviewed source clips, sound stems, final videos, frames, references and prompts remain.

## Historical planning notes (superseded)

# Nooks opening film

Status: V2 flight keyframes are selected. Higgsfield is authenticated on the existing Starter plan with 270 credits supplied by the user. The first real flying-camera pilot and Tokyo-to-forest transition have completed. The remaining matched-endpoint shots are rendering; see higgsfield-readiness.md and jobs/. Final assembly, playback review and product integration remain pending.

Open index.html through a local static server for the current visual board. Chosen stills are frames/01-liftoff-v2.png, 02-tokyo-flight-v2.png, 03-forest-flight-v2.png, 04-neon-flight-v2.png and 05-home.png. index-v1.html preserves the first board for comparison. frames/05-home-v1.png is the discarded busier final composition; the revised final contains the cat only.

All images were produced with the built-in image_gen tool. Exact initial prompts, input reference paths and timing are in storyboard.json and prompts/. references/characters-v1.txt is the character-sheet prompt. The final targeted edit is prompts/05-home-refine.txt. No Higgsfield credits were consumed in this stage.

## Original film plan (superseded by flight-direction-v2.md)

- 0–3s: lamp-lit attic, pencil and rain. Camera rises toward the window.
- 3–6s: Tokyo apartment, bunny studying, warm creature-occupied windows across the street.
- 6–9s: woodland table with capybara and bunny; the empty chair is an invitation.
- 9–12s: fantastical rooftop study café in a blue/lavender neon skyline.
- 12–15s: settle at the Rainy Library desk with the sleeping orange cat. Composite a real wordmark and the exact tagline: Your little study nook in ChatGPT.

One coherent illustrated universe. No humans, visible human hands or human reflections. No generated readable typography. End-card `nook` in the board is a composition study, not a production app rename (current app remains Nooks).

## Motion production gates

1. User sees the references. Restore Higgsfield authentication/workspace access; inspect actual available models and schemas before choosing animation parameters.
2. Generate controlled individual shots from these keyframes with coherent forward camera travel, small blinks, breathing, steam, curtain/rain movement. Keep creature anatomy and cast identities stable.
3. Conceal scene changes behind a window post, foreground foliage or an arch. Do not morph unrelated architectures into each other. No spinning, sudden zooms or fast high-contrast flashes.
4. Limit background creature motion in the neon shot. Preserve parallax and contact; no floating sprite overlays.
5. Assemble a 15-second cut. Add clean typography in post. Muted by default, optional original/licensed sound; no copied Lofi Girl audio.
6. Review representative and boundary frames for anatomy, contact, camera direction, drawing-style continuity, flicker and clean final landing. Export web-friendly video/poster. Mobile needs deliberate framing, not arbitrary center crop.
7. Integrate ui/src/onboarding only after final assets exist: explicit new-user eligibility, immediate Enter/X/Escape, remembered dismissal, reduced-motion still, load-failure fallback, About replay. Never interrupt an active native chat/artifact or unsaved work. Verify browser and native host playback before release.

The opening UI is implemented but not mounted or deployed. Do not ship a broken video URL or present this still board as finished animation.
