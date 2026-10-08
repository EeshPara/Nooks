# Deployed backend acceptance

These harnesses exercise the exact allowlisted public origin `https://nooks-study-space.vercel.app`, with real Auth/database and direct Supabase WebSockets on project `lcfcjglybfeozyrjjikk`. They do not substitute a loopback API server. Configuration is checked before creating fixtures; the public client key is read from the deployed config. Credentials remain in process memory.

Run smoke first with Node 22:

```sh
node creative/nooks-release/deployed/verify-deployed-smoke.mjs --run --realtime
```

Only after smoke passes, the explicitly authorized bounded test is:

```sh
node creative/nooks-release/deployed/verify-deployed-capacity.mjs --run-authorized-100
```

The capacity harness uses 100 distinct admin-confirmed `example.invalid` identities, 100 sockets and 300 private channels, a private fixture room, 2.5-second password-login spacing, and approximately eight scheduled API operations per second over 120 seconds of wall time. Scheduling pauses during sequential reconnect of ten identities. Error-rate and latency thresholds stop the workload. No quota, forwarding-header, billing, or email settings change.

All fixture rooms, accounts, Auth identities and sessions are cleaned in `finally`. Reports record exact private fixture throttle topics for a separate guarded SQL cleanup, preserving `nooks:directory`. Account and room absence is checked after cleanup. This proves neither email onboarding nor browser rendering, and cannot establish 1,000-user capacity or full production readiness.

Initial deployed smoke at 08:00:43 UTC on 2026-10-08 failed at the first authenticated `/api/workspace` request with HTTP 503 `BACKEND_UNAVAILABLE`, despite correct public configuration. A root-requested diagnostic repeat at 08:02:55 UTC reproduced it with request ID `d1a34073-e76e-4328-af1f-77b0814c3325`. Both runs cleaned their single created Auth identity/session, left zero accounts/rooms, and did not begin capacity testing. See the timestamped reports; later passing evidence must supersede, not erase, these failures.

After the server credential correction and redeploy, smoke passed all 16 checks at 08:09:50–08:11:29 UTC (see `report-2026-10-08T08-09-50.725Z.json` for exact timestamps): real authenticated identities, unauthenticated denial, private-note isolation and concurrent edit conflict, RLS denial, room/invite retry behavior, Realtime membership authorization, content-free cross-user updates, presence without credit, public directory/owner controls, actual one-minute focus completion credited exactly once, and archive retry. All fixture cleanup succeeded, with zero accounts/rooms remaining. Four exact private throttle topics are recorded for guarded SQL cleanup.

The subsequent actual deployed 100-user workload also passed: 873 public HTTPS requests, zero errors, p95 364 ms, both 100-recipient fanouts received, and all 301 cleanup operations succeeded. See `results-2026-10-08.md` and `report-2026-10-08T08-11-42.801Z.json` for exact measurements and limitations.

The real-clock presence gap was separately verified with only two disposable private-room accounts: online count changed 2 → 1 after the inactive timestamp exceeded the SQL 90-second threshold, while membership stayed at two, then returned to two after a heartbeat. No focus credit was awarded. See `presence-expiry-results-2026-10-08.md` and its timestamped report. This test does not prove automatic expiry broadcasting or browser visibility timing.

Presence-test cleanup is complete: root verified zero fixture accounts/rooms and removed all three exact private fixture throttle topics with absence guards, preserving `nooks:directory`. No additional test was run.
