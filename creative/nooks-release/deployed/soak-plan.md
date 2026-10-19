# Prepared multi-room soak — October 8, 2026

**Prepared/reviewed plan; the one subsequently authorized attempt stopped before the measured plateau.** See [actual result](soak-results-2026-10-08.md). Any further execution requires root review and separate authorization. The existing public origin and dedicated Supabase project are fixed in source. This does not change hosting, billing, provider limits, schema, security policy, email settings or application code.

## Bounded scope

| Bound | Proposed run |
| --- | --- |
| Disposable identities | 100 admin-confirmed `example.invalid` accounts; no emails |
| Private rooms | 5, with 20 disjoint fixture members each |
| Peak Realtime footprint | 100 sockets, 300 private channels, matching the already proven peak |
| Measured scheduling window | 900 seconds, about 15 minutes |
| HTTP pacing | At least 250 ms between starts, at most 8 active through response-body consumption |
| Public HTTP cap | 4,200 total, including HTML/config/manifest, setup, expected denials, reads, writes, reconnect checks and final checks |
| Final-check reserve | Plateau admissions stop at 3,950 total public starts, reserving 250; hitting this early fails rather than silently omitting integrity proof |
| Direct Auth/admin cap | 350 requests; password-grant admissions additionally spaced at least 2.5 seconds apart |
| Cleanup allowance | Separate 800 direct requests, still paced; 4 identity cleanup workers, 10-second request deadlines, 15-minute cleanup deadline |
| Other bounds | 15-second public request deadlines, 20-second setup/admin deadlines, 2 MiB response cap, 30-minute non-cleanup wall ceiling |

The same shared HTTP gate also paces direct Auth/admin and cleanup calls; these have separate counters and never consume the public cap. Bodies are buffered inside the slot. PostgREST retries are explicitly disabled. There are no public automatic retries or quota overrides. Cleanup remains admitted after workload abort/cap exhaustion. Expected normal total time is approximately 24–28 minutes including enrollment, warmup and cleanup; the measured plateau is reported separately.

## Traffic and new confidence

After verifying `/api/config` matches the dedicated project and recording public HTML/manifest hashes, enroll accounts through the normal password grant. The harness requires a 30-minute token-expiry margin when each token is obtained and never refreshes/persists credentials. Each room is private, created by its fixture owner with a journaled idempotency request ID; nineteen peers accept one scoped invitation. No public room, artwork, draft, study artifact or focus session is created.

Five witnesses each receive HTTP 403 for another fixture room's snapshot. Before the full socket ramp, they attempt an unauthorized foreign room channel as their third channel, require an authorization/permission CHANNEL_ERROR, remove it, then subscribe to their own room. No fourth channel is used. Timeouts or unrecognized errors do not pass as authorization denial. These are stronger room-access evidence than content-free hint counters.

Warmup establishes presence for all users. During the plateau, overdue ~40-second heartbeats have priority; remaining budget goes to authenticated snapshots. All snapshot responses must contain exactly that room's twenty expected fixture account IDs, zero focus credit, and current online presence. Two reconnect rounds at minutes five and ten each disconnect/reconnect one distinct member per room sequentially in the background, checking snapshots afterward. The HTTP scheduler continues; actual start gaps and reconnect duration are reported. Every started socket-ramp batch settles before cleanup can begin on failure.

Controlled profile changes exercise each room's twenty-recipient fanout before/after and approximately every three minutes. A mutation pause is set before pending writes drain; only snapshots continue during that window. The entire window, including drain and settling, has a 15-second budget. The oldest heartbeat must be no more than 55 seconds old at entry, and the normal 70-second safety cutoff remains. Before baselines, observe one second of room-hint silence, waiting at most three seconds. Directory/account hints never count as room convergence. Other-room movement or unsettled hints make the experiment **inconclusive**, not an asserted data leak: content-free lossy hints cannot prove perfect event attribution or browser UI rendering.

The generator records 60-second latency/error/rate slices, per-operation results, actual starts, response byte counts, scheduling gaps, mutation pauses, reconnects, socket/channel peaks and final per-room integrity. The measured plateau includes only requests actually started inside its window. Post-window starts and drain duration are reported separately. The before/after release HTML and manifest identity must match; a changed alias fails as inconclusive. Root will freeze deployments during any authorized run.

Compared with the earlier ~120-second single-room sample, a passing run would demonstrate 7.5 times the duration at half the scheduled HTTP rate, repeated reconnect recovery, and simultaneous isolated private-room activity at the same peak socket population. It would not establish an overnight soak, memory-leak freedom, token refresh, multiple load-generator regions, browser or email onboarding, 1,000-user capacity, hosted request cancellation, or full production readiness. No provider capacity or cost increase is assumed or requested; ordinary bounded service usage remains real usage.

## Circuit breakers and cleanup

Stop new work on any unexpected HTTP/network failure (including 401/429/5xx), channel failure, malformed response, membership/credit mismatch, failed foreign-access denial, missing fanout, unresolved hint attribution, heartbeat age over 70 seconds, rolling 60-second p95 over five seconds after at least twenty samples, public/admin cap, insufficient final reserve, wall deadline or SIGINT/SIGTERM. Expected foreign-read 403s count toward request totals but not unexpected workload errors. A failing run never becomes a pass merely because cleanup succeeded.

The durable journal is created and fsynced before the first create. Each intended Auth UUID, fixture email and run marker is journaled before `createUser`; the installed SDK explicitly supports supplying the UUID. Returned IDs are checkpointed before subsequent operations. Rooms are journaled by exact fixture owner plus request ID before the public create call. An ambiguous creation is resolved only through these exact identifiers, never a broad user/room listing or blind replay. Each update uses atomic rename and fsync. No password, JWT, refresh token, invitation code, service key, signed URL, private content or broadcast body is written to reports.

Cleanup drains started operations, removes channels/sockets, then resolves/deletes only exact fixture-owned rooms. User cleanup first verifies exact Auth UUID, fixture email and administrative run marker. Session revocation, account deletion, Auth deletion and final verification are independently attempted after that guard. Revocation failure does not strand remaining resources. Journal-write failure stops creation but cannot prevent guard-verified cleanup; it remains a reported failure.

`nooks_accounts.auth_user_id` uses `ON DELETE SET NULL`, so final absence checks use the recorded account ID whenever available. This detects a surviving account after an account-delete failure even if Auth deletion cleared the link. A contradictory account mapping/cardinality withholds Auth deletion. If a transport lookup fails and no account ID is known, Auth deletion is withheld to preserve the exact lookup link for operator recovery. These failures are explicitly reported; they are not hidden as successful cleanup.

Normal cleanup uses about 715 direct HTTP requests, below its 800-request bound. Each stage retains its own failure result and the final report lists exact remaining/unverified fixtures. SIGKILL, machine loss or a provider outage cannot be guaranteed clean; the journal provides bounded exact recovery keys. Root receives up to 105 exact fixture throttle topics for separate SQL cleanup with absent-account/room guards; the shared `nooks:directory` topic must never be deleted. No throttle-table SQL is run by this harness.

## Files and local validation

- `verify-deployed-soak.mjs`: gated runner; timestamped `soak-report-*.json` and `soak-fixtures-*.json` only when explicitly run.
- `soak-control.mjs`: pacing/caps, bounded body reads, batch settling, safe statistics and room validation.
- `soak-control.test.mjs`, `soak-cleanup.test.mjs`, `soak-fanout.test.mjs`, `soak-final-result.test.mjs`: injected local control tests. Cleanup/fanout tests evaluate the actual prepared function bodies with fake SDK/clock implementations; they never run the harness or contact a provider.

**22/22 local tests passed**, including slot lifetime, no catch-up burst, grant pacing, public/final/cleanup caps, delayed failed connection siblings, persistent disk failure, failed session revocation, SET NULL orphan detection, contradictory account mapping, quiet-window drain deadline, inconclusive hint classification and a channel failure arriving during the final manifest response. The first abort reason and phase override tentative success after cleanup; clean removal of fixtures cannot mask an aborted run. Syntax/prepared-only guard and `git diff --check` passed. This is preparation evidence only; independent review and explicit root run authorization remain required.

After those approvals only, with Node 22 on PATH:

```sh
node creative/nooks-release/deployed/verify-deployed-soak.mjs --run-authorized-soak
```
