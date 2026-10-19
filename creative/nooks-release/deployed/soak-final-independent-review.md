# Independent final soak acceptance — October 8, 2026

**PASS within the tested 100-identity, five-room, fifteen-minute scope.** I inspected the final raw report and durable fixture manifest for `2026-10-08T12-02-56.129Z`, the matching exact-topic cleanup SQL/JSON, and the runner's measurement/final-integrity logic. I recomputed counters and latency percentiles locally from the saved samples. No hosted traffic or fixture mutation was performed by this reviewer.

| Measurement | Independently reconciled result |
| --- | --- |
| Fixed public release | `c4t3ni42i`, HTML ID `640128902cacc8f377e1a477`; identical start/end HTML and manifest hashes |
| Identities / rooms / membership | 100 unique Auth and account IDs; five private rooms with twenty disjoint members each |
| WebSockets / channels | Peak 100 / 300; final 0 / 0; no recorded unexpected channel failures |
| Measured plateau | Exactly 900,000 ms; fifteen complete 60-second intervals |
| Plateau public HTTPS requests | 3,559: 1,356 snapshots, 2,183 presence updates, 20 profile writes |
| Rate / errors | 3.95444 starts/second; zero unexpected errors |
| API p50 / p95 / p99 / maximum | 279 / 394 / 501 / 1,073 ms |
| Minute-level p95 range | 342–484 ms |
| After-window accounting | Two additional successful starts excluded from plateau statistics; 609 ms drain, 1 ms scheduler-stop delay |
| Entire run HTTP accounting | 4,101 public, 200 direct Auth/admin, 715 cleanup requests; below reviewed caps |
| HTTP concurrency / pacing | Actual peak three active requests, configured maximum eight; minimum recorded start gap 250.004651 ms |
| Isolation | Five expected foreign snapshot 403s and five foreign private-channel denials |
| Controlled fanout | Thirty room measurements: 600/600 expected recipient receipts, zero observed other-room hints |
| Reconnects | Two rounds of five identities, one per room, at approximately minutes five and ten; 12.610 and 11.726 seconds |
| Final integrity | Exact owned room membership, all final presence online, zero personal/room focus credit, release unchanged |
| Cleanup | All 100 sessions revoked; all 100 account/Auth identities and five rooms verified absent; no failed cleanup stage |

The 3,559-request count and nearest-rank latency percentiles match the raw samples and sum of interval counts. The two post-window samples are kept separate instead of inflating the fifteen-minute total. The run contains 4,101 public sample records, all marked successful under their expected contracts, including the five intentional HTTP 403s. Latency measures admitted HTTP operations, not browser experience or time waiting in the client's admission queue.

The six controlled fanout windows cover before, minutes three/six/nine/twelve and after, with five rooms each. Their longest quiet window was 8.333 seconds, below the unchanged fifteen-second bound. The corrected scheduler maintained reads during plateau fanout and reconnects; its longest plateau public start gap was 528 ms. This addresses the prior deterministic harness contention without treating that failed attempt as passing or proving its unrecorded raw error after the fact.

Cleanup includes 505 successful semantic stages (five rooms plus five stages per identity), backed by 715 paced cleanup HTTP calls. Every fixture manifest entry is marked cleaned. I recomputed the exact allowlist from its 100 account IDs and five room IDs: it matches all 105 topics in the report, manifest and SQL, with no shared directory topic. The SQL retains account/room-absence guards. The inspected execution result records 105 removed and a subsequent zero remaining; the shared directory is preserved. Cleanup success is separate from the measured workload pass and is required for this acceptance.

This is one generator against the existing public HTTPS backend plus direct Supabase WebSockets, using admin-confirmed disposable users in five private rooms. It establishes neither 100 simultaneous API requests nor 1,000-user capacity, overnight stability, multiple regions, browser rendering/visible convergence, email onboarding, token expiry/refresh, artwork uploads or public-room discovery. Content-free invalidation receipt is not delivery of private content or a subsecond UI guarantee. Earlier incomplete attempts remain preserved; they are not concatenated with this run.

**Grading impact:** product quality stays **7.5/10**. Public multi-user production readiness rises from **6.5 to 7.0/10** because the current deployment now has a completed bounded multi-room stability test with isolation, reconnect, integrity and cleanup evidence. Public launch remains blocked by functional email onboarding. Sensory review, real authenticated browser/native iframe journeys, physical-device performance, scheduled alerts and hosted recovery drills remain open. This is not broad-launch approval.
