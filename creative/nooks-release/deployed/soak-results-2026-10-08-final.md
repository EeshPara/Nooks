# Final 100-user, five-room soak: PASS

The single final authorized run used reviewed source `c1d22be` against frozen public deployment `c4t3ni42i` and dedicated project `lcfcjglybfeozyrjjikk`. Started **2026-10-08 12:02:56 UTC**, finished all harness cleanup **12:28:31 UTC**. Actual public HTTPS API requests plus direct Supabase Realtime sockets were exercised; this was not a browser load generator.

Evidence: `soak-report-2026-10-08T12-02-56.129Z.json` and matching `soak-fixtures-2026-10-08T12-02-56.129Z.json`. Both earlier failed runs and the small successful authentication proof remain preserved; this result does not rewrite their outcomes.

## Measured traffic and bounds

| Measure | Result |
| --- | --- |
| Actual scheduled plateau | Exactly **900.000 seconds** |
| Plateau public starts | **3,559**, average **3.95444/sec** |
| Plateau latency p50 / p95 / p99 / max | **279 / 394 / 501 / 1,073 ms** |
| Plateau unexpected errors | **0** |
| Starts admitted after plateau window | **2**, recorded separately; zero errors |
| Scheduler stop delay / drain | **1 ms / 609 ms** |
| Total public starts, including setup/checks | **4,101 / 4,200 cap** |
| Total public latency p50 / p95 / p99 / max | **278 / 398 / 514 / 1,073 ms** |
| Total unexpected HTTP or channel errors | **0** |
| Auth/admin starts | **200 / 350 cap** |
| Cleanup starts | **715 / 800 cap** |
| Minimum observed shared HTTP start gap | **250.004651 ms** |
| Maximum active HTTP requests | **3 / 8 ceiling** |
| Peak sockets / channels | **100 / 300** |
| Final sockets / channels | **0 / 0** |

Paced fixture creation took 280.524 seconds; room/socket isolation ramp 57.829 seconds; initial presence/fanout warmup 38.856 seconds; final integrity checks 65.716 seconds. These are outside the plateau. Controlled notification windows continued reads with only one pending foreground read; actual rate fell slightly during those windows. There were no deliberate full HTTP pauses; the largest plateau start gap was 528 ms. Request timing is from admission through response-body consumption; queue waiting is reported separately.

All 20 plateau controlled profile writes queued at most **224 ms**, and retained at least **7480 ms** of their quiet-window timeout budget at admission. The four plateau quiet windows lasted 7.794, 8.333, 7.243 and 8.100 seconds, each below the unchanged 15-second ceiling. This confirms the admission correction under this workload without increasing provider limits or deadlines.

## Correctness and Realtime

- Five disjoint private rooms each had exactly 20 intended members. Every final room member was correct and online.
- Five cross-room HTTP snapshot attempts returned expected **403/FORBIDDEN** and five private foreign subscriptions were denied. Expected denials are excluded from unexpected errors but included in applicable request counts.
- Six controlled fanout rounds (before, minutes 3/6/9/12, after) produced **30 room measurements, 600/600 intended transport receipts**, and zero other-room hint-counter movement in the bounded observations. Maximum measured hint receipt time was **671 ms**. Shared directory/account hints were not used as room-isolation evidence. Content-free hints and timing do not prove visible browser convergence or universal causal delivery.
- Two reconnect rounds each reconnected one identity per room, ten distinct identities total. The rounds took **12.610 seconds** at minute five and **11.726 seconds** at minute ten while normal HTTP traffic continued. Returning authorized snapshots passed.
- Final per-account and room checks confirmed **zero false personal or room focus credit**.
- Public release identifier **`640128902cacc8f377e1a477`**, full HTML SHA-256 and manifest SHA-256 were identical at start and end.

## Completed-minute observations

These are final recomputed interval rows; live console rows can differ slightly because in-flight requests had not yet finished. Sub-millisecond timestamps rounded for sample storage can shift an interval-boundary sample; aggregate plateau count remains authoritative.

| Minute | Requests | Starts/sec | p95 ms | Unexpected errors |
| --- | --- | --- | --- | --- |
| 1 | 240 | 4.000 | 388 | 0 |
| 2 | 239 | 3.983 | 484 | 0 |
| 3 | 239 | 3.983 | 441 | 0 |
| 4 | 231 | 3.850 | 344 | 0 |
| 5 | 239 | 3.983 | 342 | 0 |
| 6 | 239 | 3.983 | 422 | 0 |
| 7 | 232 | 3.867 | 347 | 0 |
| 8 | 239 | 3.983 | 393 | 0 |
| 9 | 239 | 3.983 | 385 | 0 |
| 10 | 233 | 3.883 | 372 | 0 |
| 11 | 239 | 3.983 | 393 | 0 |
| 12 | 239 | 3.983 | 363 | 0 |
| 13 | 233 | 3.883 | 350 | 0 |
| 14 | 239 | 3.983 | 381 | 0 |
| 15 | 239 | 3.983 | 355 | 0 |

## Cleanup and limits of the result

All **100 fixture sessions were revoked**, all **100 exact Auth identities/accounts** and **five exact private rooms** were deleted and verified absent. There were **zero cleanup failures**, and no remaining fixture socket/channel. The report and journal contain the same **105 exact throttle topics**. After the account/room absence checks, root separately deleted all **105** with exact-topic absence guards and verified **zero remained**; evidence is `soak-topic-cleanup-2026-10-08T12-02.sql` and `.json`. Shared `nooks:directory` was excluded. No real users, existing rooms, uploads, emails, subscriptions, quotas or policies were changed.

This closes the previously unproven 15-minute/five-room/100-identity workload at the tested rate. It does **not** prove overnight stability, geographically distributed traffic, thousands of users, email onboarding, token expiration/refresh, populated libraries, upload/delete/restore lifecycle, visible browser convergence or universal production readiness. No further live run was performed or is implied by this PASS.
