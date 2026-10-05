# Nooks interaction audit

Reviewed 2026-10-01 against the changing local implementation. Test surface: **isolated `http://127.0.0.1:8791`**, a fresh headless Chromium profile, desktop 1440×1000 and mobile 390×844. The user's preview ports 5173/8787 and saved browser profile were not used. Temporary study data was confined to the isolated demo workspace; original note text was restored after save tests.

This is a control-family inventory, source review, and recorded browser exercise. It is **not** proof that every permutation works, a ChatGPT-host integration test, an accessibility certification, a Supabase deployment test, or a load test. The library was replaced during this audit; earlier grid/sort results describe the earlier build, while the course/topic flow below covers its replacement separately.

## Important outcomes

- Saved focus credit alone unlocks a keepsake. The current session has a separate striped progress preview and an explicit unsaved/paused/saving/retry label. At 899 saved seconds plus 2 live seconds, the collection still shows **0/4**. Its accessible saved percentage is 99, not a rounded-up 100.
- A failed note save retains the complete edited draft. Retrying saves it. The test then restored the original text.
- A real short focus session recorded **5 active seconds**, excluded approximately **5.5 seconds of paused time**, and earned **0 XP**. A deliberately failed finish request did not change saved progress; retry saved the session once. A break survived refresh without creating focus credit or XP.
- The reward celebration is a reusable component that accepts only confirmed rewards from its caller. It does not infer an unlock from a running timer. It has no automatic sound, confetti, expiry, or timed dismissal.
- Collection and celebration browser fixtures passed keyboard containment, Escape, focus restoration, placement failure/retry, a three-object cap, and reduced-motion behavior. Fixture results prove UI behavior under supplied states, not backend authorization.
- No uncaught browser page errors occurred in the completed main interaction run. A malformed slider value and an early pause assertion were test-script mistakes, corrected against the actual slider range and acknowledged pause state.

## Control and state inventory

Evidence: **Browser** means the action was exercised in the isolated preview; **Fixture** means a browser-only controlled component state; **Source** means the branch was inspected but not fully exercised; **Gate** means a required later integration check.

| Surface and controls | State / failure / persistence contract | Evidence and remaining limits |
| --- | --- | --- |
| Main navigation, home logo, mobile navigation | Change visible area; preserve active focus; protect dirty notes before leaving | Browser: desktop tabs loaded. Mobile home and collection fit viewport. Every mobile tab and dirty-note exit combination not exhaustively tested. |
| Home quick intentions: checkbox, add field, submit | Toggle/add saves through the plan tool; pending requests must prevent duplicate or stale whole-plan writes | Source: reported the missing immediate/pending guards; root added them. New home guard still needs a rapid-submit regression exercise. |
| Pomodoro length, presets, custom input | Clamp to allowed duration; active session prevents changing its target | Browser: one-minute target and active controls. Source: allowed 1–180 minutes. Server remains authoritative. |
| Start, pause, resume, finish, reset | Start creates one session; pause stops eligible elapsed time; finish waits for save; reset cancels without new credit | Browser: start/pause/reload/resume/failed finish/retry. Interrupted one-minute test cleanup found no remaining active session. Duplicate completion protection needs backend evidence as well. |
| Short and long breaks | Separate non-earning timer; no focus session or XP creation; survive refresh | Browser: short break resumed after reload and reset, with unchanged focus-session count and XP. Long-break branch shares the hook but was not separately waited out. |
| Switch nook while focusing | Session retains originating nook; destination must not display its live seconds or receive its credit | Source: parent captures and displays originating nook. Initial browser switch hit profile onboarding; the final retry timed out waiting for button stability under concurrent browser load before starting. Neither is counted as a completed binding test. A later API check confirmed zero active sessions. |
| Saved collection progress | Solid bar is persisted time; live preview cannot change earned count or enable placement | Fixture: 899+2 seconds shows pending-save copy and 0/4. Browser: actual running/paused preview and cleared preview after save. |
| Collection open, close, backdrop, Escape, Tab | Dialog contains keyboard focus and returns it to its launcher; pending placement does not dismiss | Browser and Fixture: containment, Escape, return focus. Mobile collection bounded to 362px within 390px viewport. |
| Surprise details | Show exact threshold; allow revealing the item before earning it | Browser: reveal removes concealment without changing ownership. No new catalog thresholds activated. |
| Place/remove keepsake | Only saved earned items; maximum three; remove frees capacity; async failure retains ownership and supports retry | Fixture: full display blocks fourth; remove enables fourth; successful place updates display. Browser fixture verified rejection then retry. Server authorization/load races not inferred from UI tests. |
| Play earned track / visit earned child nook | Controls appear only for earned perks; use parent callbacks; no credit reset | Source: gated by saved unlock state in journey and parent. Actual unlock-specific audio and child-view navigation remain Gate. |
| Reward celebration | Parent shows once per confirmed completed session; dedupe repeated reward IDs; optional placement saves before success | Fixture: duplicated input ID produces one item; failed place stays retryable; success disables placed button; Escape returns focus; reduced motion removes animation. Parent session deduplication is source-reviewed, not a multi-device proof. |
| Earlier library search/filter/sort/grid/star | Empty search clears safely; filter/query combine; view state does not alter artifacts | Browser: search empty, type filter, sort and grid/list switching. Superseded by the course-based library; these are not claims about current controls. |
| Current library courses/topics/materials | Empty scopes remain useful; moving an item updates its location without opening a partial artifact | Source plus dedicated current-build browser flow recorded below. Course deletion/archive and cross-account isolation are separate backend/management checks. |
| Saved study summaries and Continue | Explicitly reviewed summary and selected artifact references persist; Continue retrieves only the chosen scope | Source plus dedicated browser flow below. Summary form's misleading “Keep as draft” label was changed to “Close”; unsaved form state is not a durable draft. |
| Library History | Shows recorded practice/focus, opens the full linked artifact, scopes to selected organization | Source: only recorded events are selected. Empty history and every filter permutation still need targeted checks. |
| Note read/edit, title, Markdown, source details | Click to write; autosave queues the current draft; source content is rendered as text/controlled Markdown; dirty exit protects writing | Browser: merged click-to-edit, title/body autosave, failure/retry/reload. Earlier source disclosure check passed. Source: raw HTML is not executed. Malicious-link/file corpus not run. |
| Note autosave / keyboard save / download | No Saved status until confirmed revision; failure retains draft; download uses current Markdown; newer typing queues behind the in-flight write | Browser: delayed first save plus newer typing produced two serialized revision-aware writes; injected 503 and explicit retry passed; reload preserved latest text. Source: keyboard flush and Markdown download. Downloaded bytes remain a targeted follow-up. |
| Note appearance and contents navigation | Changes are per-note display preferences; section links use reduced-motion-aware scroll | Source: appearance callbacks and heading navigation. Not all typography/paper combinations or persisted cross-device appearance tested. |
| Note-to-card/quiz/exam, text selection actions | Send selected source to ChatGPT; never pretend a study set was saved without a tool result | Source and browser chat handoff behavior. Actual ChatGPT generation/save loop is Gate. |
| Note history, compare, restore, AI suggestion apply/discard | Viewing old text must not replace the open note; writes require current revision; dirty local draft blocks replacement | Source plus current-build browser flow below. Two-tab conflict, stale AI suggestion, and truncated-page fixtures remain Gate. |
| Flashcard flip, hint, review again, got it, shuffle | Rating disabled until reveal; one rating per turn; repeat queue preserves first-pass score; scope remains original nook | Browser: six-card run with one repeated card gave five first-pass recalls; review list and restart worked. Hint and shuffle source-reviewed; their full branch combinations not tested. |
| Flashcard completion / retry | Completed session ID is stable; save failure must remain visible and retryable | Browser: normal completion. Source: root queue retains pending events in memory. Refresh durability remains a launch issue below. |
| Quiz options / short answer / check / previous / next | Answer required for quiz check; checked answer locks; exam hides feedback until submit | Browser: five-question quiz, disabled empty check, feedback, locking, results. Short-answer normalization source-reviewed; full free-response edge-case corpus not run. |
| Quiz flag, overview, review filters, restart | Flags do not alter correctness; overview keeps original option indices; missed/all review shows submitted responses | Browser: flag and all-answer review; source: option shuffle retains original indices. Every exam skip/review/submit branch remains follow-up. |
| Quiz/card global keyboard shortcuts | Must abstain while any modal or native open dialog is active, and while typing elsewhere | Source issue reported and root fixed both `[aria-modal="true"]` and `dialog[open]` guards. Organization dialogs now explicitly declare modal state. New shortcut guard still needs final-build regression check. |
| Match game source picker, tiles, restart | Choose an eligible set; same-side selection does not count; mismatch resets; complete once; restart creates new session | Browser: all six pairs matched, completion and restart passed after correcting dialog-scoped test selectors. Server trust/anti-abuse not inferred. |
| Sprint game source picker, answers, next, restart | Only eligible multiple-choice questions; choice locks feedback; completion emits one session | Browser: source selected and sprint opened. Full sprint completion remains Source, not a reported pass. |
| Create material: kind, ChatGPT/manual mode, cards/questions/options | Empty/invalid input shows errors; correct option survives option deletion; pending saves cannot silently duplicate | Fixture: empty send disabled, source-only generation, explicit conversation shortcut, manual cards/hints, short-answer exam/alternatives/explanation, removed-correct-choice validation, stable ID on failed-save retry, and Enter prevention passed. Native ChatGPT generation/save is still Gate. |
| Study plan add/edit/cancel/complete/delete | Validate title/date; preserve edit buffer on failure; pending guards serialize; completed controls remain reachable | Browser: add, edit, complete, expand completed, delete test step. Error injection and all date boundaries remain follow-up. |
| Chat composer: empty, multiline, Enter, IME, pending, retry/copy | Empty submit disabled; Shift+Enter newline; IME does not prematurely send; native failures preserve prompt | Browser: empty guard, multiline, Enter, labeled sample transcript and return to nook. Source: IME handling, native pending/retry/copy. Real native message bridge is Gate. |
| Conversation collapse, copy, sample card/quiz | Preview never represents generated content as live ChatGPT output; collapse returns scenery | Browser: conversation/return. Copy permissions and sample card/quiz branches source-reviewed. |
| Nook discovery search/category/sort/detail/back/join | Clear no-results route; returning restores prior list; demo people explicitly disclosed | Browser: no-results/reset/sort/detail/back/Escape. First join requests profile before entry. Public realtime counts are not verified by this demo. |
| Community tab, member card, leaderboard | Minimal opt-in study stats; mock population remains clearly labeled; production uses permissioned API | Source: separate demo/live implementations. Actual two-account joins/presence/invites/ranking are Gate. |
| Profile name/avatar/save | Trim/limit name, choose avatar, disclose local preview vs account save | Browser: dialog/controls/Escape. Source: preview profile is local. Production profile save/permission behavior is Gate. |
| Personalization: background/category/upload/name/layout/weather/save/cancel | Preview first; failed save preserves changes; image formats/size bounded; no unexpected generation charge | Browser: dialog, all 31 choices present. Source: upload optimization and manual native-image handoff. Invalid image corpus and full save/cancel rollback combinations remain Gate. |
| Generate a nook | User sends a scene brief to ChatGPT, then explicitly imports chosen image; no automatic image handoff claim | Source: prompt explicitly says manual download/upload. Native generation capability and import remain Gate; see `nook-creator.md`. |
| Current creator Studio: draft/import/private/public/review | Versioned server draft/release state; private-by-default; public publishing subject to implemented review policy | Browser: versioned private draft save, search/reset, dirty close keep/discard, reopen after reload, explicit image-prompt fallback, saved draft preview, mobile/Escape passed. Public/private deployed publication remains Gate; disabled local publishing is verified. |
| Ambient mix start/pause/mute/levels/master | User gesture starts audio; bounded gains; playback survives closing its settings; error visible | Browser: control state start/pause/mute/master 0–100; invalid Spotify URL rejected. Audible quality and headphone/device behavior not assessed by headless browser. |
| Local audio upload/remove | Device-only file stays out of shared nook; revoke URLs and stop on remove | Source: local media engine and teardown. Actual audio file type/error cases remain Gate. |
| Spotify link/change/stop/open externally | Strict supported URL types; Spotify handles playback/account; close/stop must remove player | Browser: invalid non-Spotify origin rejected. Actual Spotify playback, blocked embeds, cookie/login states, and ChatGPT CSP are Gate. |
| Sound island expand/collapse/player choice/volume | Keyboard reachable; collapsed content inert; explicit stop; status does not invent Spotify playback state | Source: playback state tracked for local sources, Spotify labeled as player. Interaction under multiple simultaneous sources remains follow-up. |
| About, settings, share popup | Honest preview/usage-limit copy; dark/compact are preferences; sharing shows exact data scope | Browser: all opened and Escape closed; public sharing was not performed during this audit. Source: separate appearance snapshot; external shared-link lifecycle is Gate. |
| Share link/create/copy/use template | Only appearance and explicitly selected aggregate milestones; no notes or account material | Source: server snapshot whitelist. Revocation, cross-account view, expired link and template import are Gate. |
| Scenery-only mode, weather pause | Tools remain recoverable; motion can stop; reduced motion has a static equivalent | Source: controls present; mobile reduced-motion collection verified. Whole-scene animation and keyboard recovery need final native-host checks. |

## Implemented in this pass

`RoomJourney.tsx`, `RoomJourney.css`, `RewardCelebration.tsx`, `RewardCelebration.css`, `CreateMaterial.tsx`, and `CreateMaterial.css` were changed in runtime source by this audit agent. The parent integrated callbacks and session state in `App.tsx`.

1. Added optional `liveFocusSeconds` and `focusState` to Journey. Saved reward calculations remain independent. Invalid numeric focus values are clamped for calculation. The current session is visually distinguished and never used to enable placement.
2. Simplified journey copy to collection, saved minutes, and a next threshold. Removed the old single-art CSS growth representation from the widget; rewards show the actual earned illustrations. Future drawn growth stages remain inactive.
3. Added reveal controls for concealed rewards. Retained stable reward IDs, thresholds, and the existing active catalog.
4. Added an immediate placement gate in addition to pending state, deduplicated placement IDs, retained clear failure/success feedback, and preserved the three-object limit.
5. Added the celebration component with duplicate filtering, optional asynchronous placement, explicit save status, a gentle one-time appearance, accessible labeling, keyboard containment/return, and reduced-motion CSS. Its caller is responsible for server confirmation and session deduplication.

6. Replaced the old icon tiles and dark nested creation form with a compact cream composer. Preserved kind-specific structured prompts and manual builders; added an explicit blank-note callback, immediate submission guard, and optional details.

The creator document's permission wording now describes **owner-only invitations**. A moderator role is not implied by the documentation.

## Remaining issues and release gates

### Before public launch

**Unsent practice results are not durable across component destruction.** `App.tsx` still uses an in-memory pending-event Map with a before-unload warning. Browser refresh protection does not guarantee protection when ChatGPT discards an iframe or a process dies. Add an account-scoped durable outbox or server-issued practice session, replay using the existing stable session ID, and clear it only after acknowledgment. Test failed save → widget teardown → new widget → exactly one saved result. Do not claim a practice result is saved merely because the session screen says complete.

**Real host behavior remains unverified by this audit.** Required evidence includes ChatGPT iframe sizing/safe areas, tool approval states, native conversation handoff, authorized image import, private account switching, disconnection, session reopening, and Spotify frame policy. The standalone preview cannot establish those behaviors.

**Social and creator permissions need deployed two-account tests.** Demo people and local preview profiles are clearly disclosed, but they do not establish live presence, invitations, private-image access, published revision isolation, or moderation operations. Run both allowed and denied access, not only a happy-path join.

**Unsaved/failed completion accounting needs an explicit product rule.** The current authoritative timer records elapsed server time. If a completion request never reaches the server, it cannot know the user locally pressed Finish. Retry may include elapsed time until the accepted request, capped by the chosen duration. This is timer accounting, not verified attention. Decide whether to preserve that documented policy or introduce a trustworthy stop/ack protocol before describing focus time more strongly.

### Polish and follow-up checks

- In-progress quiz/card state is component-local; leaving mid-session loses the queue/answers. Add a clear exit contract or resumable attempt before advertising seamless study continuity.
- The parent fixed modal keyboard and home-plan races reported here. The merged pending-composer Escape regression passed. Card/quiz shortcuts while another dialog is open and rapid home-plan submission still require their own final regression exercise.
- Empty/error/loading views need an account with genuinely no material and injected failures for each new organization/creator tool. The main browser run started from seeded sample study sets.
- Compare note conflicts with two clients, preserve an unsaved human draft when an AI proposal arrives, and test stale proposal rejection. A single-client history restore is only part of this contract.
- Use a real browser/device for audible levels, mobile keyboard/safe-area behavior, reduced-motion scenery, screen-reader navigation, and playlist playback. Headless DOM checks do not validate those sensory experiences.
- The new 31-nook long-term catalog remains proposal-only. Future rewards cannot be advertised as available until their assets, migrations, and placement behavior actually exist.

## Reproduction artifacts

Scripts and raw reports are temporary QA artifacts, not production dependencies:

- `/tmp/nooks-interaction-run.py` and `/tmp/nooks-interaction-results.json`: main browser exercise. Its initial sound failure was a test value outside the integer slider step; corrected in the next artifact.
- `/tmp/nooks-sound-run.py` and `/tmp/nooks-sound-results.json`: corrected sound controls and Spotify validation, passed.
- `/tmp/nooks-focus-test.py` and `/tmp/nooks-focus-results.json`: real isolated timer pause/refresh/failure/retry/break exercise, passed.
- `/tmp/nooks-reward-fixture.tsx`, `/tmp/nooks-reward-fixture-test.py`: browser-only reward boundary, cap, save failure, keyboard, and reduced-motion fixtures, passed.
- `/tmp/nooks-games-test.py`: complete matching game and restart passed; sprint opening only.
- `/tmp/nooks-modal-scan.json`: settings/about/sharing/profile control inventory and Escape results.
- `/tmp/nooks-interaction-collection.png`, `/tmp/nooks-interaction-mobile-collection.png`, `/tmp/nooks-reward-celebration.png`: inspected interaction states.

## Current organization flow

The current-build exercise in `/tmp/nooks-organization-results.json` passed:

1. Created an isolated test course and topic, then moved an existing note into that scope without opening a partial artifact.
2. Edited and saved the note; comparing an earlier version left the current editor unchanged.
3. Restored the earlier text as a new saved version. The original note text was restored.
4. Saved an explicitly reviewed study summary with the selected note attached.
5. Reloaded; the course, topic, and summary persisted.
6. Continued the summary; the client called `context_get` with exactly the selected course, topic, and session IDs.

No uncaught browser page errors occurred. This confirms the isolated local flow, not cross-account authorization or access to arbitrary ChatGPT history.

## Compact creation composer

`/tmp/nooks-create-results.json` records a browser-only component fixture with real component code and controlled callbacks. The light composer measures 620px wide on desktop and 366px at a 390px mobile viewport. Its initial view has one request textarea, text format tabs, and collapsed optional source/title fields. The manual builders remain accessible through “Write it myself.”

Passed: initial focus, empty-submit guard, reduced-motion appearance, Tab containment and Escape return, source-only prompt construction, explicit current-conversation selection, failed request retention, manual cards with hints, stable artifact IDs after retry, no accidental submit from Enter in metadata, removed-correct-option validation, short-answer exam alternatives/explanation, direct blank-note callback, and mobile layout with an expanded scrolling form. No page errors occurred. The fixture callbacks do not prove host delivery or backend save success.

The parent integration previously swallowed `onAsk` failures and could produce a false sent status. This is corrected and verified in the merged app: the local preview explicitly says generation runs inside ChatGPT and retains the request, without a sent-success status. The composer close button was isolated from an older creator CSS selector and remains inside the actual mobile modal. A delayed failed manual save survives Escape and retains the complete draft; the global Escape handler now defers to active modals.

Screenshots: `/tmp/nooks-create-desktop.png`, `/tmp/nooks-create-mobile.png`.


## Private nook studio

The dedicated current-build exercise in `/tmp/nooks-studio-results.json` passed: required name for a new draft, scene search empty/reset, a private draft saved as version 1, dirty-close confirmation (keep and discard), saved draft and chosen scene after reload, disabled local publishing with its explanation, native-image prompt fallback with explicit manual import, using a saved draft as the active backdrop, and mobile layout/Escape. It created only the isolated test draft `IA Nook 13268`. No public publication or invitation was attempted. No page errors occurred.

The image generation fallback generated a prompt, not an image. This test does not establish whether ChatGPT’s native image generator is available in the eventual host. Shared custom-art publication remains intentionally unavailable.


## Merged composer and note autosave

`/tmp/nooks-final-integration-results.json` passed on the refreshed isolated server with the merged build:

- Global New opens the compact composer; the mobile close button stays within its bounds. Practice creation starts with Quiz selected.
- Local ChatGPT generation correctly reports unavailable rather than claiming delivery. The request remains editable.
- A deliberately delayed manual save remains open when Escape is pressed. A 503 response preserves the entered card and restores usable controls.
- Blank note opens directly with the body focused. Typing newer text while the first autosave is delayed produces exactly two serialized writes; the second uses the returned revision from the first.
- An injected autosave failure preserves writing. Explicit Retry saves it. Reloading and reopening the note preserves its title and latest content.
- At 390px, the note has no horizontal overflow and its direct Flashcards and Quiz actions are available.

No page errors occurred. Screenshots: `/tmp/nooks-autosave-integrated.png`, `/tmp/nooks-note-integrated-mobile.png`, `/tmp/nooks-create-integrated-mobile.png`, `/tmp/nooks-create-integrated-desktop.png`.

The parent fixed the reported low-contrast tools over the bright Cherry Garden backdrop. Updated screenshots `/tmp/nooks-note-final-desktop.png` and `/tmp/nooks-note-final-mobile.png` were visually inspected: the tool backing is readable, direct Exam is available, the mobile New button is at least 40px tall, and there is no horizontal overflow.

## Final dismissal regression

The final narrow check in `/tmp/nooks-final-focus-restore-results.json` passed after the parent fixed explicit launcher restoration:

- OrganizationDialog Escape closes and returns focus to Create course.
- OrganizationDialog Close with reduced motion returns focus to that launcher.
- Studio Escape returns focus to Explore nooks when its original discovery launcher has been unmounted.

Collection Escape and launcher focus passed in the earlier final check. The separate organization agent verified Discovery, Community, and Personalization dismissal; those are not represented as this agent's completed combined script. No page errors occurred in the final narrow check. An API inspection confirmed **zero active focus sessions** after the interrupted binding attempt. No further test expansion was performed.
