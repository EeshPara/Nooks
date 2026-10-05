# Artwork lifecycle release verification — October 4, 2026

Scope: dedicated Nooks Supabase `lcfcjglybfeozyrjjikk`, existing owner-private native Site, and public device preview. No unrelated project or paid service changed.

## Source and database evidence

- Migration `20261004201449_artwork_generation_lifecycle.sql`, SHA-256 `99b79095157822b87391c67f3e0ae94119287b66de36f182ca2fe70570269598` applied successfully to the dedicated hosted Nooks project.
- Hosted service-role rollback fixture verified reservation, unconfirmed-reference rejection, confirmation, commit, reference protection and client privilege denial. All fixture state rolled back. It deliberately did not upload or delete Storage bytes.
- All nine migrations passed local SQL regressions. Four actual database concurrency races passed with follower lock waiting and another owner continuing; [exact local record](artwork-lifecycle-local-2026-10-04.json).
- Independent judge cleared lifecycle source and runbook. New images use immutable generations; legacy paths remain readable and noncollectible. Cleanup is operator-only, dry-run by default, with no scheduler.
- 198 backend tests, 233 UI tests and 18 native cloud checks passed; TypeScript passed. Mocked Storage transport is distinguished from the real hosted SQL evidence.
- Supabase security advisor: seven INFO notices for intentional service-only RLS tables with no client policies, including the new artwork catalog; no WARN/ERROR. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## User-visible and operational fixes

Artwork quota/conflict messages preserve unsaved personalization and creator text/images. Retry remains explicit. A private Storage outage returns usable study work and emits one bounded `nooks.artwork_degraded` observation per request, without account IDs, image paths, content, tokens or raw provider errors. Health reports an expiring per-instance artwork observation and explicitly says event delivery is disabled while UI updates use authenticated polling.

## Remaining gates

Actual upload/read/delete evidence and operator cadence, hosted SQL-plus-image recovery, two real identities, fresh native recovery, alert delivery and supported deployed load remain separate. Public account sync still awaits the existing destination-specific secret permission; no credential was transferred. No production launch sign-off is implied.

## Deployed and actual Storage verification

Private native source `3dc58ead39556cf77df4d53918bf1e0b81562dbb` deployed successfully at20:28:13Z; deployment `appgdep_6ac2b6d3d8fc81919e9846212977ac32`, native bundle `index-BCWkiKtQ.js`. Public preview deployed at `https://nooks-study-space-qquhjsgti-eeshpara-1663s-projects.vercel.app`, aliased to the existing public URL; bundle `index-BdcEwwgr.js`. Audience and environment revision stayed unchanged.

An actual MCP `nook_draft_save` created one temporary private draft using the existing Nooks cat logo (173,490 bytes; SHA-256 `f1f8ea3690fad0e8b7eb274bbcff6dbd5b8ace3b0da6b12183ff2e0f8d2010b2`). No apply, publication or navigation call was made. A separate `nook_draft_get` succeeded. Hosted catalog showed one ready generation with a live reference and an exact-sized object in the private bucket. Storage logs for the fixture hash include a GET200 returning173,490bytes. These observations establish actual upload/read; they are not a second independent downloaded-byte hash check.

Anonymous requests to the exact object through both public and authenticated routes returned400 errors, with no image bytes. A foreign signed-in identity remains untested. Only the recorded temporary draft was removed afterward through `nook_draft_delete` revision1; the library still contained four materials. Image bytes are deliberately retained for normal retention; no physical cleanup claim was forced and no age was altered.
