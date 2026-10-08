# Independent release grade — October 8, 2026

**Product quality: 7.5/10. Public multi-user production readiness: 6.5/10. Public launch is still blocked by email onboarding; no broad-launch or 1,000-user sign-off.**

This supersedes the provisional final-candidate grade for the evidence closed below. Readiness improves from 5 because the actual public HTTP deployment now passes authenticated correctness and bounded concurrency tests, and final media has deployed byte-level evidence. Product quality remains provisional because actual listening, continuous motion, physical-phone/performance and fresh native-frame acceptance remain incomplete. The later responsive-browser and authenticated-probe evidence closes specific gaps below; the headline scores remain unchanged because onboarding and operational gates are still open.

## Evidence independently inspected

I independently recomputed all **50 final movie and source-artwork hashes**, checked exact-hash independent reviewer approvals with no matching rejection, and compared maps/movies/artwork across **web, app, cloud and the Site checkout**. All passed. I inspected the final release verifier and its passing report, plus the deployed public asset report: **62/62 resources passed** exact bytes, media types and applicable audio CORS checks. The public network sweep was repeated on the followup deployment at 08:26:16 UTC and performed by root, not rerun by this grader.

The prior candidate review independently ran **24 focused tests, all passing**, covering audio source release, stale decode races, media lifecycle/reduced motion/fallback, scene selection and live-update coalescing/offline/jitter behavior. Those unaffected suites were not rerun merely to increase a count. I inspected the current source fixes for task focus, persisted motion preference, guest presence and sharing copy. Local and deployed browser acceptance is root's recorded evidence, not this grader's own browser operation. I also inspected the new authenticated probe and independently ran its six new tests successfully; the operations agent reports ten passing checks including four existing probe tests. The six checks cover authenticated-path shape/redaction, 401/503 detection, configuration mismatch, malformed/oversized/redirect responses, credential constraints and exception redaction.

I inspected the deployed smoke/capacity harnesses and their final raw reports, including failure records, test boundaries and cleanup. The backend SQL security review remains scoped to the selected additive migrations; this grade is not a new whole-product penetration test.

Release under evaluation:

- Public: existing `https://nooks-study-space.vercel.app`, latest followup deployment `nooks-study-space-8hblkfqz7-eeshpara-1663s-projects.vercel.app`. The full smoke/capacity evidence below exercised preceding corrected deployment `k4ck6bl16`; the new build has the focused community-copy changes plus fresh asset/browser/authenticated-probe evidence.
- Native: the followup browser/release record identifies version 36, source `ea8036aa098743cfb35e92693e72996ee3edf3ea`, successful deployment `appgdep_6ac75374ed2c819189f7387ba46c3b4b`, preserving the existing owner-private audience. Earlier connected status/render-tool acceptance was recorded after version 35. This grader did not independently operate a fresh native iframe; actual iframe acceptance remains open.
- The guest-presence/share-copy fixes are now deployed. Root's actual public browser check confirms **Study together**, without the fabricated eight-person count. Sharing copy is source-reviewed and typechecked, but no reachable share-dialog trigger was found in that browser flow; do not claim its dialog was browser-verified.

## Actual deployed backend result

The corrected public smoke report `deployed/report-2026-10-08T08-09-50.725Z.json` passes **16/16 checks** through the actual HTTPS API: two authenticated identities, anonymous denial, private-note isolation and edit conflicts, room/invite retries, nonmember channel denial, content-free cross-user invalidations, presence without credit, leave/archive access revocation, owner controls and real server-clock focus completion credited once. Fixture cleanup succeeded and left zero fixture accounts/rooms. Administratively confirmed fixture accounts do not prove email onboarding.

The actual public capacity report `deployed/report-2026-10-08T08-11-42.801Z.json` establishes this bounded result:

| Measurement | Result |
| --- | --- |
| Distinct identities / WebSockets / private channels | 100 / 100 / 300 |
| API operations through deployed Vercel HTTPS | 873; 670 snapshots, 200 presence calls, 3 profile writes |
| Errors / socket failures | 0 / 0 |
| API p50 / p95 / p99 / maximum | 247 / 364 / 511 / 767 ms |
| Wall workload window | 120.605 seconds |
| Sequential reconnect pause | 10 identities, 10.642 seconds; API scheduling pauses during this phase |
| Before/after invalidation delivery | 100/100 recipients each; p95 577 / 306 ms |
| Final integrity | Exactly 100 members; zero false focus credit |
| Fixture cleanup | 301 successful operations; zero fixture accounts/rooms remain |

This is one generator, one private room, roughly eight scheduled API requests per active second, and about 110 seconds of active scheduling. It does not establish 100 simultaneous API requests, 1,000 concurrent users, long-duration reliability, multi-room capacity, browser rendering or email delivery. Fanout measures transport receipt, not visible UI convergence. The report lists 101 exact private throttle topics. The inspected root execution record `deployed/cleanup-fixture-topics-result.json` records removal of those plus four smoke topics (105 total). I also inspected the exact-topic SQL's account/room-absence guards and preservation of the shared directory topic. This is separate from the successful account/room cleanup above.

## Incident and operations assessment

The first configured public release passed the unauthenticated config/health probe yet failed the first legitimate authenticated workspace request with HTTP 503. Root's incident record identifies a rejected server credential at the identity RPC; the corrected credential/deployment is supported by the later 16-check smoke and 100-identity workload. The two failed smoke reports remain available and their disposable fixtures were cleaned. This was a real deployed defect, not a harmless test issue.

**Authenticated detection is now implemented and exercised once.** `operations/authenticated-probe.mjs` checks the exact existing public origin/project and authenticated workspace response using an operator-supplied dedicated-canary JWT. It rejects redirects, limits response size/time, validates credential role/project/expiry before use and records no workspace content or credentials. The inspected live report `authenticated-probe-live-2026-10-08T08-27-51.030Z.json` passes configuration (159 ms) and authenticated workspace (587 ms) at 08:27:59 UTC. Its disposable account/session/Auth cleanup passed, with zero account rows, absent Auth identity and zero fixture throttle topics verified. Although it invokes only GET, normal identity/quota/legacy-hydration bookkeeping may write; it must use an initialized dedicated fixture. This closes the missing authenticated-probe implementation and one live invocation, **not** persistent canary provisioning, scheduling, save/recovery monitoring, alert delivery or operator acknowledgment. Those are the remaining operational priorities.

The operations audit provides actual dashboard evidence of six physical database backups, latest observed October 8 at 06:48:47 UTC. Availability is useful; no hosted restore was exercised, PITR was not enabled, and database backups exclude private Storage object bytes. SQL/Auth/private-artwork recovery remains open.

The outbox audit identifies 1,320 small, never-claimed historical workspace hints, with no consumer configured. This is not evidence of broken live updates: current realtime invalidations depend on outbox inserts/payload updates and do not claim those rows. Do not remove the writers/table, invent delivery acknowledgments or enable a no-op dispatcher. Retention is a future bounded operational task; the audit's duplicate-only cleanup proposal needs its own verification and does not justify age-only deletion of a coalesced active hint.

## Product findings and next work

1. **P0 — Functional public sign-in.** The unresolved SMTP/provider/domain dependency remains the immediate launch blocker. Configure the authorized existing delivery service and verify real email/code arrival, expiry/retry, callback/session persistence, logout and account switching on the public origin. Admin-created test accounts intentionally bypass this gap. Do not disable email verification to close it.
2. **P1 — Perceived ambience and motion.** All fifty now have exact reviewed bytes and full-decode/frame-sampling evidence. This is not continuous full-speed approval or listening approval. Some corrected films intentionally keep rigid geometry static and animate only steam or restrained illumination; for example the final Rainy Library animates steam, not its rain-filled exterior. Audition unique recordings/mixes and repeated seams, inspect several continuous loops, and preserve honest descriptions of what moves.
3. **P1 — Actual user paths on final hosts.** Complete fresh native-frame save/recovery and media/CSP checks, and real public authenticated browser journeys/two-user visible convergence. Public HTTP correctness is now established within the smoke scope; it does not automatically establish account UI behavior. Native connected tool calls do not replace iframe interaction.
4. **P1 — Physical-device and resource performance.** Root's deployed browser report now records an actual measured **390 × 844** viewport: home, discovery, library and note editor each had document width/scrollWidth 390, with screenshot review. Empty search recovered from zero to fifty rooms, closing discovery restored focus, and a disposable note autosaved and survived reload. This closes those responsive desktop-browser journeys; it does not prove physical-phone performance, software-keyboard behavior, all small-screen dialogs or repeated-scene memory bounds. The audio lifecycle fix has strong regression evidence; actual resource measurements remain needed before speculative bundle refactors.
5. **P1 — Recovery and monitoring.** Close operator/alert delivery and isolated hosted recovery evidence before claiming production readiness. Preserve existing data; never restore over live Nooks for a test.
6. **P2 — Honest community state.** This review confirmed the guest header displayed a hardcoded **“8 people”** with preview disclosure confined to hover/accessibility text and the opened drawer. That could appear real to a touch user. Root's inspected source now shows **“Study together”** for disconnected users and retains actual counts only for connected rooms. I also identified obsolete sharing text saying shared sessions were not connected even for signed-in users; root made that copy conditional. Both changes are appropriate small product fixes and are deployed. Actual public browser acceptance closes the misleading guest count; the sharing dialog itself remains source/typecheck evidence because its trigger was not reached.

Live freshness should remain explicit: browser invalidation refresh normally waits about 5–6.5 seconds, or 12–15 seconds in large rooms; missed hints/native polling reconcile every 45–60 seconds. Subsecond socket receipt must not be advertised as subsecond visible updates.

No additional blocking source defect was found within this review's scope. The strongest next improvement is making the existing account journey usable for real new users, followed by actual sensory/device/host acceptance and scheduled, operator-owned use of the now-tested authenticated canary. More unchanged local tests would not close these gaps.
