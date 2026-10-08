# Realtime fixture authentication diagnosis and bounded proof

Prepared and executed once with separate root authorization on 2026-10-08. The small hosted proof passed; a 100-user rerun still requires a separate root decision.

The failed soak report (`soak-report-2026-10-08T11-06-12.770Z.json`) stopped at `isolation_and_socket_ramp` with `unexpected_channel_failure`, one socket and two channels. Its original telemetry did not preserve channel status or role. Therefore the exact historical hosted failure cannot be established from that report.

A real local SDK reproduction proves a harness defect consistent with that timing. Installed Supabase JS 2.117.2 gives an ordinary fresh client an Auth-backed access-token callback. The fixture socket client had no Auth session. Calling `realtime.setAuth(fixtureJWT)` did not disable that callback: a real channel join acknowledgement invokes another `setAuth()` call, replacing the JWT with the public key. SDK connect and heartbeat paths also refresh the callback. The old successful capacity harness joined three channels concurrently; it did not exercise the same sequential join timing. This is a harness diagnosis, not evidence of a broken product login: the product client uses its authenticated persisted session.

The narrow correction supplies `accessToken: async () => user.token` only to disposable Realtime socket clients. Administrative/login clients are unchanged. The JWT stays in memory. Safe diagnostics record fixed status, channel role, error category and token-equality booleans; no raw provider errors, topics, tokens or URLs. Only an authorization-category channel error qualifies as expected foreign denial. Any broadcast on an explicitly forbidden channel aborts, regardless of its fixture room index.

## Proposed single hosted proof

Run `verify-deployed-soak.mjs --run-authorized-realtime-proof` only after root authorization. Reuse the previously reviewed allowlist, configuration preflight, journal-before-create, exact fixture guards, bounded cleanup and release-identity comparison.

- Two confirmed disposable `example.invalid` identities; no email. One private curated room owned by A. B is never invited.
- A sequentially joins directory, account and own room. B joins directory/account, then must receive an authorization denial for A's room; remove the denied channel. At most two sockets and six simultaneous channels.
- Verify B's authenticated foreign snapshot returns 403/FORBIDDEN. Observe 35 real-clock seconds and require at least one sent and acknowledged heartbeat on each socket, with fixture JWT retained and public key absent.
- Disconnect/reconnect A once; verify authorized snapshot has exactly A, zero focus credit. A fixture-only profile update must yield its own room invalidation hint. This proves transport receipt, not visible browser convergence or causality for every hint.
- Confirm public HTML/manifest identity unchanged. Any unexpected HTTP/channel status, malformed body, token replacement, missing heartbeat, unauthorized broadcast, identity change or limit breach fails the proof.

All HTTP shares the existing admission gate: minimum 250 ms between starts, at most two active requests through body consumption, hard caps of 40 public starts and six Auth/admin starts. Auth grants retain a 2.5-second minimum spacing. Work has a three-minute ceiling; cleanup has a separate three-minute ceiling and 30-call cap, unaffected by the workload cap. Existing 15-second public, 20-second admin and 10-second cleanup timeouts remain. No retries, uploads, public rooms, bucket changes, quota changes or app changes. Normal authenticated GET identity/quota bookkeeping still applies.

Checkpoint and report filenames use `realtime-proof-fixtures-<timestamp>.json` and `realtime-proof-report-<timestamp>.json`. Cleanup revokes sessions and deletes only exact verified fixture accounts/Auth identities/room; reports final absence. Up to three exact fixture throttle topics are handed to root for guarded cleanup. No shared directory topic is deleted. An ambiguous remote write is reconciled using the existing exact request/identity markers, never blindly replayed.

## Local verification

The actual installed SDK join callback reproduces the old token loss and proves corrected callback retention without networking. Tests also cover bounded redacted telemetry and non-authorization foreign failures. Five additional tests execute extracted production harness functions with injected clock/SDK: denied broadcast rejection even when room indices match, normal small proof flow, missing heartbeat rejection, replaced-token rejection, and exact prepared-mode caps. The simulated clock tests verify control logic; only the separately authorized hosted run can establish real heartbeat behavior.

Prior cleanup, pacing, quiet-window, result-finalization and ambiguous-write tests remain applicable. This small proof does not establish 100-user capacity, a 15-minute plateau, automatic session refresh, browser/email onboarding or production readiness.

## Authorized hosted result

`realtime-proof-report-2026-10-08T11-30-18.987Z.json` records PASS, 11:30:18–11:31:19 UTC. Sequential own directory/account/room joins succeeded. The foreign room subscription returned an authorization-category CHANNEL_ERROR while its fixture JWT remained current; the foreign HTTP snapshot returned 403. Both sockets sent and acknowledged one heartbeat during 35.150 seconds of real observation, with JWT equality true and publishable-key equality false. A disconnected and rejoined all three channels; its authorized snapshot contained exactly one member and zero focus credit. The fixture profile change yielded an own-room invalidation after 464 ms.

The stable HTML and manifest hashes matched at start/end (`d03cf6fb1687397f7f16feb1`). Eleven public starts, four Auth/admin starts and 17 cleanup starts stayed within caps; minimum observed admission gap was 250.072 ms, peak active HTTP one, zero unexpected HTTP/channel errors. Peak two sockets/six channels; both zero after cleanup. Both sessions were revoked, both exact accounts/Auth identities and the sole private room were deleted and verified absent. The report and matching fixture journal contain the three exact throttle topics handed to root for guarded SQL cleanup; that SQL cleanup is tracked separately.

This establishes that the corrected fixture authentication flow works against the hosted Realtime service. It does not retroactively establish the precise provider error in the original failed run or establish the longer capacity plateau. The original failed report is preserved.
