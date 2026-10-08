# Independent Nooks release judgment — 4 October 2026

Historical judgment. The [October 8 independent grade](../../creative/nooks-release/final-independent-grade.md) supersedes the deployment and capacity evidence below; public email onboarding and other documented launch gates still remain.

Status: the first deployed build received a scoped judgment; the subsequent crash-recovery and concurrency source round now passes independent review, with deployment evidence tracked separately below. This is not a public-production or student-pilot sign-off.

## Release scope and decision

**Public production: FAIL.** The public website is explicitly an unconfigured preview in `docs/plugin-setup-status.json`. Browser Auth delivery, two real hosted accounts, real private Storage transfers, recovery, and capacity evidence remain missing. Passing mocked adapters and local SQL does not establish these properties in deployment.

**Private native student pilot: HOLD.** The first round of source defects is fixed and independently retested; subsequent findings are tracked below. Actual recovery across a reload in a newly mounted native iframe remains unverified, as do two real students' identity separation and community journeys. Existing native tabs still contain the prior UI until reopened. Tooling could inspect the existing frame but could not reload it or write a harmless Storage sentinel; this review did not disturb the existing quiz to manufacture evidence. A pilot must not be called ready before those gates are exercised.

**Controlled owner/developer testing: PASS.** The deployed backend accepts fresh authenticated native reads, the current mounted workspace remains stable, source fixes pass review and regression tests, SQL isolation/CAS checks pass, and the quota is correct under an independently forced two-connection race. This approval covers continued supervised testing with the existing private Sites access and synthetic fixtures. It does not authorize a student rollout or establish a supported capacity. Keep public browser account sync, cross-surface account linking, WebSocket delivery, custom-art publication, automatic image handoff, and webhook delivery explicitly outside the supported claims.

Only the dedicated Nooks project `lcfcjglybfeozyrjjikk` is in scope. This review did not read or modify another project, create paid resources, run destructive operations, or read credentials.

## Concrete findings

### J1 — Failed practice saves disappear on screen exit (P1, source fix verified)

`ui/src/study/usePracticeCheckpoint.ts:48` stores the pending checkpoint in a component ref. The failed-write path at lines 72–75 restores only that ref. Unmount at line 101 attempts another asynchronous flush, then the ref is discarded. The module map stores promises, not checkpoint data. The visible Library controls in the practice components do not wait for a successful checkpoint before leaving. A network outage followed by exit/remount or reload can discard answers and position.

Required proof: simulate failed save, exit/remount, restore the exact same session/answers, retry successfully, and verify a different account cannot receive that recovery. Native recovery needs an account or host-session boundary that cannot blend users.

Re-review: `pendingStudyStore.ts` now preserves checkpoints/results/editors in a bounded tab store; own-property lookups cover prototype-named IDs and delayed acknowledgments cannot delete newer work. Failed browser/native-account work uses the originating verified account scope. Native scope comes only from the issued server identity, reaches the UI through private metadata, and is installed after authenticated `workspace_get` before study content mounts. Account changes during response parsing or a result-flush loop fail closed and retain the original queue. Source and focused tests pass. Actual native iframe Storage/reload persistence still requires a deployed exercise.

A final re-review caught a separate initialization path: chat-view refresh originally dropped private recovery scope, and the retry loader could unlock a Supabase study surface without it. The completed fix forwards the verified metadata and rejects missing/invalid scope before native study content becomes editable. Independent controller-to-loader regression, missing-scope checks, and preservation of pending results all pass.

### J2 — A missing decorative image locks the study library (P1, source fix verified)

`server/supabase-store.mjs:48–71` hydrates the current backdrop and every private creator-draft image before returning any workspace. Missing objects, Storage outages, hash mismatch, or invalid images throw. `artifact_get`, normal note autosave, and even removal of the bad background first load the whole workspace, so a nonessential asset failure blocks unrelated academic work and its ordinary repair action.

Reproduced independently with an in-memory Supabase adapter, a saved note, a valid owner-scoped background reference, and a Storage 404. Reading the note returned `Saved artwork is temporarily unavailable.` No remote data was used.

Required proof: missing/timeout/corrupt artwork is visibly degraded while notes remain readable/saveable; unrelated saves preserve the original reference, and explicit removal works. Foreign-owner references must still fail closed.

Re-review: artwork hydration now validates ownership first, loads distinct images concurrently with a three-second bound, returns warnings on Storage/network/content failure, and retains valid owned references. Note saves, renames, private draft edits/deletion, and explicit image removal continue to work. The independently run regression suite covers missing/redirect/network/corrupt outcomes and owner-reference denial. The final App renders a warning and retry button; normalization clears warnings after a good response. Actual private Storage transfers/failure recovery remain unexercised in deployment.

### J3 — Stale study-plan edits silently replace other work (P1, source fix verified)

`server/engine.mjs:247–259` replaces the whole task array but checks `expectedRevision` only when supplied. The plan controls in `ui/src/App.tsx` omit it. Two tabs loaded from the same plan can both save and silently erase the other tab's change.

Reproduced independently using the actual `StudyEngine` with an in-memory transaction adapter: save stale tab A's task, then stale tab B's task with no revision. Both calls succeed and only B's task remains. A stable plan-specific revision is preferable to conflict on every unrelated workspace save.

Required proof: two concurrent edits from one revision yield a conflict or a deliberate merge; the UI preserves the losing edit and presents recovery. Every plan mutation caller must participate.

Re-review: `expectedRevision` is now required by the engine/tool schema; UI plan mutations pass the loaded workspace revision. Browser transport preserves error codes, and conflicts refresh the current workspace without resubmitting stale tasks. The plan form keeps its draft for explicit retry. Independent concurrent-write/CAS and UI conflict tests pass. Workspace-wide revisions may cause a safe conflict on an unrelated write; a plan-specific revision is a future usability optimization, not a reason to weaken the guard.

### J4 — Operational growth and recovery have no deployed proof (public release blocker)

The original workspace commit appended an outbox event for every mutation, including recurring practice checkpoints. The reviewed `20261004185440_production_hardening.sql` now reuses the latest never-claimed workspace invalidation for the account, while preserving leased/retried events and all historical rows. This bounds that source of new event growth when no consumer is running; community/focus events and any eventual delivered/retried history still need a retention policy. `server/supabase-store.mjs` and migration 3 provide helper APIs, but no deployed dispatcher, retention job, or dead-letter workflow is established. Uploaded images can be orphaned by failed commits. These are operational growth risks even though current UI delivery uses polling and does not require the outbox.

The initial review found that browser unknown failures became the same 503 without useful diagnostics, native Worker logs could contain arbitrary exception text, and health reported configuration alone. The primary server and cloud Worker patches now emit generated correlation IDs and bounded, allowlisted failure metadata, and expose expiring per-instance observations separately from configuration/liveness. Independent source review, all three primary diagnostics regressions, and all seventeen cloud tests pass, including HTTP-200 MCP failures and no health probes. The reviewed cloud source is deployed. The completed synthetic local SQL restore drill below strengthens recovery evidence. An alert destination and an executed hosted SQL/private-Storage recovery drill are still unestablished.

Required proof before public rollout: named operator, redacted request/error identifiers, actual health/failure visibility, measured storage/outbox growth, reviewed retention/cleanup approach, and an isolated restore drill covering SQL and private Storage. A runbook alone is necessary but not proof that restore succeeds.

**Outbox delivery itself is not a current UI release requirement.** `ui/src/community/useLiveNooks.ts` uses authenticated polling; `ui/src/workspace-session.ts` polls the account's navigation state. Neither consumes outbox messages. Keep webhook/event-dispatch capabilities explicitly disabled unless a consumer is added. Unused event accumulation is still an operational growth issue; implementing a delivery worker would not automatically solve retention.

## Evidence-backed release gates

### Follow-up source review after the first scoped verdict

The earlier controlled-testing approval applies to the reviewed deployed build. The subsequent source round passes independent review after the following additional defects were fixed. This approves controlled testing of the new code, not an unverified deployment or a student rollout.

- **J5 — Note recovery disappears on same-document remount when Storage is blocked/full (P1).** `ui/src/study/noteRecovery.ts` originally had no memory overlay: failed Storage writes returned false, and new recovery instances read nothing. `NoteWorkspace` cleanup stops and discards the component's autosave controller. A proposed crash-boundary “Reopen” would therefore lose unsaved note text after a failed save, even without a page reload. Independently reproduced by retaining a valid dirty note with a throwing Storage adapter and creating a second recovery instance: durability returned false and no draft was recovered. Required fix: bounded account-scoped memory recovery with honest reload warnings and acknowledgments that cannot erase a newer draft. Source fix independently verified: bounded account-scoped memory overlay retains dirty notes when Storage fails; exact-draft acknowledgment cannot remove newer writing. Blocked-storage remount and late-ack regressions pass.
- **J6 — Top-level private-site recovery skips verified account initialization (P1).** The cloud Worker exposes authenticated REST workspace/tools routes, but the production native build opened as a normal private-site page has `isPublicPreview=false` and `isEmbedded=false`. `App.receiveLoadedWorkspace` originally installed/required private recovery scope only when embedded. Independently invoked the actual extracted loader with a valid Supabase workspace and recovery scope in top-level mode: it became ready while installing no scope. Notes then pass undefined to recovery, which silently reports success without storing anything; other practice stores use the generic host memory scope. Required fix: require/install the verified scope for non-public Supabase workspaces regardless of iframe placement, while preserving local-demo behavior. Source fix independently verified: every non-public Supabase workspace now requires and installs the verified recovery scope. Top-level, missing-scope, retry, and refresh tests pass.
- **J7 — Public/native continuity and implementation docs drift (P2).** Website Supabase Auth and native Sites identities intentionally use separate namespaces and are not linked. Browser account-dialog copy should state this boundary alongside its device-library disclosure. The primary README still describes current community/account features as deferred mockups and says MCP/native hosting are unverified, contrary to the dated deployment evidence. Re-review: the README and account dialog now explicitly distinguish website, device, and native libraries, deployed owner-private MCP, and remaining gates. Local preference reads/writes now use the verified native scope; old unscoped keys are readable only in explicit device mode. Independent separate-account/legacy-key tests pass.
- **J8 — Focus start can race membership revocation (P1, regression reproduced by backend agent).** `nooks_workspace_commit` checks membership before inserting a new shared-focus ledger record without holding a room/membership lock. `leave_nook` marks the member departed and cancels only focus rows already present. In the backend agent's bounded two-connection reproduction at 19:27:12 UTC, focus insertion paused after the membership check; leave completed first; then insertion completed with `membershipLeft=true`, `focusStatus=active`, and `activeClock=true`. This violates the invariant that departed members have no active community timer. The judge reviewed the SQL path and flagged the required lock-order constraint: room/membership protection must precede the ledger lock, consistent with leave/archive, rather than introducing a reverse-order deadlock. Backend migration `20261004192857_focus_membership_serialization.sql` adds only sorted shared room locks for incoming and persisted bindings before any ledger lock. Independent source review passes, and the reported deterministic start/leave plus completion/leave/archive checks pass in both completion orders. All six migration hashes match the recorded workload and refreshed restore. Backend reports the full six-migration local SQL/permissions suite passed. This closes the source race; hosted application and actual community journeys are separate evidence. No hosted race or student data was used.

- **J9 — Crash during a recovery-key change can retain text under the previous key (P1, new hook regression).** `ui/src/WorkspaceErrorBoundary.tsx` originally reused one mutable `latest` ref across keys. A render that switches owner/key and crashes before its effects commit leaves the prior cleanup bound to the old key but holding the new value. Independently extended the extracted hook harness to omit effect commit: Alice’s draft was lost; with a retained Bob snapshot, Alice recovered `BOB_PRIVATE_DRAFT`. This is a synthetic hook-level reproduction; the browser App’s keyed account remount reduces normal exposure and no live-account leak was observed. Source fix independently verified: cleanup captures a per-key snapshot cell, so a failed new-key render cannot replace the old owner’s retained text. Four crash-boundary regressions pass, including both interrupted-transition cases.

- **J10 — Initial host data can survive fresh verification of a different owner (P1, source regression).** `App` applies cached initial tool data before `workspace_get` verifies the current owner. With cached Alice workspace revision 20 plus an active artifact, fresh Bob revision 1 installs Bob recovery scope but the revision guard rejects Bob’s snapshot; the loader then unlocks the retained Alice workspace and artifact. A higher Bob revision still leaves the old active artifact selected. Independently reproduced using the actual extracted update function and synthetic identities. No actual host-account leak was observed. Source fix independently verified: pre-initialization data is staged until fresh verification, mismatched identity is discarded, and matched initial presentation strips the stale workspace and resolves saved artifact/reference contents against the current verified snapshot. Actual update/loader regressions cover Alice revision 20 followed by Bob revisions 1 and 30, plus same-owner stale material. All pass.

| Gate | Required evidence | Current judgment |
| --- | --- | --- |
| Native identity and isolation | Installed-host calls; two distinct real identities cannot read or mutate one another's notes, private drafts, checkpoints, or invites | Prior single-host save/reopen and hosted rollback SQL exist; two actual host identities remain unverified |
| Browser Auth | Production configuration, code or email login, refresh/expiry, sign-out and account switch on the public origin | FAIL: public backend unconfigured; Auth/email setup missing |
| SQL authorization | Actual client roles denied writes/service RPCs; owner-only reads; private schema excluded; invite leave/archive checks | PASS for reviewed SQL: independent local permissions suite and root-reported updated hosted smoke/hardening rollback checks |
| Durable study work | Save/reopen, stale edits, failed saves, reload/unmount retry, zero cross-account recovery | Source/regression PASS; student-pilot HOLD until new native-frame recovery/reload and real-account separation are exercised |
| Native conversation flow | Native create → save → show → edit → navigate in same mounted app, with selected context and no guessed session | Root reports verified same-host navigation to Library, then quiz beside the reference note; ten tabs remained ten and the current question/answers were preserved |
| Community and publication | Two real members, private invite expiry/revoke/leave/archive, reviewed audience, stable retry, truthful empty/error states | Local/SQL coverage exists; actual two-account hosted flow still missing |
| Presence and rewards | Honest polling/staleness; no presence points; DB-time focus, paused time excluded, one active session, idempotent completion | Source and prior SQL support these properties; hosted concurrency evidence missing |
| Upload and availability | Real private upload/download; cross-account denial; size/type validation; image failure cannot lock notes | Source/regression PASS for J2; real Storage HTTP test missing, and latest hosted aggregate has zero artwork |
| Scale and quotas | Account quota under burst and realistic library size; concurrent autosave/checkpoint/focus/polling latency and error rate; bounded growth | FAIL for large rollout: limits exist, capacity not demonstrated |
| Recovery and operations | Verified backup coverage; isolated restore; rollback procedure; redacted diagnostics and meaningful alert | Local synthetic SQL restore PASS; public gate remains open for hosted SQL/Storage recovery, backup coverage, operator ownership, and alerts |
| Dependency and delivery integrity | Clean production dependency audit, pinned lockfile install, builds, cloud source parity, deployment tied to tested source | PASS for current controlled build: final suites/audit reported passing, 151-file parity checked independently, reviewed cloud commit deployed |

## Positive evidence and its limits

The reviewed adapters bind server operations to verified identities and refuse unverified `SupabaseStore` construction. Supabase client roles cannot execute service RPCs or write application tables. The dedicated hosted smoke test checks RLS/service grants and rolls back its fixtures. Custom artwork publication explicitly refuses unsupported content. Study artifacts require revisions for replacements. Private invitations have bounded use/expiry and membership checks. Focus has a database-time shared ledger with terminal-state protection and an account-scoped active-session constraint.

These are meaningful foundations. They do not substitute for missing hosted journeys, a recovery drill, or workload measurements. The current native trust model also depends on the Sites authenticated dispatcher; the Worker must never be directly exposed while trusting an arbitrary caller's identity header.

## Independent checks performed in this review

- Read the production adapters, SQL authorization and focus/community routines, native Worker boundary, account controller, practice checkpoint hook, note recovery/autosave, creator publication path, existing tests, and prior live-verification records.
- Reproduced J2 and J3 with Node 22 and controlled in-memory adapters. No live mutations or credentials.
- Independently ran 38 focused backend/adapter/plan tests after the server changes: all passed. Covered artwork failure isolation/preservation, redirect safety, required plan revisions, concurrency retry conflicts, server-issued recovery scope privacy, and focus idempotency.
- Independently ran 40 focused UI/account/bridge/recovery/plan tests after the client changes: all passed. Covered account changes during pending-result responses, scoped reload recovery, prototype IDs, bounded recovery, delayed acknowledgments, and plan conflict handling.
- Independently ran all three operational-monitor regressions: all passed. Covered browser/native correlation IDs, bounded redacted diagnostics, quota/timeout classification, failing log sinks, expiring observations, and no health database probes. The loopback HTTP case initially hit the sandbox's bind restriction, then passed with approved local execution.
- Independently ran seventeen cloud Worker/transport/quota checks and twenty workspace-controller/recovery checks after final changes: all passed. This includes quota denial before workspace access, current/legacy MCP behavior, safe cloud failure metadata, recovery initialization after a failed first load, missing native scope refusal, and authenticated scope preservation through chat navigation.
- Reviewed the completed production-hardening migration: account-wide create serialization, changed-focus-only ledger processing, unchanged RPC privilege boundary, and never-claimed invalidation coalescing. Independently reapplied all migrations plus permission tests and the report probes in an isolated cluster; all passed.
- Independently forced a two-connection room-creation race at 49 active rooms. A disposable-cluster insert trigger paused A after its quota check; B was observed waiting on the account advisory lock. A created room 50, B received SQLSTATE `54000` / `Nook limit reached`, and the final count was exactly 50. The temporary cluster was removed. This demonstrates the quota serialization under this race, not general deployment capacity.
- Independently checked the clean cloud checkout at commit `909c253984e9d19567003dcb3880d32a965498ad`: all 151 implementation files compared under `ui/src` and `server` match the primary source, except `server/tools.mjs`, whose difference exactly matches the documented Worker base64 adaptation. The final native readiness fix is present in that checkout.
- Root reports final full suites passing: 172 backend, 213 UI, and 17 cloud tests, plus zero production dependency audit issues. These broader runs are implementation-team evidence; the focused checks above were executed independently by the judge.
- The 118 targeted checks are not a replacement for the broader implementation-team suites or real multi-user deployment journeys.
- In the follow-up source round, independently ran the final 23-test subset for crash containment, initial host presentation, workspace recovery, note recovery, and account-scoped local preferences: all pass. This subset overlaps earlier checks and is not a cumulative unique-test total. J9 and J10 were independently reproduced before their fixes and the regression paths independently retested afterward.
- Independently reviewed the six-migration concurrency and refreshed restore evidence described below. The backend agent ran those final workloads; the judge verified their assertions, limitations, lock ordering, and exact migration hashes. No source blockers remain in this assigned review. Source review does not establish that the next UI build is deployed or loaded in an actual native frame.

## Final deployment evidence and limits

Root reports the private deployment succeeded at 19:08:26 UTC on 4 October 2026: deployment `appgdep_6ac2a421146c81919b0bc45da0043e6b`, commit `909c253984e9d19567003dcb3880d32a965498ad`, unchanged private URL, MCP enabled, environment revision 1. A fresh native `workspace_get` returned no tool error, authenticated mode, Supabase backend, and four saved items. Its model-visible result deliberately omits private recovery metadata, so that read does not prove new-iframe initialization or Storage persistence. The existing prior-build native frame remained on the same quiz question with its reference note and answers.

Root also reports the updated public preview loaded a 139-word saved device note, displayed and dismissed its music panel correctly, and produced no console warnings/errors; screenshot: `docs/release-public-note-oct4.png`. This is preview evidence, not browser Auth or account-sync evidence. Final hosted aggregate reported one account, four artifacts, zero nooks, zero artwork, and 1,320 historical outbox rows. The new coalescing behavior passed the hosted probe; historical rows were preserved. The absence of actual community and artwork data reinforces the untested-journey gates above.

## Restore-drill addendum — independently reviewed

The completed [local restore drill](production/local-restore-drill-2026-10-04.md) and [machine-readable evidence](production/local-restore-drill-2026-10-04.json) pass independent implementation/evidence review. The judge read the runner, source fixtures, restored behavior checks, report, and README instructions, and independently recomputed all six migration hashes after the focus-serialization rerun; every hash matches the recorded run. The drill was executed by the backend agent, not rerun by the judge.

The final rerun started at 19:30:55.399 UTC using PostgreSQL 14.20 and includes the focus membership serialization migration. Two separately initialized clusters use private owner-only Unix socket directories with TCP disabled and checked. Subprocesses receive explicit connection arguments and a clean environment with an empty password/service file; the runner cannot accept an existing database target. Real `pg_dump`, role export, and `pg_restore` restore two synthetic owners and eight artifacts. All 23 table contents, schema/owners/ACL/RLS definitions, selected role attributes, database ownership, and migration hashes are compared; authenticated/anonymous denials, owner isolation, stale/current revision behavior, and the hardening suite are checked after restore. Behavior checks roll back and full table comparisons run again. The recorded cleanup stopped both clusters and removed their temporary files.

No implementation blocker was found. PostgreSQL canonical CHECK-clause formatting and exclusion of per-dump psql guard tokens are reasonable normalization for schema equality; they do not remove permission definitions. The 109,976-byte archive and sub-second dump/restore timings describe a tiny synthetic fixture, not production recovery objectives. Auth/Storage/Realtime schemas are stubs and there are no Storage objects. The documentation correctly keeps hosted restore, private image bytes, live sign-in continuity, managed settings, backup retention, alerts, and operational handoff outside its claims. In particular, database backups omit Storage object bytes; [Supabase documents that boundary](https://supabase.com/docs/guides/platform/backups).

**Verdict unchanged:** controlled owner/developer testing PASS; private student pilot HOLD; public production FAIL. This addendum closes the lack of an executed local SQL backup/restore exercise, not the hosted disaster-recovery gate.

## Concurrent-workload addendum — independently reviewed

The [bounded local workload](production/local-concurrent-workload-2026-10-04.md) and [recorded evidence](production/local-concurrent-workload-2026-10-04.json) pass independent implementation/evidence review. The judge read the finite runner, forced-interleaving gates, assertions, documentation, and all six migration hashes. The backend agent executed the run at 19:30:09.125 UTC; the judge did not repeat it. The private socket cluster was stopped and removed.

Two phases used 100 and 1,000 synthetic materials per owner, two new owners per phase, six clients plus a bounded observer, 24 accepted saves and 84 production-quota charges per phase. Final data, owner-only reads, unchanged material, checkpoint/navigation state, bounded focus credit, and latest-event coalescing were checked. Both phases passed, including forced CAS contention; the 1,000-material phase recorded 21 conflicts and at most three attempts under the five-attempt bound. All five separate deterministic membership/focus races pass after J8’s migration, with waiting observed and no SQL/deadlock errors.

This establishes local concurrency correctness for those fixtures, not hosted capacity. At 1,000 materials, full workspace reads returned about 1.12 MB, and 49 reads transferred 55.03 MB locally. The recorded median logical autosave was 367.423 ms with twelve samples; it includes retries and input preparation. Small-sample timing, compressible content, direct SQL, short duration, and small community/focus history do not support a production SLO. Lightweight polling does not hydrate the full workspace and was not the measured bottleneck. Real Auth/HTTP/Storage/native-host journeys and sustained hosted capacity remain release gates.

## Conservative hosted verification plan

Root reported a read-only baseline of one account, four artifacts, 1,231 outbox rows, and zero community memberships/nooks during this review. These observations explain why deployed community behavior remains unexercised; they are not workload evidence. Record the query time and verify aggregate counts again before a probe.

### 1. Read-only operational baseline

Run only against the verified dedicated Nooks project. The following returns aggregate counts and bytes, never note content, user IDs, tokens, or credentials. The timeout makes it a bounded observation. Grouping by hour can be added later if growth needs diagnosis; avoid repeated scans while the system is busy.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT
  (SELECT count(*) FROM public.nooks_accounts) AS accounts,
  (SELECT count(*) FROM public.nooks_artifacts) AS artifacts,
  (SELECT count(*) FROM public.nooks_rooms WHERE archived_at IS NULL) AS active_nooks,
  (SELECT count(*) FROM public.nooks_members WHERE left_at IS NULL) AS active_memberships,
  (SELECT count(*) FROM public.nooks_shared_focus WHERE status IN ('active','paused')) AS active_shared_timers,
  (SELECT count(*) FROM public.nooks_outbox) AS outbox_rows,
  (SELECT count(*) FROM public.nooks_outbox WHERE delivered_at IS NULL) AS undelivered_outbox_rows,
  (SELECT count(*) FROM public.nooks_outbox WHERE created_at >= clock_timestamp()-interval '1 hour') AS outbox_rows_last_hour,
  pg_total_relation_size('public.nooks_outbox') AS outbox_total_bytes;
ROLLBACK;
```

### 2. Transactional owner containment and small-workspace timing

First rerun the existing complete `supabase/tests/hosted-smoke.sql` after changed migrations. That suite verifies service RPC grants, two synthetic Sites namespaces/subjects, equal artifact IDs under different internal owners, stale writes, private invite/membership behavior, and rollback cleanup. It does not authenticate two real students and must not be described as doing so.

The following separate probe is **locally validated, not executed against the hosted project by the judge**. Run it once in a single SQL execution. It creates two synthetic, uncommitted Sites identities, tests 10 and 100 notes of 4 KiB each per owner, and returns only elapsed SQL times and counts. It makes four successful workspace commits, two refused stale commit attempts, and twelve reads. It does not create Auth users, mint claims, upload objects, sleep, spawn concurrent clients, change schema, or alter existing student rows. Always keep `ROLLBACK`; if the caller retains an aborted connection, roll it back before reuse.

```sql
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '10s';
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_run text := gen_random_uuid()::text;
  v_namespace text;
  v_a uuid; v_b uuid;
  v_count integer; v_iteration integer; v_revision bigint := 0;
  v_notes_a jsonb; v_notes_b jsonb; v_a_workspace jsonb; v_b_workspace jsonb;
  v_result jsonb; v_start timestamptz; v_write_ms numeric; v_read_ms numeric;
  v_report jsonb := '[]'::jsonb;
  v_empty jsonb := '{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{},"reviews":{},"plan":{"tasks":[]}}';
BEGIN
  v_namespace := 'sites:nooks-release-probe:' || v_run;
  v_a := (public.nooks_resolve_identity(v_namespace,md5(v_run||':a')||md5(':a:'||v_run),NULL)->>'id')::uuid;
  v_b := (public.nooks_resolve_identity(v_namespace,md5(v_run||':b')||md5(':b:'||v_run),NULL)->>'id')::uuid;
  IF v_a IS NULL OR v_b IS NULL OR v_a=v_b THEN RAISE EXCEPTION 'Owner separation failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.nooks_accounts WHERE id IN(v_a,v_b) AND auth_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Synthetic identity unexpectedly linked to Auth';
  END IF;
  FOREACH v_count IN ARRAY ARRAY[10,100] LOOP
    SELECT jsonb_agg(jsonb_build_object('id','probe-note-'||n,'kind','note','revision',1,
      'title','Probe A '||n,'subject','Synthetic','content','A:'||repeat('a',4096)) ORDER BY n)
      INTO v_notes_a FROM generate_series(1,v_count) n;
    SELECT jsonb_agg(jsonb_build_object('id','probe-note-'||n,'kind','note','revision',1,
      'title','Probe B '||n,'subject','Synthetic','content','B:'||repeat('b',4096)) ORDER BY n)
      INTO v_notes_b FROM generate_series(1,v_count) n;
    v_a_workspace := jsonb_set(v_empty,'{artifacts}',v_notes_a);
    v_b_workspace := jsonb_set(v_empty,'{artifacts}',v_notes_b);
    v_start := clock_timestamp();
    v_result := public.nooks_workspace_commit(v_a,v_revision,v_a_workspace);
    IF (v_result->>'committed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Owner A commit failed'; END IF;
    v_result := public.nooks_workspace_commit(v_b,v_revision,v_b_workspace);
    IF (v_result->>'committed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Owner B commit failed'; END IF;
    v_write_ms := extract(epoch FROM clock_timestamp()-v_start)*1000;
    v_revision := v_revision+1;
    v_start := clock_timestamp();
    FOR v_iteration IN 1..3 LOOP
      IF (public.nooks_workspace_read(v_a)#>'{workspace,artifacts}') IS DISTINCT FROM v_notes_a
         OR (public.nooks_workspace_read(v_b)#>'{workspace,artifacts}') IS DISTINCT FROM v_notes_b THEN
        RAISE EXCEPTION 'Workspace crossed owner boundaries';
      END IF;
    END LOOP;
    v_read_ms := extract(epoch FROM clock_timestamp()-v_start)*1000;
    v_result := public.nooks_workspace_commit(v_a,v_revision-1,v_b_workspace);
    IF (v_result->>'committed')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Stale revision committed'; END IF;
    v_report := v_report||jsonb_build_array(jsonb_build_object('notesPerOwner',v_count,
      'workspaceJsonBytes',octet_length(v_a_workspace::text),'twoCommitsMs',v_write_ms,
      'sixReadsMs',v_read_ms,'ownerIsolation',true,'staleCommitDenied',true));
  END LOOP;
  IF (SELECT count(*) FROM public.nooks_outbox WHERE account_id IN(v_a,v_b))<>2
     OR (SELECT count(*) FROM public.nooks_outbox WHERE account_id IN(v_a,v_b)
       AND event_type='workspace.changed' AND payload=jsonb_build_object('revision',v_revision)
       AND delivered_at IS NULL AND lease_token IS NULL AND attempts=0)<>2 THEN
    RAISE EXCEPTION 'Unexpected workspace event amplification';
  END IF;
  PERFORM set_config('nooks.release_probe.result',v_report::text,true);
END $$;
SELECT current_setting('nooks.release_probe.result',true)::jsonb AS bounded_sql_probe;
ROLLBACK;
```

The measured values include server-side JSON reconstruction/comparison and run in one transaction with a warm cache. They exclude authentication, Worker execution, HTTP latency, Storage, UI rendering, connection pools, lock contention across connections, or realistic long-term history. They are a regression smoke signal, **not p95/p99 latency, QPS, capacity, or a two-person login test**. A timeout is a failed probe; do not remove its bound and immediately repeat at larger scale.

Local validation on 4 October used a fresh Unix-socket-only PostgreSQL cluster, every completed migration including production hardening, the permission regression suite, and Node 22. Both report SQL blocks passed; after rollback there were zero probe identity rows. The revised probe verified exactly two coalesced invalidations, each at its owner's latest revision. For 10 notes/owner, the two commits took 11.482 ms and six reads 3.142 ms. For 100 notes/owner (421,708 JSON bytes each), the two commits took 18.842 ms and six reads 14.424 ms. These are one local validation run, provided only to establish that the prepared probe executes and cleans up. The cluster was stopped and removed afterward. The first sandboxed attempt could not allocate PostgreSQL shared memory; automatic review allowed the isolated local validation to run outside that sandbox.

Root subsequently reported applying the reviewed migration only to the dedicated Nooks project and passing both hosted hardening and hosted smoke suites with rollback. The revised hosted probe also passed owner separation, stale-commit refusal, and the two latest coalesced events. Reported hosted measurements: 10 notes/owner (42,266 bytes), two commits 18.901 ms / six reads 6.189 ms; 100 notes/owner (421,708 bytes), two commits 33.510 ms / six reads 34.643 ms. These are root-reported tool results, distinct from the judge's independently executed local checks. They remain a bounded SQL smoke signal, not an authenticated two-student journey or capacity benchmark.

### 3. Concurrency, focus, and steady-state load belong in isolation first

Use the existing disposable PostgreSQL runner to test a separate multi-connection harness before considering hosted load. Keep each scenario in synthetic fixture transactions and drop only the runner's isolated temporary cluster. Test same-account stale updates, two simultaneous `focus_start`/completion calls, create limits, and opposite-order leave/archive/focus operations. Check for deadlocks, one active timer per account, at-most-once credit, and correct retry behavior. Do not claim a single SQL transaction proves cross-connection behavior.

For a larger hosted trial, require a defined test cohort and measured starting headroom first. Begin with one visible student session for a bounded interval, then two distinct signed-in test users. Capture request counts, median/p95 endpoint latency, DB query latency, connection pressure, 429/5xx/conflict rates, and outbox/storage growth. Stop on any isolation failure, unexpected data change, sustained errors, or exhausted headroom. Do not jump directly to thousands of virtual users on the current paid project.

### 4. Polling and growth budget

- One visible native workspace initially polls every 2.5–2.75 seconds, then quiets to 5–5.25 seconds after three unchanged polls: roughly 11–12 steady polls/minute (`ui/src/workspace-session.ts`). Navigation or visibility wakes reset the faster cadence. Each ordinary poll invokes identity resolution, the durable request quota, then one session-state read. The quota update is a database write even when navigation polling itself is read-only. Session renewal adds one full-workspace mutation every five visible minutes. The controller uses exponential failure delay, honors bounded `retryAfter`, and retains that delay across visibility wake-ups.
- `useLiveNooks` polls every 20 seconds: one directory call; with a selected nook, one presence write and one snapshot call as well. That is up to nine additional MCP calls/minute per visible workspace.
- A practice timer writes about four checkpoints/minute even without answer changes. Answer changes can increase this. The original append-only implementation could add roughly 1,920 timer-checkpoint outbox events in eight hours. The new migration coalesces never-claimed workspace invalidations; the commits, quota writes, JSON transfer, and any community/focus events still consume resources. This is arithmetic, not a measured user workload.
- At 1,000 simultaneously visible quiet native workspaces, navigation polling alone implies roughly 200 MCP requests/second and 600 outbound database HTTP requests/second before community activity, notes, checkpoints, or renewal. Initial/navigation-active cadence can roughly double those rates. These figures establish the workload to test, not capacity that the service can sustain.
- The server retains up to twelve tab registrations for thirty minutes, but the shared account quota is 180 requests/minute. Multiple simultaneously visible surfaces plus community polling can hit the same account quota. Verify controlled 429 backoff and recovery; twelve retained registrations are not a guarantee of twelve independently active workspaces.
- Database enforcement of one active/paused shared-focus record is a useful invariant (`nooks_one_active_shared_focus`), but paused/abandoned personal timers can persist until the student resumes/cancels. Presence expires independently after ninety seconds and must remain informational. Recovery should expose the persisted timer rather than inventing new credit.

## Recovery round deployment evidence — root verification

After the independent source verdict, root published commit `d130e730c3bf1a2abb766d4888b7a09cb5f99696` privately. Deployment `appgdep_6ac2ac3e5a3081919b65a75541c265c8` succeeded at 19:43:04 UTC with MCP enabled and unchanged environment revision1. A fresh native workspace read was authenticated, Supabase-backed, error-free and returned four saved items. It does not verify the newly built UI inside an old mounted native tab.

The dedicated Nooks database received migration `20261004192857_focus_membership_serialization.sql`; root verified the room lock exists and function ACL remains only postgres/service_role, SECURITY INVOKER, empty search_path. The hosted rollback-only smoke passed. Existing one account/four artifacts remained in place.

Root’s final built-widget simulation used `index-CaaZPUhP.js`; a cached account-A revision999 was rejected when the fresh identity was B, and Library showed only B’s material. With iframe Storage blocked and saves failing, a real render exception displayed a safe fallback; same-document Reopen restored the exact note, and Retry saved it after the simulated outage ended. [Evidence and explicit limits](production/simulated-host-recovery-2026-10-04.md). These are not actual ChatGPT host reload or two-real-user tests.

The public Vercel deployment loaded `index-0wCCkv4N.js`, opened the existing 139-word device note as Saved, and produced no console warnings/errors. Public account saving remains unconfigured and is described accurately by the UI. Final automated count:172 backend +224 UI +17 cloud =413 passing tests. Controlled-testing verdict and remaining pilot/public gates are unchanged.


## Root deployment evidence — community/artwork follow-up, October 4

Independent source judge passed community owner controls, directory pagination, artwork rename/preflight and dry-run inventory. 424 current source/adapter tests pass (178 backend,229 UI,17 cloud). Both new SQL migrations applied only to Nooks; hosted rollback owner/permission/page suite passed and live inventory reports zero objects/references. Native Site source b8157698e14452aecc2f69b20712bb503ab38e9a succeeded as deployment appgdep_6ac2b270fae0819193b0d18f619a38dc. New native read contract and four saved study items verified. Public Vercel build index-Bmv_vswC.js reopened the existing saved note without errors. See production/community-owner-verification-2026-10-04.md.

Source/controlled tests PASS. Student pilot HOLD/public production FAIL remain: actual-host reload and real multi-account journeys, public credential permission/Auth, physical artwork lifecycle, real Storage access/restore, operator alerts and capacity evidence. No deletion/scheduler/credentials/new paid service was added.

## Movable workspace feature — scoped independent review

**Source and isolated browser acceptance: PASS.** This judgment covers moving and saving the six supported widgets, resetting their placement, and restoring the default compact composition. It does not change the earlier student-pilot or public-production gates or assert a deployed native account-save journey. See [feature evidence and limits](production/workspace-layout-2026-10-04.md).

The judge reviewed the owner-scoped layout patch contract, private result handling, initialization gate, queued-save/account boundaries, pointer and keyboard handling, fixed surfaces, timer/task controls, popovers, transitions, and Spotify integration. Moving a widget does not reparent its children. Playback buttons, form fields, and range controls do not register drag handlers; only the dedicated handle does. Pending failures remain visible and retryable in the current document. Compact presentation does not overwrite the stored desktop arrangement.

The review found and verified fixes for a frozen Spotify width after movement, a stale height constraint after reset/compact restoration, Focus controls falling behind moved widgets, and a page entrance translation temporarily changing fixed-position coordinates. Music retains its effective bottom-center default, keeps the iframe mounted across layout changes, provides a separate handle row, and constrains expanded content against the visible viewport and keyboard inset.

The judge independently ran the final 19 layout-state/gesture/geometry/transition checks; all pass. Earlier focused Spotify and backend/normalization checks and the integrated TypeScript check also passed. These are distinct from the implementation team's broader suites and browser execution.

Root reports isolated local-device browser evidence: actual pointer drag for timer and music; keyboard movement and reload restoration for all six widgets; individual and global reset; compact restoration at 390×844 with desktop positions preserved; and bounded expanded Spotify at 900×540. In the final adversarial overlap check, all nine Focus panel buttons passed center-point hit testing after placing the timer over that area, and the collection dialog's Close control remained clickable after moving its widget. Home→Library→Home retained the timer at exactly (722, 190); the source/regression test establishes that Home transitions now use opacity without translation. The browser inspection shim could not expose mid-animation inspection. Audible Spotify playback and an actual new native iframe/account-save journey were not asserted. No hosted changes or deployment were performed by this review.
