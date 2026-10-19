# Outbox audit — October 8, 2026

The 1,320 pending rows are historical, never-claimed workspace invalidations. They are not evidence that a required delivery worker failed. The current UI does not require outbox claim/ack delivery. **Do not remove the table or its writers:** current browser realtime hints are triggered by new outbox rows and payload updates, even though they bypass the durable delivery consumer.

This was a read-only source and aggregate database audit of Nooks project `lcfcjglybfeozyrjjikk`. The Supabase skill was read. No event bodies, account identifiers, notes, credentials, or invitation data were read or recorded. No rows, schema, schedules, destinations, or deployment settings were changed. Only this report was written. Source checkout HEAD was `0a1c575eab212fc637d48be1db896a489159725c`, with the current release changes present in the working tree; HEAD alone does not identify the audited working tree or deployed bundle.

## Direct evidence

The table is **`public.nooks_outbox`**, not `nooks_private`. Its public schema placement does not make it client-readable: the original migration enables RLS, revokes public/anon/authenticated access, grants service-role access, and adds no outbox client policy.

Read-only SQL at **2026-10-08 08:01:12.786045 UTC**, bounded by a five-second statement timeout, returned:

| Aggregate | Value |
| --- | ---: |
| Total / workspace.changed | 1,320 / 1,320 |
| focus.changed / community / other event types | 0 / 0 / 0 |
| Never claimed | 1,320 |
| Delivered / attempted pending / active leases | 0 / 0 / 0 |
| Total relation bytes, including indexes | 679,936 (0.65 MiB) |
| Oldest creation timestamp | 2026-10-04 02:37:37.800828 UTC |
| Newest availability timestamp | 2026-10-08 07:56:21.913801 UTC |

A separate aggregate-only query found one account with never-claimed workspace hints and **1,319 older duplicate hints beyond one per account**. It did not return the account ID. The operations inventory earlier this morning also reported 1,320 rows and 679,936 bytes. This is consistent with bounded workspace coalescing; it does not establish long-term growth under a community workload.

## Purpose and active dependencies

- [`202610010001_nooks_production.sql`](../../../cloud/supabase/migrations/202610010001_nooks_production.sql) defines the durable ledger: stable UUID, event type, account/room references, minimal JSON payload, timestamps, lease, attempts, delivery status and last error. Account and room references cascade on deletion. Workspace payloads contain a revision; community/focus payloads contain identifiers, not study bodies.
- [`202610010003_nooks_events.sql`](../../../cloud/supabase/migrations/202610010003_nooks_events.sql) provides service-only `SKIP LOCKED` claims, expiring leases, matching-token acknowledgments and bounded retry backoff. It does **not** implement a worker, retention, maximum-attempt terminal state or dead-letter workflow. A future consumer still needs deduplication by stable event ID.
- [`20261004201449_artwork_generation_lifecycle.sql`](../../../cloud/supabase/migrations/20261004201449_artwork_generation_lifecycle.sql), around lines 299–304, preserves the production-hardening coalescing behavior: update the newest never-claimed `workspace.changed` row; leave leased/retried/delivered events immutable. Existing older rows were deliberately retained. New community and focus lifecycle events still append.
- [`20261008061921_realtime_invalidations.sql`](../../../cloud/supabase/migrations/20261008061921_realtime_invalidations.sql), lines 39–48, attaches `AFTER INSERT OR UPDATE OF payload` to the outbox. It emits a throttled private `{"v":1}` invalidation for the affected account/room via `realtime.send`; it never claims or acknowledges the event. Room, membership and profile triggers emit additional hints directly. Suppressed or failed broadcasts are repaired by authoritative API refreshes.
- [`account/client.ts`](../../../web/ui/src/account/client.ts) subscribes to private invalidation channels; [`community/liveSync.ts`](../../../web/ui/src/community/liveSync.ts) reconciles snapshots every 45–60 seconds while usable. Neither reads durable outbox payloads or requires a dispatcher. Native clients retain the supported polling path.
- Repository search found `createSupabaseOutbox` definitions and tests but no production caller/worker. [`operations.mjs`](../../../web/server/operations.mjs) explicitly reports `eventDelivery.mode: disabled` and `consumerConfigured: false`. Its `uiUpdates: authenticated_polling` label is incomplete for the new browser realtime path and must not be treated as transport telemetry.

## Risk assessment

**Current functional risk: low from this backlog.** Existing saved state, focus totals and membership are authoritative tables, not reconstructed from outbox delivery. Claiming and acknowledging every row merely to make a dashboard green would invent delivery that never happened and discard future replay semantics.

**Scale/retention risk: real, not an immediate storage incident.** The current backlog is small. Coalescing bounds new never-claimed workspace hints, but community/focus events, future retries and delivered history have no ongoing retention policy. Adding a dispatcher alone would stop neither historical storage growth nor indefinite retries. A current row count cannot be extrapolated into production storage cost or latency.

**Privacy risk: metadata retention.** The service-only ledger contains revisions, timestamps and account/room/session references. These remain sensitive metadata even without note bodies. Account/room cascades provide partial lifecycle cleanup, but a room-scoped focus event may retain a session identifier after that participant's account is removed while the room remains. This is not a demonstrated client disclosure. Future worker error strings must remain redacted: `last_error` permits up to 500 characters supplied by the worker.

**Retention trap:** coalescing changes `payload` and `available_at` without changing `created_at`. An old creation date does not mean the latest workspace hint is inactive. Age-only pruning must not delete the sole latest live hint or remove the insert/update trigger on which realtime depends.

## Bounded next iteration

1. Keep dispatcher delivery explicitly disabled until an actual external consumer and delivery contract exist. Do not create a noop dispatcher or mark rows delivered. Update the health description to distinguish “durable consumer disabled” from “browser hints plus reconciliation” if touching that operational API, without claiming actual socket connectivity from configuration.
2. The smallest safe cleanup candidate is **deduplicating only older never-claimed workspace invalidations**, retaining the newest `(created_at DESC, id DESC)` per account. The current dry-run aggregate is 1,319 eligible duplicates; this is a candidate count, not permission to execute unreviewed deletion. Preserve every other event type and every row with attempts, lease token, delivery timestamp or ambiguous state. No time-based deletion is needed for this candidate.
3. Implement and test that cleanup first on synthetic local data. Use a service-only routine, per-account workspace row lock to serialize with commits, then deterministic event-row locks with `SKIP LOCKED`; recheck eligibility after locking. Use an explicit per-call maximum (for example 100 rows), a three-second lock timeout and five-second statement timeout. Do not lock a keeper and then permit a concurrent commit to skip it and create another hint; take the workspace lock first. Skip contested accounts. A concurrent claim must either win and preserve its row or wait/skip safely; no lease may be invalidated.
4. Prove: the newest revision and keeper UUID survive; all historical leased/retried/delivered rows survive; another event type survives; a concurrent save/claim is safe; a repeated cleanup is idempotent; a subsequent workspace save still emits the expected private invalidation; RLS/client denials remain unchanged. Include both source snapshots that own migrations, preserving unrelated differences. Root should independently review any production migration and exact dry-run counts before executing bounded batches.
5. Separately design community/focus/delivered/inbox retention with the real future consumer contract. Do not apply a guessed seven- or thirty-day period. Record aggregate growth during actual usage, retry age and attempted counts. Retain idempotency receipts for at least the applicable replay horizon. Alert on observed growth/headroom and unexpected attempts while delivery is disabled; do not page solely because intentionally pending count is nonzero.

The recommended cleanup is an operational improvement, not a prerequisite for the present browser invalidation mechanism to work. No cleanup or source change was performed by this audit.
