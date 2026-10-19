# Bounded multi-room attempt — October 8, 2026

**Failed during subscription setup; the measured soak never started.** The single root-authorized run began at 11:06:12 UTC and finished cleanup at 11:14:08 UTC. No retry or second run was made.

The frozen public release matched expected manifest ID `d03cf6fb1687397f7f16feb1` and HTML SHA `d03cf6fb1687397f7f16feb11bbe60ff45c2bea0740a13fbfb0efeba6cd8a41d`. HTTP used the actual stable public Vercel alias; Auth/database and attempted Realtime connections used only the dedicated Supabase project.

| Observation | Actual result |
| --- | --- |
| Disposable identity setup | 100 accounts initialized; five private rooms created with twenty fixture members each |
| Setup duration | 283,295 ms |
| Cross-room HTTP snapshots | Five expected 403 denials |
| Public HTTP requests | 218; zero unexpected errors; p50 313 ms, p95 450 ms, p99 616 ms, max 918 ms |
| Direct Auth/admin HTTP | 200 requests |
| Stop | `unexpected_channel_failure` in `isolation_and_socket_ramp` |
| Realtime peak | One socket, two channels |
| Steady workload | Not started; no 15-minute or per-minute result |
| Cleanup HTTP | 715 requests; no failed cleanup stages |
| Verified absence | 100/100 identities/accounts and 5/5 rooms |
| Final sockets/channels | Zero / zero |
| Aggregate HTTP concurrency/pacing | Peak four active; minimum recorded start gap 250.006 ms |

The one-socket/two-channel peak locates the stop within the first witness's legitimate directory/account subscription stage, before any foreign-channel test completed and before the full socket ramp. The report does not preserve the specific channel status or topic kind. It therefore cannot distinguish an adapter/timing problem from an Auth/provider rejection; it is not sufficient evidence to label a product isolation defect or a service outage. No stronger diagnosis is claimed.

All fixture emails used `example.invalid` with administrative confirmation; no email was sent. No artwork, public room, study material, persistent credential, provider configuration or application source change was made during the run. The reviewed harness remained fixed. The circuit breaker stopped admission and its bounded cleanup completed, including exact account-ID verification after Auth deletion.

Evidence: [report](soak-report-2026-10-08T11-06-12.770Z.json) and [durable fixture journal](soak-fixtures-2026-10-08T11-06-12.770Z.json). Both contain the same 105 exact fixture throttle topics for root's separate SQL cleanup with absence guards; the shared `nooks:directory` topic must be preserved. Root subsequently removed all105 exact fixture throttle rows using both absent-account and absent-room guards; the shared directory row was excluded. See the timestamped soak-topic-cleanup SQL and result record.

The longer/multi-room stability gap remains open. The earlier successful two-minute public capacity result remains historical evidence; this failed attempt neither extends that duration nor retests its 100-socket peak. Any follow-up needs root review and separate authorization. A narrowly scoped diagnostic with safe channel status/topic-kind telemetry is preferable to blindly reenrolling one hundred accounts.
