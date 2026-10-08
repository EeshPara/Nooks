# Local browser user-flow checks — October 8, 2026

Chrome tested the built public UI at http://127.0.0.1:5190 using a separate disposable local origin. This is device mode, not public authenticated or native-host acceptance. Development HMR at port5189 interrupted onboarding; switching to a stable built preview removed that testing interference.

Verified through actual UI actions:
- Name/avatar selection, welcome letter, tour opening and explicit skip; onboarding stays completed after refresh.
- Library → New material → Write a note. Title and content autosave indicator reached Saved. Reload and reopen retained both exact values.
- The Notes quick-create opens an honest ChatGPT handoff dialog, and its X dismisses it.
- Ambience Play enters running state, mixer opens, Mute changes both mixer and global playback state. No app warning/error observed; only unrelated Grammarly extension warnings in console. This is playback-control evidence, not subjective listening.
- Room discovery lists50; Comfy Cabin selection transitions the workspace, preserves saved material, keeps muted audio, updates reward/playlist context.
- One-minute focus timer starts and continues while navigating to Library and quiz.
- Quiz correct answer locks with correct explanation; wrong answer locks, identifies the right answer, and advances checked progress.

Further checks and final asset build acceptance are ongoing. The currently inspected build predates full50 video mapping and the subsequent inactive-audio release fix.

Automated checks at this checkpoint: public UI466/466, development UI476/476, native UI465passed/1existing skip; public backend66/66, cloud299/299 and Site checkout298/298. Subsequent audio resource fix passed31 focused tests and TypeScript in all3snapshots; heartbeat jitter regression6/6. Counts describe overlapping snapshots, not unique tests.

Completed the five-question quiz through actual UI: four correct and one deliberately incorrect produced80%, correct missed-answer review, and Practice saved. Case-insensitive short answer `atp` graded correctly. The one-minute timer completed while studying; returning to Comfy Cabin showed14minutes remaining to the15minute reward (6% progress), confirming one minute credited in device mode.

Further actual browser checks on the updated built preview:
- Empty room search shows an honest zero-result state; Clear restores all50. Exact room-name search returns one matching room. Favoriting updates immediately; Escape dismisses discovery and returns focus to the Nooks navigation control.
- Added a task with Enter, marked it complete, reloaded: title and completion persisted.
- Found and fixed task-entry focus loss: the input was disabled while saving, so its early `.focus()` could not take effect. It now stays read-only and `aria-busy` while saving, preserving the existing duplicate-submission guard. After rebuilding, two consecutive tasks were entered with Enter without refocusing; AX and DOM both confirmed focus remains on New task.
- Temporary viewport capability override did not change the page dimensions (still1536×711), so no mobile-layout pass is claimed. Override was reset.

Added a visible Background animation toggle using the existing playback setting, persisted on this device. Actual built-app acceptance: switching off changed the AX state and paused the video (readyState4); after reload motion stayed off and no video source was loaded (readyState0); switching on loaded the expected Comfy Cabin clip and resumed muted playback (readyState4). Existing playback/reduced-motion lifecycle and manifest tests passed. Sound remains an independent control.
