# Nooks Supabase backend

This is an installable backend foundation, not a deployed Supabase project. The public Vercel API transport is implemented; see [browser deployment and API contract](../docs/production/browser-backend.md). It starts every account with an empty study library. Existing local `.notable-data` and demo people are not imported.

## Installation

1. Select a dedicated Supabase project and review all numbered migrations. Apply only `supabase/migrations/*.sql` with the Supabase CLI or dashboard. **Never deploy `supabase/tests/bootstrap.sql`**: it creates stub platform schemas only for the disposable local test cluster.
2. Keep `nooks_private` out of the Data API exposed schemas. The migration enables RLS and revokes client writes and service-RPC execution. Its public RPCs are SECURITY INVOKER and executable only by `service_role`. Private read helpers pin an empty search path.
3. The migration creates the **private** `nooks-private` Storage bucket, with a 1 MiB upload limit and PNG/JPEG/WebP allowlist. Installation fails if an existing bucket has incompatible access or limits. Review other pre-existing Storage policies in a shared project: permissive policies combine with OR.
4. Configure backend-only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, optional `SUPABASE_PUBLISHABLE_KEY` for real Supabase Auth verification, a stable `NOOKS_SITES_NAMESPACE=sites:<project-id>`, and an independently generated `NOOKS_WEBHOOK_SECRET` of at least 32 characters. These are server secrets, never Vite variables, browser metadata, tool arguments, or committed credentials.
5. Wire the request-scoped adapter below into the trusted Sites dispatcher. Do not expose an endpoint accepting arbitrary `subject`, `accountId`, or actor headers. No Supabase token is fabricated for a Sites account.

```js
import { createSitesIdentityResolver } from './server/supabase-auth.mjs';
import { SupabaseStore } from './server/supabase-store.mjs';
const resolveSitesIdentity = createSitesIdentityResolver({
  url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY,
  namespace: env.NOOKS_SITES_NAMESPACE, trustedBoundary: 'sites-dispatcher',
});
// verifiedSitesUserId comes ONLY from the platform-authenticated dispatch context.
const identity = await resolveSitesIdentity({ subject: verifiedSitesUserId });
const store = new SupabaseStore({ url: env.SUPABASE_URL,
  serviceKey: env.SUPABASE_SERVICE_KEY, identity });
// Existing StudyEngine uses store.read/transact/publishShare/readShare/revokeShare.
const lobby = await store.community('nook_snapshot', { nookId });
```

For a real Supabase Auth account, `createSupabaseIdentityVerifier` verifies the supplied bearer token through `/auth/v1/user` before resolving the internal account ID. Merely decoding a JWT or accepting a claimed ID is insufficient. Sites and Supabase identity linking is deliberately not an automatic email match: that needs a separately authorized account-linking flow.

## Storage and consistency

`nooks_workspace_read` reconstructs the existing engine workspace from account-owned normalized artifacts, practice, focus sessions and room progression. Other metadata, including `organization`, approved session summaries, note revisions and proposals, stays intact in the owner-only workspace document. An organization schema migration can normalize those records later without changing this contract.

`nooks_workspace_commit(account, expectedRevision, workspace, shareOperations)` locks the single account revision, rejects stale writes, upserts changed normalized rows only, removes missing records, and commits appearance sharing plus outbox events in the same transaction. The adapter reloads and retries on a revision conflict; engine note-revision preconditions must still be enforced on each retry. Limits: 16 MiB serialized workspace, 1,000 artifacts, 10,000 practice events and 10,000 focus sessions. This bounds the current full-workspace RPC contract; much larger libraries will need paged reads and granular writes.

New uploaded images become immutable private Storage objects under `<verified-account-uuid>/<content-sha256>/<generation-uuid>`, not inline database blobs. Legacy owner/hash references remain readable and noncollectible. The service hydrates an authenticated download when returning the workspace. Explicit appearance shares can include that chosen image but never automatically expose note/quiz contents. The [generation lifecycle](../docs/production/artwork-lifecycle.md) reserves upload pins, fences cleanup against reference commits, bounds new/retained generation allocations and supports explicit operator cleanup with permanent tombstones. Cleanup defaults to dry-run; no scheduler is provisioned.

The service-only `nooks_artwork_inventory` RPC provides a [read-only metadata inventory and operator procedure](../docs/production/artwork-inventory.md). It includes current appearances, private drafts and retained shares, quarantines uncertain references, and returns aggregates plus bounded canonical path/status metadata. This inventory performs no deletion and does not inspect lifecycle pins; `unreferenced_at_snapshot` is not permission to remove an object. Actual hosted cleanup, its operating cadence and SQL/image recovery remain separate evidence gates.

## Community and one focus timer

The adapter binds the actor internally. Supported actions are `list_nooks`, `join_nook`, `leave_nook`, `nook_snapshot`, `update_profile`, `heartbeat`, `create_nook`, `create_invite`, `list_invites`, `accept_invite`, `revoke_invite`, and `archive_nook`. Public nooks are discoverable; private rosters and leaderboards require active membership. Private invitations are expiring, use-limited, cryptographically random codes; the database stores only SHA-256 hashes. Only the owner creates, lists or revokes invitations. Creation uses a caller-retained UUID `requestId` for retry safety. Repeating a completed archive returns success only to its owner, without repeating writes or events.

`list_nooks`, `list_invites` and `nook_snapshot` accept optional `offset` and `limit` (1–50). The first two return `hasMore` and `nextOffset` (null at the end), ordered by `created_at DESC, id DESC`. `list_nooks({joinedOnly:true})` filters to active memberships, including older private nooks; the default remains the accessible directory. Offset pages reflect current data and can shift when rooms are created or archived, so clients should deduplicate IDs and refresh from offset zero. `list_invites` requires `nookId` and returns only `id`, `nookId`, `expiresAt`, `uses`, `maxUses` and `revokedAt`, including expired/revoked history; it never returns hashes or tokens. Snapshot members are paged, counts cover the entire current membership, and its leaderboard contains the top 50. Online presence means a server-received heartbeat within 90 seconds; it grants no XP and proves no attention. Do not represent fake preview profiles as production users.

Use the existing `focus_start({minutes,subject,nookId?})` tool. A new session captures both `roomId` and optional exact `nookId`. Commit validates membership and matching scene, then records a DB-clock verification ledger for that **same** session. Pause excludes elapsed wall time; completion grants capped credit once. Two nooks sharing a backdrop never share credit. A session without a binding earns personal progress only; historic sessions cannot be retroactively bound. Leaving or archiving cancels community credit while preserving the personal session history. There is no separate community timer API.

## Realtime and webhooks

The migration provides membership-aware `realtime.messages` policies for private `nook:<uuid>` and personal `account:<uuid>` topics. Turn off Realtime **Allow public access** before using them. Client presence may be permitted, but only the backend publishes authoritative activity events. Sites identities alone have no Supabase JWT: the initial UI must use the authenticated MCP/server relay and visibility-aware polling. Direct browser WebSocket realtime requires genuine Supabase Auth/account linking and a verified runtime test. Topic authorization is checked when a channel joins; membership revocation also needs relay checks or active channel/session invalidation, rather than assuming existing channels disconnect automatically.

Commits emit minimal events to a durable outbox (IDs and revisions, no note bodies). `createSupabaseOutbox` claims leased events with `SKIP LOCKED`, and acknowledges only the matching unexpired lease. A separate scheduler/worker must send or broadcast them **after commit**, then acknowledge success or retry with bounded backoff. Delivery is at least once; consumers deduplicate by the stable event ID. This repository does not provision cron or external delivery destinations.

For an opt-in HTTPS webhook receiver, verify the raw body before parsing or ingestion with `verifySupabaseWebhook`. Required signature is HMAC-SHA256 of `timestamp.eventId.rawBody`, expressed as `sha256=<64 lowercase hex>`; timestamps expire after five minutes by default and bodies are capped at 128 KiB. Call the service-only inbox RPC after verification. Repeated source/event ID with identical content is accepted as a duplicate; changed content is rejected. The inbox currently records receipt only: any later domain mutation needs its own atomic processed-event transaction, not a client-controlled actor copied from the webhook body.

Supabase Database Webhooks/`pg_net` may wake a dispatcher, but their temporary response log is not the retry ledger. Do not send full private note rows in HTTP trigger payloads. Any dispatch endpoint should be a fixed HTTPS allowlist configured by the operator, never a tool-supplied destination.

## Verification

```sh
node --test tests/supabase.test.mjs
node supabase/tests/run-local.mjs
node supabase/tests/run-restore-drill.mjs
node supabase/tests/run-concurrent-workload.mjs
```

Use Node 22+ and locally installed PostgreSQL binaries. `NOOKS_TEST_PG_BIN` optionally specifies their directory. The SQL runner creates and removes its own disposable cluster with a private Unix socket and TCP disabled. It never reads `DATABASE_URL` and never connects to the existing local database. Tests cover actual RLS client roles, ownership, private invitations, exact-nook DB-time credit and retries, event deduplication and leased delivery. This validates the migrations on PostgreSQL 14; hosted Supabase Auth, Storage HTTP, Realtime delivery and the final native ChatGPT interface still require integration verification against the chosen project.

The restore drill creates **two** disposable clusters, dumps synthetic two-owner study data and role definitions, restores the archive into the second cluster, and verifies schema/ACL/owner equality, complete saved data, account isolation, and revision protection. It never connects to an existing or hosted database. See the [October 4 restore evidence and remaining hosted/Storage coverage](../docs/production/local-restore-drill-2026-10-04.md). This local drill does not establish production backup coverage or image-file recovery.

The concurrent workload runs finite 100/1,000-material phases with two synthetic owners, six clients, and strict time limits in its own local socket-only cluster. It checks autosaves, checkpoints, polls, community activity, CAS retries, and deterministic focus-start/completion races with leaving or archiving a nook. See the [October 4 concurrency findings, fix, and measurement limits](../docs/production/local-concurrent-workload-2026-10-04.md). It is a correctness and bottleneck probe, not a production capacity benchmark.

Primary references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [JWT verification](https://supabase.com/docs/guides/auth/jwts), [private Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads), [Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
