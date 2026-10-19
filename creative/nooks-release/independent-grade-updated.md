# Independent updated quality and readiness grade

Reviewed October 8, 2026. Interim review while implementation continues. This supersedes resolved findings in `independent-grade-initial.md`; it is not release approval.

**Product quality: 6.5/10, provisional. Public multi-user production readiness: 4/10, not ready for a broad launch.** Backend evidence has materially improved. Public onboarding, final asset coverage, sustained deployed capacity and operational recovery still prevent sign-off.

## What I independently inspected

Current audio, account subscription and community refresh source; current three film manifests; final Neon Tokyo technical report; hosted verification script and reports `report-2026-10-08T06-36-51.463Z.json` and `report-2026-10-08T06-42-43.803Z.json`; local scaling report; independent SQL security review; prior acceptance documentation. I did not rerun hosted mutations, deploy, operate the public/native UI, listen to audio, or continuously watch all final videos. Test-suite counts and dashboard SMTP/quota observations below are parent-reported, not my independent execution.

## Improvements substantiated by inspected evidence

- Audio imports now use `?url`; selected recordings are loaded through a compiled URL allowlist with a timeout and byte cap. The previous eager base64 audio payload finding is resolved in source. Actual cold-load request behavior and native CSP still need browser verification.
- Real hosted Auth/database testing passed 16 scenarios, including two distinct JWT/account mappings, unauthenticated denial, private-note isolation, competing note edits, retry-safe room/invitation operations, private subscription denial, cross-user invalidation, presence without credit, leave/archive revocation and once-only focus credit after a real minute.
- A separate hosted run connected 100 independent WebSockets and all 100 received the invalidation. This is useful transport evidence.
- SQL review found no blocking authorization/integrity defect in the selected two migrations. Local aggregate/snapshot tests use 1,000 members and 100,000 completed sessions, with explicit correctness checks. These are not 1,000 concurrent public users.
- Neon Tokyo now passes its existing technical gate at seam ratio 3.518, with final SHA-256 `571cbc6963922e1ca5dfb60c9f687e789dd6f3d64aa45e9baab59f31580e3ed9`. The initial failing loop report is superseded; continuous visual approval is not supplied by this numerical pass.
- Film coverage has progressed to 23 entries in `web`, while `app` and `cloud` each contain three at this inspection. Source porting is intentionally unfinished. Do not report all fifty as complete or deployed.

## Prioritized findings and fixes

### P0 — Public onboarding is not established

Parent inspected the actual Supabase dashboard: custom SMTP disabled, email confirmation enabled, OAuth providers disabled. Public Vercel account configuration remains an unclosed gate. The hosted test explicitly calls admin `createUser({ email_confirm: true })` for `example.invalid` fixtures and signs them in with passwords. It therefore proves neither public registration nor email delivery, OTP handling, callback routing, expired code behavior, or the account UI.

**Close with:** configure the existing authorized delivery provider/domain and exact public environment, then complete real fresh-user email sign-in on the public origin, code expiry/retry, refresh, sign-out and account switching. Do not remove email verification just to produce a passing result. Record the exact deployed version and keep account secrets out of reports.

### P1 — Audio accumulates decoded buffers and silent looping players

`web/ui/src/world/AmbientMixer.tsx:75` turns unused recordings' gains down, but `:83–86` retains their buffer sources in `engine.sources` and entries in `engine.recordings`. They are stopped only when the whole engine is disposed (`:98–103`). Pause merely suspends the context. Visiting rooms that collectively use all ten recordings can retain 393 seconds of decoded audio: roughly **139 MB** for stereo float32 at 44.1 kHz (151 MB at 48 kHz), before browser overhead, video textures and UI memory. This is a bounded catalog accumulation, not an infinite leak, but it matters on mobile and embedded hosts. Silent looping sources also remain attached.

**Close with:** after the transition fade, stop/disconnect and release unused sources and decoded buffers, or implement a small explicit cache budget. Cancel obsolete fetches where feasible. Add a meaningful regression that cycles all recording types and verifies an active-source/decoded-buffer ceiling; inspect memory after several room cycles in a browser. Preserve smooth fades and protection against late loads restoring stale audio.

### P1 — The measured WebSocket result is much narrower than the requested capacity

The load script uses user B's same JWT for all 100 sockets, one room, one post-connect invalidation and a brief ramp. HTTP requests run against a loopback handler backed by hosted Auth/DB. It does not test Vercel routing, 100 distinct users, each browser's three channels, sustained snapshot/API demand, retries, mobile clients or 1,000 simultaneous users. The local SQL benchmark also has warm caches and fsync disabled. Parent observed a dashboard setting of 10,000 clients/2,500 events alongside a Spend Cap requirement banner; effective limits remain unresolved.

**Close with:** establish effective enforced provider limits without purchasing anything implicitly. Measure a bounded production-equivalent workload with distinct identities or a justified identity distribution, realistic room distribution, all normal channels, API reads/writes and presence, a sustained interval, reconnection burst, latency/error distributions and resource headroom. Report the achieved workload precisely rather than multiplying the 100-socket result by ten.

### P1 — “Live” update latency is deliberately several seconds, sometimes one minute

`liveSync.ts:28–32` applies a 5-second refresh cooldown with up to 1.5 seconds jitter. For rooms with at least 200 members, `useLiveNooks.ts` selects 12 seconds plus up to three seconds jitter. Missed hints reconcile every 45–60 seconds; native uses that polling path without push. This is an intentional scalability tradeoff, not an implementation claim of subsecond updates. The initial report's suggested 2-second p95 live-update gate is incompatible with this design under sustained activity.

**Close with:** define an honest product freshness target and display synchronization state accordingly. Either accept and verify these bounded delays, or change the update architecture based on measured load. Test leave/archive/expired-auth UI convergence separately from server authorization, including missed hints and reconnect. Do not use instantaneous WebSocket receipt as a proxy for visible UI freshness.

### P1 — Final media quality and parity remain incomplete

Current manifests differ (web 23, app/cloud 3). Some scene review records refer to superseded outputs. Technical decoding and still/contact review do not establish relaxing motion over repeated loops, and none of my work is a listening review. Audio processing metrics show no clipping but cannot establish whether birds, train rhythm or room tone feel appropriate, repeat distractingly, or contain unwanted transients.

**Close with:** complete all fifty, inspect final hashes, regrade any replaced file, verify intended-source parity and deployed paths, and watch final motion continuously through several loops. Audition unique recordings and distinct scene mixes through at least three seams at their normal gains. Explicitly separate technical, frame-sampling, motion and listening evidence.

### P1 — Operational and actual-host acceptance is still open

No newly inspected report closes hosted restore across SQL/Auth/private artwork, operator/alert delivery, real native unsaved-change recovery, or post-deploy public/native smoke checks. A healthy database and local build do not close these requirements. Parent reports web 66 tests and native/cloud 298/299 tests passing, valuable regression evidence with these limits.

**Close with:** complete the existing acceptance runbook on isolated fixtures; record deployment/migration IDs, actual host/browser behavior, recovery time/data-loss window and cleanup. Reconcile status documents afterward so they no longer describe newly closed database checks as pending or open public flows as complete.

## Additional performance observation

Presence timers in `liveSync.ts:35` use a fixed 45-second interval even though reconciliation is randomized. A classroom-wide initial join or reconnect can preserve a periodic heartbeat burst. This is a P2 resilience improvement: add bounded jitter to heartbeat scheduling and measure reconnection behavior. It is not evidence of a current outage.

## Next grading order

1. Resolve public sign-in delivery/configuration and validate the public user journey.
2. Fix audio source/buffer retention and verify resource bounds.
3. Finish and review exact final fifty-scene assets, including genuine listening/motion review.
4. Verify actual UI freshness and intended deployed transport with two users.
5. Measure sustainable supported capacity within effective provider limits and close operational recovery gates.

The backend work now has credible real-service correctness and bounded transport evidence. That justifies the readiness improvement from 2/10 to 4/10; it does not justify a public launch or a 1,000-user guarantee.
