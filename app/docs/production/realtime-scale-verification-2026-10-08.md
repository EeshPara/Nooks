# Realtime and community scaling — local verification

Implemented locally; **not proof of hosted deployment, public account onboarding, or 1,000 connected users**. Native Sites identity still uses its authenticated polling fallback. Browser Realtime requires the existing Supabase Auth integration to be configured and verified against the same account identity.

## Changes

- `20261008061921_realtime_invalidations.sql` emits private `invalidate` events with exactly `{"v":1}` on `account:<Nooks account UUID>`, `nook:<nook UUID>`, and `nooks:directory`. The browser Auth user UUID is not the Nooks account UUID.
- Outbox inserts and coalesced payload updates, public room changes, member changes, returning presence, and profile changes issue refresh hints. Private-only room activity does not issue directory hints. Events contain no identity, member counts, scores, revisions, invitations, artwork, or study material.
- Nonblocking transaction advisory locks and per-topic throttles cap attempts to one/account/second, one/nook/two seconds, and one/directory/ten seconds. Suppressed/dropped hints are repaired by authoritative API snapshots. No durable delivery claim is made; the existing outbox delivery lease is not acknowledged by this mechanism.
- Existing authorization maps Supabase Auth to a persisted Nooks account. The directory requires that verified account; room channels require active membership in a nonarchived room. Account/directory channels are receive-only. Legacy room client presence remains permitted but never establishes credit or authoritative online counts.
- `20261008061924_scalable_community_snapshots.sql` maintains completed-focus seconds per member/room in a private RLS-enabled table, backfills under a write-blocking table lock, and avoids rescanning each member's entire history on every leaderboard read. Updates and deletions adjust totals exactly. Members and leaderboard remain bounded to 50. Stable member ordering and partial page/online indexes improve consistent reads.
- Server presence writes are limited to once per member per 15 seconds, including multi-tab heartbeats. Displayed online counts are derived from the existing 90-second database timestamp window.

## Client contract and limits

Subscribe with Supabase JWT, `config.private: true`, event `invalidate`, exact payload version 1. Refresh on subscription and reconnect. Coalesce events, randomize refresh times, and periodically reconcile; throttling intentionally has no trailing-event delivery guarantee. Refreshing 1,000 clients every five seconds would require 200 snapshots/second before directory/auth/quota overhead; the local measurement below does not support claiming that load. Start with longer cooldowns and 45–60-second reconciliation, then measure production. Heartbeat a visible joined room approximately every 45 seconds with bounded jitter.

Remove channels on sign-out, identity changes and navigation. Always fetch authorized state before displaying updates. Supabase caches channel authorization until JWT refresh/expiry: a removed member can temporarily receive content-free hint timings, while new channel joins and every authoritative API read reject revoked membership. Do not send private payloads over these channels. No cross-surface identity equivalence is implied.

Realtime delivery failure does not reject saved work. Broadcast partitions and actual delivery require a connected hosted client; local SQL tests use an explicit capture stub, not a Realtime service. Throttle rows are bounded by the number of account/room topics that have emitted hints, plus one directory row; deleting accounts/rooms currently leaves these content-free throttle rows behind. Add operational retention if account churn grows.

## Verification

`node supabase/tests/run-local.mjs` passes independently in both `app/` and `cloud/`, preserving their different installed function bodies, and verifies every migration and permission, privacy, community, artwork, library, and new realtime/scale suite. New checks cover exact event envelope, private directory isolation, burst bounds, profile hints, heartbeat suppression, corrected/deleted credits, identity mapping, directory presence/broadcast forgery rejection, and persistence through simulated broadcast outage. The runner now includes the previously omitted library collaboration test.

`node supabase/tests/run-community-load.mjs [--baseline] [--report file.json]` creates its own finite Unix-socket-only PostgreSQL cluster. It never reads a hosted database URL. Fixture: 1,000 members in one room, 100,000 completed sessions; 32 SQL connections; 640 transactions per phase. The join phase begins with 360 members and concurrently joins 640 distinct accounts. Statement/lock deadlines are eight/three seconds. Final member count, 50-member response, 50-person leaderboard and exact credits are asserted.

| Operation | Before p95 | After p95 | After successful transactions |
| --- | ---: | ---: | ---: |
| Concurrent joining | 130.8 ms | 131.9 ms | 640/640 |
| Member/leaderboard snapshot | 396.9 ms | 345.9 ms | 640/640 |
| Presence heartbeat | 21.8 ms | 40.0 ms | 640/640 |

Snapshot response was 13,542 bytes; observed snapshot throughput was about 94 before / 108 after transactions per second. This is a short, single-machine, warm-cache sample with fsync disabled. Heartbeat timing regressed in this sample; no blanket latency improvement is claimed. The structural gain is independence from historical session count, and fewer repeated presence writes. The independent older native/cloud baseline also passed the same load fixture: join p95 229.7 ms, snapshot p95 339.4 ms, heartbeat p95 21.4 ms; all 1,920 operations succeeded with identical counts and credits. The existing concurrent CAS/workspace/navigation/focus correctness workload also passed on Node 22. Detailed observations are in `realtime-scale-local-2026-10-08.json`.

## Required production evidence

1. Review and apply selected migrations against the existing Nooks project after inspecting hosted state; the scaling migration preserves the installed community function and patches only four exact, occurrence-checked SQL fragments. Both current development and older native baselines are tested independently; an unknown installed function shape aborts the migration.
2. Run database advisors and verify private-table grants, trigger execution, aggregate backfill and snapshot behavior on hosted PostgreSQL.
3. Verify actual multi-account browser Auth, private subscriptions, delivery, reconnect, sign-out, membership revocation and fallback. Native Sites identity must continue its authenticated fallback until a native transport is verified.
4. Measure 1,000 simultaneous hosted sessions within the current plan's connection/message quotas, including API authentication/quota overhead, snapshot bursts, presence, room joins, latency, failures and database lock waits. Local SQL clients are not connected browser clients.
5. Verify existing backup/restore, monitoring and public registration controls before production readiness sign-off.

References checked October 8: [Realtime database broadcast](https://supabase.com/docs/guides/realtime/broadcast), [channel authorization and caching](https://supabase.com/docs/guides/realtime/authorization), [July schema lockdown](https://supabase.com/changelog/realtime-schema-locked-down-against-modification). Migrations call the supported `realtime.send` API and only change allowed Realtime RLS policies; no hosted Realtime schema objects are created or replaced.
