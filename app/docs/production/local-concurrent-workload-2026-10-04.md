# Local concurrent workload and focus race checks — October 4, 2026

Result: **passed after fixing a confirmed focus membership race**. The [recorded run](local-concurrent-workload-2026-10-04.json) began at 19:30:09 UTC on PostgreSQL 14.20. It includes all six migration hashes, bounded workload settings, per-operation measurements, five deterministic race results, and successful cluster cleanup. No hosted load or deployment was performed by this test.

## Reproduce and limits

```sh
node supabase/tests/run-concurrent-workload.mjs --report docs/production/local-concurrent-workload-2026-10-04.json
```

Use Node 22+ and local PostgreSQL binaries; `NOOKS_TEST_PG_BIN` optionally selects their directory. The runner creates a disposable cluster on a private Unix socket, verifies TCP is disabled, strips inherited connection settings and secrets, disables password-file discovery, and removes its cluster after stopping it. It accepts no connection URL, duration, or scale override.

There are two finite phases: 100 and 1,000 synthetic materials **per owner**, with two new owners in each phase and four owners total. Earlier phase fixtures remain in the same disposable cluster. Each owner has notes, cards, quizzes, and exams, with repeated IDs across owners to exercise account isolation. Seed workspaces contain about 110 KB and 1.10 MB per owner respectively; this does not exercise the 16 MiB workspace byte limit.

Each phase has six concurrent clients and one observer. Four writers each perform six saves: two autosave writers, one checkpoint/navigation writer, and one focus writer. A reader makes twenty navigation polls plus four full workspace reads. A community client runs six cycles of heartbeat, snapshot, and nook-list calls for both owners. Each synthetic public operation uses the production `180/60` quota parameters, for 84 quota calls per phase; internal CAS retries do not consume an extra request. Checkpoint and navigation changes deliberately share a synthetic transaction, so this is not an exact public API replay.

The test uses 60–100 ms pauses between actions to create a brief overlap burst. These are compressed correctness scenarios, not a claim about actual UI cadence or sustainable throughput. Each phase is capped at 45 seconds, each statement at 8 seconds, and each lock wait at 3 seconds. At most 100 monitoring samples are allowed. The recorded workload phases lasted 2.21 and 3.20 seconds. Five separate deterministic race scenarios run afterward with three clients each and the same per-statement/lock limits.

## Confirmed defect and migration

The initial implementation checked nook membership before inserting a new shared-focus record. A concurrent `leave_nook` could finish between that check and the insertion, cancel no record, and then allow the insertion to leave an active focus clock for a departed member. The local reproduction at 19:27:12 UTC observed `membershipLeft=true`, `focusStatus=active`, and `activeClock=true` after both RPCs succeeded. The workload runner reported failure and removed its test cluster.

[20261004192857_focus_membership_serialization.sql](../../supabase/migrations/20261004192857_focus_membership_serialization.sql) adds shared room-row locks before any affected focus-ledger lock or insertion. It includes both requested and persisted room bindings and acquires multiple rooms in UUID order. Community leave/archive already lock the room before changing membership and cancelling focus. This gives those operations a consistent order while permitting different members' focus operations to hold compatible shared room locks. The function signature, invoker security, empty search path, owner, and service-only execution permissions are preserved. The migration does not rewrite existing data or change grants.

The deterministic tests install temporary test-only triggers and advisory gates in the disposable database. These force the relevant overlap and are excluded from timing samples. All five now pass without SQL errors or deadlocks:

| Overlap | Verified result |
| --- | --- |
| New focus reaches insertion before leave | Leave waits, then cancels the new record; no active clock remains. |
| Leave holds room before completion | Completion waits; the shared focus remains cancelled. |
| Completion holds room before leave | Leave waits; the finished record remains completed. |
| Archive holds room before completion | Completion waits; the shared focus remains cancelled. |
| Completion holds room before archive | Archive waits; the finished record remains completed. |

The reverse-order completion cases also detect an unsafe fix that locks a focus row first and then waits for the room while leave/archive already hold the room and need that focus row.

## Recorded workload results

| Measurement | 100 materials/owner | 1,000 materials/owner |
| --- | ---: | ---: |
| Successful saves | 24 | 24 |
| CAS conflicts, both owners combined | 7 | 21 |
| Maximum attempts for one save, limit five | 2 | 3 |
| Workload database calls, excluding observer | 206 | 234 |
| Full workspace read: database median | 3.251 ms | 33.319 ms |
| Full workspace read: local client median | 6.562 ms | 78.181 ms |
| Logical autosave median, including retries | 23.252 ms | 367.423 ms |
| Logical autosave p95, twelve samples | 100.219 ms | 703.634 ms |
| Navigation poll: database median | 0.019 ms | 0.025 ms |
| Navigation poll: local client median | 0.727 ms | 0.685 ms |
| Navigation poll median response | 157 bytes | 157 bytes |

All expected revisions, final note contents, checkpoint/navigation state, and focus completion survived. Unchanged artifacts matched their originals exactly. Authenticated reads contained only the actual owner's rows. No SQL, deadlock, serialization, lock-timeout, statement-timeout, or retry-exhaustion errors occurred in the workload phases. Focus credit stayed within actual elapsed wall time, and each owner retained exactly one latest unclaimed workspace invalidation hint. Peak sampled activity reached all six clients; the observer does not establish that every brief lock wait was captured.

Database timing covers the timed SQL expression, excluding SQL parsing/planning and final output transmission. `clientMs` additionally includes psql, output serialization/transfer/JSON parsing, and shared Node event-loop waits; input JSON/SQL construction happens before that timer. `logicalSaveMs` measures the complete synthetic action, including quota, input construction, mutation, reads, forced initial overlap where applicable, and CAS retries. Percentiles from these small samples describe this run only.

## Actionable performance observations and remaining coverage

The visible scaling cost is full-workspace reconstruction and retry amplification. At 1,000 materials, each full read returned about 1.12 MB; 49 reads transferred 55.03 MB locally across the short phase. Twenty-one stale attempts caused additional full reads and writes even though each accepted action changed only a note or small metadata record. A follow-up optimization should evaluate bounded artifact reads and separate revisioned checkpoint/focus/session writes while retaining transaction and stale-edit guarantees. This result does not justify weakening CAS or increasing retries without measurement.

Lightweight navigation polling stayed near 157 bytes and 0.025 ms median database time at 1,000 materials. It should continue to avoid hydrating notes and artwork. The test does not identify it as the database bottleneck.

This is a local direct-SQL test with Auth/Storage/Realtime schema stubs, compressible synthetic material, small focus history, and two-person community membership. It excludes HTTP/PostgREST, JWT verification, deployed server compute, real Storage files, WAN latency, native UI, large histories, production hardware, and sustained traffic. No production capacity, concurrency allowance, hosted SLO, or release gate is established by these timings. PostgreSQL's documented Read Committed snapshots and row-lock behavior explain why a membership check and later insertion require explicit shared coordination. [Transaction isolation](https://www.postgresql.org/docs/14/transaction-iso.html), [row locks](https://www.postgresql.org/docs/14/explicit-locking.html)
