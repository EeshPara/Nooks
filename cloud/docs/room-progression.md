# Nook room progression

The first implementation gives every curated nook an independent saved collection. There are 31 selectable rooms, a shared custom-artwork track, four discoveries per track, and two hidden rooms reached through earned rewards. The shared authored catalog lives in `ui/src/world/room-rewards.json`.

## Earning and keeping rewards

- Focus sessions capture their originating room when started. Changing scenery during a session does not redirect its credit.
- Credited active seconds exclude pauses and are capped at the chosen session length. Finishing early saves the actual elapsed time; resetting cancels the session. Only full sessions receive focus XP.
- Room milestones are 15, 45, 90, and 180 credited minutes. Repeated completion requests cannot credit time twice. Completed practice is tracked separately and does not invent focus minutes.
- `workspace.roomProgress[roomId]` stores `focusSeconds`, `sessions`, `practices`, and `placed`. Earned items are derived from the catalog thresholds. `room_reward_place` validates ownership, room membership, and the three-object display limit on the server.
- A first-time migration never assigns old completed study time to an arbitrary room. Existing active sessions receive a baseline; only later time counts toward their captured room.
- Nine growth rooms keep one plant or coral illustration that increases in display size with credited progress. Collection rooms build a shelf. Hidden discoveries stay sealed until earned.

## Perks

Brooklyn and Paris can unlock the original procedural **Vinyl evening** track; Tokyo and the canal apartment can unlock **Moonlit piano**. Playback starts only after an explicit Play click and includes volume, mute, pause, and teardown cleanup.

The candlelit tower unlocks the **Moonstone annex**. The Mosslight dungeon unlocks the **Crystal vault**. These are actual alternate illustrated rooms with a return control; study progress remains assigned to the parent nook.

Public shares can include a read-only snapshot of three placed decorations. They exclude private room progression and never grant reward ownership to a person copying the room's appearance.

## Boundaries

The app records elapsed focus time and submitted study results. It does not claim to measure attention or ChatGPT token consumption. Room creatures remain static collectible artwork; free-moving companion animations remain disabled until scene-specific animation and placement are ready.

User-authored reward rules, publishing explorable custom worlds, other people earning a creator's prizes, and an open-ended progression economy are future features. Current custom artwork uses one shared `custom` track, not separate creator-authored worlds.

## Generated assets

The four collectible atlases contain 32 original painted objects. The built-in image generation tool produced them and the three dungeon/hidden-room scenes. Exact prompt sets are saved in `nook-reward-prompts.json` and `nook-hidden-room-prompts.json`. Runtime image paths are in `RewardDrawing.tsx` and the room catalog; original images are retained separately during runtime encoding optimization.

## Verification

Backend regression coverage includes the unlock boundary, paused time, partial sessions, room changes, duplicate/concurrent completion, account isolation, legacy migration, persistence, placement limits, and public-share privacy. Browser checks used an isolated temporary workspace for earned rewards, confirmed three-object placement, a disabled fourth placement, the hidden-annex transition, and persistence after reload. The user's workspace was not given test rewards.

Final verification: TypeScript and the production build passed; all 40 automated regression tests passed. Browser checks also confirmed selected-text actions, note-context chips, sample flashcard flipping, a multiline composer, and the earned soundtrack moving from Play to Pause and closing. At a 390×844 viewport, a discovered CSS precedence bug was corrected: the composer measured 364 pixels wide with 13-pixel side margins, and document width remained 390 pixels. Final screenshot capture repeatedly timed out in browser automation, so visual capture and native-host rendering remain unverified; no screenshots are represented as completed evidence.
