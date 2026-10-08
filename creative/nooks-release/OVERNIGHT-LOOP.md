# Nooks overnight improvement loop

Authorized October 8, 2026: keep testing, fixing, independently grading and making small, justified product improvements. Preserve the existing Nooks services and user work.

## The loop

1. **Test like a student.** Exercise onboarding, notes, practice, timers, rooms, ambience, account changes and sharing. Include reloads, failed requests, reconnects, keyboard use and narrow layouts. Record the exact build and a reproducible failure.
2. **Grade independently.** Assess functionality, experience, media, performance, security and production readiness. Separate observed behavior from source inspection and untested assumptions.
3. **Fix the most consequential issue.** Prioritize data loss, access isolation, broken journeys and resource problems before cosmetic improvements. Give agents separate file ownership.
4. **Add small improvements when evidence supports them.** Favor clearer saving/recovery feedback, accessible controls, calm transitions and fewer unnecessary downloads. Avoid speculative large features and new paid services.
5. **Verify and checkpoint.** Reproduce the original case, run affected tests, review the result independently and commit/push a coherent change. Publish through the existing guarded release paths and verify the actual deployment.
6. **Regrade and repeat.** Keep failures and limitations visible. Move to the next supported improvement; unchanged tests do not become stronger evidence through repetition. Leave a clear owner action for external dependencies.

## Current checkpoint

- Live public release: `c4t3ni42i` at https://nooks-study-space.vercel.app, HTML/manifest `640128902cacc8f377e1a477`. Native version 40 remains owner-private, source `a72d3fe9a695035f0ea4e525a00d02653ad138d4`.
- All 50 final animations and their ambience presets are deployed. Exact hashes, full decode checks, sampled motion/seams and source parity passed. Public browser checks cover scene changes, audio controls, motion preference and narrow layouts. Continuous playback, headphone listening and physical-phone performance remain unproven.
- The public release includes deferred editor loading/retry, bounded retention of prior frontend assets, truthful guest copy, current Studio drafts in My Nooks, Save focus preservation and defensive Node disconnect handling. Current asset checks passed 75/75; compatibility checks passed 23/23. Hosted cancellation savings are not claimed.
- Metadata-only Studio listing, hidden unsaved Studio account-change protection and shared-library owner/invitation lifecycle protection are now published. Affected tests, builds and independent review passed; mounted simulated-account browser tests cover delayed failures, pending saves, discard/focus, StrictMode and stale private responses. Actual public 390-pixel rendering, saved-draft discovery and close/focus passed. Real email/authenticated sharing and native iframe acceptance remain separate gates.
- A fresh disposable authenticated probe passed configuration, workspace and owner-scoped empty draft listing on this release; account/Auth/session cleanup and guarded topic cleanup completed.
- The previous bounded public test passed 100 identities, 100 sockets/300 channels and 873 requests without errors; p95 was 364 ms. Its 120.605-second wall window included a reconnect pause. It is not a 1,000-user or long-duration result.
- Two longer attempts are preserved as incomplete. The first stopped in channel setup because a sessionless test-client token was replaced; a corrected two-account hosted proof passed heartbeat, reconnect, denial and cleanup. The second reached 6 minutes 15 seconds with 100 sockets/300 channels before the test scheduler clipped a profile request against its own quiet deadline. Local reproduction and independent tests support the scheduler correction. Both runs removed all 100 accounts and five rooms, followed by guarded removal/verification of their exact 105 throttle topics.
- One final corrected 15-minute, five-room soak started at 12:02:56 UTC on the fixed release. Enrollment completed and the first measured minute passed with zero unexpected errors. The run is still active; no final result is claimed. Keep publishing frozen through cleanup; no further retry is authorized.

## Grades and external gates

Current independent grade: **7.5/10 product quality; 6.5/10 production readiness**. Email onboarding still blocks a public launch: custom SMTP is not configured, and the owner has been asked for the existing provider/domain. Do not disable verification to bypass this dependency.

Actual native iframe acceptance, public signed-in browser journeys, sensory/physical-device review, scheduled authenticated alerts and isolated hosted recovery remain open. Existing database backups do not establish Storage-byte backup or a successful restore. The authenticated probe is implemented and passed disposable-account checks; persistent scheduling and alert delivery are not configured.

## Operating boundaries

- Agents work in batches within the available concurrency limit. Do not claim forty simultaneous agents.
- Use existing Nooks hosting, Supabase and plugin identities. Never touch unrelated projects, buy upgrades or change audiences without an explicit request.
- Keep credentials and fixture secrets out of Git and reports. Clean only exact disposable fixture resources with ownership/absence guards; preserve the shared directory topic.
- Caffeinate started around 02:01 Chicago time for 12 hours and remains active. It keeps the Mac awake; it does not restart an ended agent session. Preserve resumable checkpoints.

## Evidence and handoff

See [independent grade](final-independent-grade.md), [Studio browser acceptance](studio-account-switch-browser-qa.md), [metadata review](studio-draft-metadata-independent-review.md), [failed soak evidence](deployed/soak-results-2026-10-08.md), [corrected realtime proof](deployed/realtime-auth-diagnosis-2026-10-08.md) and the timestamped deployed reports. `START-HERE.md` records service identities and publishing instructions.

The morning handoff should identify the latest deployed builds, what changed, measured results with their limits, final grades, remaining reproducible defects and the smallest owner action needed to unblock launch.
