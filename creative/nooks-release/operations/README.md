# Nooks operations acceptance — October 8, 2026

## Latest release canary and empty draft-list check

On public release `c4t3ni42i`, the **12:00:59 UTC** disposable fixture passed configuration 200/90 ms, authenticated workspace 200/486 ms and owner-scoped empty draft listing 200/350 ms. Session revocation and account/Auth deletion succeeded; account absence and Auth absence were verified. Root's exact account/room-absence-guarded throttle cleanup found no row. See [canary](authenticated-probe-live-2026-10-08T12-00-59.252Z.json), [fixture](authenticated-probe-fixture-2026-10-08T12-00-59.252Z.json) and [topic cleanup](authenticated-probe-topic-cleanup-2026-10-08T12-00.json). This is an admin-confirmed empty fixture, not email onboarding, populated artwork, scheduled alerts or a load test.

## Previous release canary and empty draft-list check

At **10:33:08–10:33:17 UTC**, after root deployed release `f2z3aj98o` to the stable public alias, one disposable initialized empty fixture passed: config 200/114 ms; authenticated workspace 200/365 ms; authenticated `nook_drafts_list` 200/368 ms, exact fixture recovery scope matched in memory, with zero drafts and zero publications. Session revocation and account/Auth deletion all succeeded; verification found zero account rows and Auth absent. Root’s exact-topic cleanup with an account-absence guard found zero remaining fixture topics and zero fixture accounts; see authenticated-probe-topic-cleanup-2026-10-08T10-33.json. Evidence: [canary](authenticated-probe-live-2026-10-08T10-33-08.718Z.json), [fixture and empty draft-list result](authenticated-probe-fixture-2026-10-08T10-33-08.718Z.json).

This used `--verify-draft-list` on the existing one-fixture harness. No artwork, draft or publication was created, no deep-input or load test was repeated, and no additional live fixture was used. The listing validates the authenticated empty response contract only; it does not prove populated summaries, browser rendering, SMTP or hosted disconnect propagation. Normal identity/quota bookkeeping can write.

## Earlier release canary and invalid-input check

At **09:56:16–09:56:24 UTC**, after root deployed `nooks-study-space-iebenwu3j-eeshpara-1663s-projects.vercel.app` to the stable alias, one disposable initialized empty fixture passed the authenticated canary: config 200/125 ms; workspace 200/393 ms. The same fixture's depth-10,000, 20,028-byte invalid profile request returned **400 `INVALID_INPUT`**, and scoped before/after reads showed its profile unchanged. Session revocation and account/Auth deletion all succeeded, with zero account rows and Auth absent verified. The exact orphan throttle topic was handed to root for guarded cleanup. Evidence: [canary](authenticated-probe-live-2026-10-08T09-56-16.062Z.json), [fixture and malformed-input check](authenticated-probe-fixture-2026-10-08T09-56-16.062Z.json). No broad smoke/load test was repeated.

## Browser sign-in remains unverified without email delivery

A proposed loopback QA page with a POST/302 into an admin-generated magic link was reviewed only; no link, server or browser fixture was created. The public client configures `flowType: 'pkce'` and `detectSessionInUrl: true` (`web/ui/src/account/client.ts:80`). The installed Auth SDK rejects an implicit token-fragment callback when configured for PKCE before reaching its fragment-clearing code (`GoTrueClient.ts:3880`, `:3975`). Admin `generateLink` exposes no supported browser PKCE-verifier setup in its typed options. Consequently, a bare generated link cannot safely be assumed to complete the existing public callback. The normal PKCE protections remain unchanged.

A POST/302 would keep the credential out of the button's DOM but would not guarantee it stays out of browser navigation/history or automated state captures. The existing code-entry screen is reached only after `sendCode` succeeds, so an admin OTP is not a UI-only SMTP bypass either. No auth configuration, app code, browser session storage or real owner session was changed for QA. [Supabase redirect rules](https://supabase.com/docs/guides/auth/redirect-urls) also require the destination to match provider configuration; the actual allowlist was not independently inspected in this feasibility check, so it is not claimed verified. Root declined the generated-link approach after the PKCE incompatibility was identified. Actual email arrival, normal callback and signed-in browser journeys remain dependent on the existing email-delivery setup; API fixture acceptance does not prove those journeys.

This is an operator runbook and evidence record, not a production approval. Only the existing Nooks services are in scope. No production data, audiences, billing, backups, or alert destinations were changed in this audit.

The corrected public deployment subsequently passed 16/16 authenticated correctness checks and a bounded 100-user workload through actual Vercel HTTPS: 873 operations, zero errors, p95 364 ms. See [deployed acceptance](../deployed/results-2026-10-08.md). Earlier unauthenticated checks passed configuration despite a rejected server credential; configuration/liveness therefore remain separate from authenticated dependency evidence. The new authenticated canary below passed focused tests and one actual public run with a disposable initialized empty fixture; it is not scheduled and no persistent canary identity exists.

## Earlier predeployment observations

| Signal | Evidence | Meaning and limit |
| --- | --- | --- |
| Public page and hashed entry assets | `predeploy-probe-2026-10-08.json`, sampled 07:54:23 UTC; HTML, JavaScript and CSS HTTP 200 | Public deployment is reachable. HEAD asset checks do not verify rendering or asset contents. |
| Public backend | Health HTTP 200 / `configured:false`; config `unconfigured`; workspace HTTP 503 `BACKEND_UNAVAILABLE` | The currently deployed public build has no account backend. Environment variables prepared for a subsequent deployment do not change this runtime. The probe deliberately exits 2 with `--require-accounts`. |
| Native access gate | Anonymous `/health` HTTP 401 | Expected restricted access. This is not proof the native worker/database is healthy, and must not be treated as an outage by an anonymous monitor. |
| Dedicated Supabase | MCP `get_project`: `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.002`, us-east-2 | Provider control-plane status. Separate read-only aggregate SQL also completed, proving this management path reached PostgreSQL at audit time. Neither proves deployed application Auth/save behavior. |
| Scheduled backup availability | Authenticated Nooks dashboard, Database → Backups; six PHYSICAL entries, latest **2026-10-08 06:48:47 UTC** | Actual listed backups, not an inference from paid plan. Earlier entries: Oct 7 06:00:05; Oct 6 05:49:41; Oct 5 05:51:00; Oct 4 05:52:00 and 02:17:14 UTC. None was restored or downloaded. |
| PITR | Dashboard Point in time displays “available as an add-on” / “Enable the add-on” | Not enabled. No add-on was purchased. |
| Storage recovery | Dashboard explicitly excludes Storage objects from database backups | SQL backup coverage does not establish private artwork-byte coverage. No independently recoverable private object backup or hosted restore drill was verified. |
| Event retention | Read-only SQL: 1,320 outbox rows, 679,936 total relation bytes, oldest Oct 4 02:37:37.800828 UTC; all never claimed; zero delivered, active leases, or retries | Current small backlog; no consumer is configured. This is one point, not a measured growth rate. No payloads or account identifiers were read. Nothing was pruned or dispatched. |
| Alerts/operator | Source has bounded privacy-safe failure logs and per-instance health observations | No named on-call operator, approved alert destination, running external monitor, alert delivery test, or acknowledgment proof was found in the reviewed release documents. Absence from these documents is not a claim that all provider/account alert settings are absent. |

The existing 100-identity capacity report remains useful bounded evidence: [results](../capacity/results-2026-10-08.md). It ran the HTTP adapter on loopback against hosted services, so it cannot establish public Vercel concurrency, email onboarding, or native host recovery.

## Repeat after the final deployment

From the repository root with Node 22:

```sh
node creative/nooks-release/operations/probe.mjs --require-accounts --out /tmp/nooks-postdeploy-probe.json
```

The output file must not already exist. Exit 0 means this limited transport/configuration check passed; exit 2 means an observed check failed. The probe makes one GET each for the public HTML, config, health, anonymous workspace, and native health, plus HEAD requests for at most six same-origin entry assets. Redirects are not followed. Every request has a 15-second timeout, response bodies are capped at 128 KiB, and no retries, credentials, alerts, or private user requests are sent. JSON is reduced to an allowlist; keys and arbitrary error bodies are not logged. The anonymous workspace call may create the application's normal redacted denial log but cannot create account data.

Use the same command without `--require-accounts` only when assessing an intentionally device-only preview. Do not present that result as account readiness. The CLI fixes the two existing production destinations; the exported function accepts HTTPS origins for a reviewed staging harness. A passing configured result requires the **existing Nooks Supabase URL**, a public-key format, accountSync and community capabilities. It still does not exercise those features.

After this sample passes, record the exact Git commit, public deployment ID, native version/deployment ID, migration set, and selected asset hashes in the release record. Then verify actual browser email/code arrival, callback, session refresh, sign-out/account switching, two-user room updates/reconnect, note save/reopen, practice retry, and the relevant private artwork boundary. Open a fresh native frame for equivalent supported host flows. Keep fixture study content and invitation codes out of reports. A mounted older frame is not proof of the newly deployed bundle.

Health has a 60-second per-instance observation TTL. `unknown` is expected on cold or idle instances and cannot be promoted to a successful database readiness result. `recent_failure` deserves investigation. Even `recent_success` does not establish every dependency or another instance. The outbox remains intentionally disabled; its health label `authenticated_polling` is not authoritative proof that browser realtime channels are connected.

## Optional authenticated canary

`authenticated-probe.mjs` closes the configuration-only blind spot by requesting the actual public `/api/workspace` route with an operator-supplied dedicated canary user's access JWT. The public origin and expected Supabase issuer are fixed in source. First it validates the deployed config without credentials, then it sends exactly one authenticated GET only when the config matches. Redirects are never followed; each request has a 15-second timeout and a 128 KiB response cap. The output contains only fixed check labels, status, duration, bounded diagnostic codes, timestamp and the known public origin. It does not persist the JWT, identity, workspace body, configuration key, error body, or exception message.

The operator must first initialize a dedicated empty canary account and arrange short-lived token injection through their existing secret manager/environment. Do not use a student's account, a service-role JWT, or a Supabase secret key. Do not paste tokens in commands, shell history, reports or Git. With `NOOKS_CANARY_ACCESS_TOKEN` already injected by that operator-managed mechanism, run:

```sh
node creative/nooks-release/operations/authenticated-probe.mjs --out /tmp/nooks-authenticated-probe.json
```

Exit 0 means this one authenticated read path returned the expected connected Supabase workspace envelope. Exit 2 means failure. Missing, malformed, wrong-project, non-authenticated-role, expired, or next-30-seconds-expiring JWTs fail before any network request. Local claim inspection is only a guard against sending the wrong credential; the application and Supabase still perform actual authentication. HTTP 401 is an authentication rejection (possibly revocation or expiry), while 503 indicates backend unavailability. A passing `/api/health` cannot override either failure.

This script never provisions an identity, logs in, refreshes tokens, calls a write tool, or schedules itself. The caller owns renewal, expiration handling, revocation and protection of the dedicated credential. The GET is read-oriented, but the existing application's normal identity/quota bookkeeping and legacy workspace hydration can write server-side; use an already initialized empty canary account and do not describe this as SQL read-only. The output file must not already exist. At 08:27:59 UTC on October 8, root explicitly authorized one disposable initialized empty fixture to validate this implementation. The actual public probe passed: config HTTP 200 in 159 ms and authenticated workspace HTTP 200 in 587 ms. Its JWT was passed in memory directly, never persisted. Session revocation, account deletion and Auth deletion all succeeded; the verification found zero accounts and Auth returned 404. See `authenticated-probe-live-2026-10-08T08-27-51.030Z.json` for the content-free sample and the matching `authenticated-probe-fixture-2026-10-08T08-27-51.030Z.json` for exact cleanup IDs/private throttle topic. This disposable validation does not provision a persistent operator canary or schedule.

Six focused tests cover success without private output, 401/503, configuration mismatch without credential transmission, malformed/oversized/redirected responses, unsafe/expired JWT rejection, and exception redaction. Together with the existing four transport tests, all ten passed. This prepares an operator-controlled monitor; it does not establish a configured schedule, delivered alert, email journey, save/recovery, or Realtime health. Owner setup and an alert delivery/acknowledgment test remain open.

## Monitoring and incident procedure

Before inviting a public population, name an operator and backup operator, choose an existing approved alert destination, and agree on initial service targets. Suggested starting checks are a one-minute external liveness/config sample with two consecutive failures before notification, plus deployed-user journey tests after releases. These are proposals, not installed schedules or contractual SLAs. Do not trigger an incident on a native access gate or a cold-instance `unknown` alone.

Build any alert using only timestamp, environment, deployment ID, operation, status/code, duration, and generated request ID. Do not attach note bodies, raw exceptions, authorization headers, account IDs, signed URLs, or invitations. Existing failure logging bounds output to 20 events/minute/instance and reports suppression; log counts alone are not complete traffic/error metrics. A delivered test notification and operator acknowledgment must be recorded before claiming alerting works. No alert was sent during this audit.

On failure: preserve pending user edits; capture the safe request ID and affected deployment; check provider status and runtime logs scoped to that request/time; distinguish configuration, Auth, database, artwork, generation, and frontend failures; verify the proposed repair with the affected journey. A controlled denial is not a database outage. If data integrity may be at risk, use a reviewed feature/write pause rather than resetting user state. Do not rerun bulk load tests as a health probe.

Application rollback: choose a previously tested build and verify compatibility with the current migrations, dual-format artwork parser, and generation fence. Restore the existing public alias/native version through the supported deployment workflow. Keep the current database schema unless an independently reviewed migration rollback is proven compatible. Repeat the bounded probe and actual affected user journey in a fresh frame. A successful deploy response alone does not prove recovery.

## Recovery gate that remains open

The latest backup listed by the provider establishes availability only. It does not establish recoverability, application consistency, or an achieved recovery time/data-loss target. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) states that Pro has seven days of daily backups and database backups omit Storage object bytes; PITR is a separate option. No guarantee is inferred from those defaults beyond the actual dashboard observations above.

A real drill needs an explicitly approved isolated destination, an operator, encrypted backup access, selected recovery timestamp, and private image-byte backup source. Never restore over live Nooks to test a backup. Restore SQL plus the corresponding private object bytes; preserve Auth/configuration requirements; verify migrations/RLS/ACLs, two-identity denial, note/practice contents and retries, image hashes/downloads, sharing, and event replay/deduplication semantics. Record elapsed recovery time, maximum lost-data interval, backup/object coverage, fixture cleanup, and differences from production. Avoid exporting private content into Git or an agent report. Creating a new paid project or enabling PITR is not part of this audit.

The earlier [local restore drill](../../../app/docs/production/local-restore-drill-2026-10-04.md) remains local evidence; it does not close this hosted drill. For preservation of legacy artwork and generation cleanup semantics, use the existing [operational acceptance](../../../app/docs/production/operational-acceptance-oct4.md) and linked lifecycle runbook.

## Retention follow-up

`inventory.sql` is a read-only, timeout-bounded aggregate inventory for the dedicated Nooks project. Record a second sample after an agreed interval to calculate growth. Do not purge the backlog merely because no consumer is active. Choose retention separately for delivered, never-claimed, leased/retrying events and inbox idempotency data. Any pruning implementation needs dry-run counts, explicit bounds, lock/statement deadlines, and regression tests for leases, late acknowledgments, retries and idempotency. No retention period or cleanup schedule is silently chosen here.

## Verification of this tooling

Four focused regression tests pass: configured transport remains explicitly not comprehensive readiness; HTML fallback and exposed workspace cannot pass; device preview fails the account gate; secret config values/arbitrary response bodies are excluded. A real predeployment sample was then run and correctly failed the account gate. The Supabase changelog was checked; its PostgreSQL 17.11 notice concerns ltree/btree_gist/custom estimators/legacy PGP ciphers. No such constructs were found in the Nooks migration sources reviewed here; this is not a full provider-wide upgrade audit.

A later one-fixture canary repeated only this authenticated check after root reported public release `9z41r5dtu` on the stable alias. `authenticated-probe-live-2026-10-08T09-01-55.339Z.json` passed configuration HTTP 200 (110 ms) and authenticated workspace HTTP 200 (420 ms). Its matching fixture report verifies successful session/account/Auth cleanup, zero account rows and absent Auth identity. The exact private throttle topic was handed to root for guarded cleanup. This was not a repeated smoke/load suite, email verification, or scheduled monitor.
