# Custom nook artwork database packet

Status: implemented and verified in isolated local PostgreSQL; **not applied to hosted Nooks** and not enabled in the UI. This packet does not make the entire custom nook feature production-ready.

## Files and rollout dependency

- Migration: `supabase/migrations/20261004232607_custom_nook_artwork_publication.sql` (created with Supabase CLI 2.106.0).
- SQL regressions: `supabase/tests/custom-art-publication.sql`, included in `run-local.mjs`.
- Forced concurrent transactions: `supabase/tests/run-custom-art-races.mjs`.
- Machine-readable local results: `docs/production/custom-art-database-local-2026-10-04.json`.

Apply this migration before enabling custom publication on the server; enable the server before enabling the UI. It preserves curated publication and adds no public Storage bucket, signing endpoint, scheduler, chargeable service, or automatic deletion. Existing migrations are unchanged.

## Exact server integration contract

### Prepare and persist the review

The existing owner-only `nookCreator.publicationIntents` and drafts in `nooks_workspaces.document` are the source of truth. For custom artwork, persist this manifest with `schemaVersion: 2`:

```js
{
  schemaVersion: 2,
  draftId: draft.id,
  draftRevision: draft.revision,
  title: draft.title,
  description: draft.description,
  roomId: 'custom',
  visibility: 'private' /* or 'public', explicitly reviewed */,
  pathTemplate: 'none',
  scene: {
    generation: ownedReadyAsset.generation,
    appearance: { /* draft.space without backgroundImage and _storedBackground */ }
  }
}
```

Appearance is the existing validated `Space` object: required `name`, `tagline`, `theme`, `accent`, `companion`, `layout`, `decorations`; optional `room` is an existing curated fallback scene ID. It uses the same enums as `server/space.mjs`. `name` and `tagline` must equal the reviewed title and description. Arbitrary keys, URLs as room IDs, image bytes, private prompts, storage paths, tokens, and styles are rejected. Scene appearance must exactly equal the persisted reviewed draft appearance with those two image fields removed. No scene-specific owner/path may come from UI or model arguments.

The draft must already have `_storedBackground: {path, mime}` pointing to an owner-matching ready immutable generation. Legacy two-component paths must first be promoted through the existing verified upload path; they cannot be published by this RPC. The manifest contains a generation UUID, not a supplied path or account ID. The database resolves path, hash, and MIME itself.

Persist the intent's existing fields: `id`, `requestId`, `draftId`, `draftRevision`, `visibility`, `manifest`, `snapshotHash`, `status`. Allowed statuses for first publication are `prepared`, `publishing`, `retry-needed`; existing successful receipts may also retry from `published`. The backend still enforces explicit human review and confirmation before persisting/committing an intent. The database verifies that persisted state instead of accepting a fresh unreviewed manifest parameter.

### Canonical digest

Use the current sorted-key `canonical` function in `server/nook-creator.mjs`, then SHA-256 over its UTF-8 bytes, lowercase hex. Objects sort keys ascending with JavaScript `Object.keys(...).sort()`, arrays retain order, strings/booleans/null use JSON representations, with no formatting whitespace. Missing/undefined fields must be omitted before computing the digest, never represented as `undefined`; required manifest fields cannot be omitted. JSON null is distinct from omission, and null in required typed fields is rejected. All three revision fields (draft, intent, and manifest) must be JSON numbers; matching numeric strings are rejected. Manifest numeric values are only positive integer revisions and integer schemaVersion 2, avoiding floating-point canonicalization differences. All allowed object keys are ASCII; user Unicode appears only in string values. The SQL canonicalizer sorts keys with C collation and has been checked against the exact JS algorithm using Unicode fixture titles and nested/null JSON test vectors.

### Commit RPC

`public.nooks_nook_publish_artwork(p_actor uuid, p_intent_id uuid, p_snapshot_hash text) -> jsonb`

The adapter binds `p_actor` from the verified server identity. The other two parameters are the persisted reviewed intent ID and digest. It does not accept an arbitrary manifest, account ID, Storage key, or capability from the browser/model.

Success:

```js
{
  nook: { /* existing nook summary plus scene: {id, snapshotHash} */ },
  scene: {id, generation, snapshotHash},
  duplicate: false /* true on an identical retry */
}
```

The transaction acquires artwork-owner lock → workspace row lock → existing create-nook advisory lock; validates ownership, exact revision, digest, appearance, and ready generation; and atomically inserts the community, owner membership, immutable scene association, and existing `nook.created` outbox event. It retains the existing 50-live-nook owner cap.

The server retains its existing finalization step marking the intent published. A timeout after commit is safe to retry with the same intent/digest: the matching receipt is checked before looking for the draft. Consequently edits/deletion of the original draft do not invalidate a successful receipt. A reused request key with a different intent/digest or a curated community is rejected. Archived publications cannot be revived through retry.

Errors: `42501` for missing/unavailable reviewed publication or inaccessible/archived nook; `40001` for stale/mismatched review, request collision, or unavailable owned generation; `22023` for malformed/unsupported manifest or appearance. Existing quota/constraint errors remain possible. No output from this RPC contains a private Storage path or signed URL.

### Read RPC

`public.nooks_nook_scene_read(p_actor uuid, p_nook uuid) -> jsonb`

The caller supplies only a nook UUID; the adapter supplies the actor. The RPC requires a verified account and either a live public nook or active membership in a live private nook. An unaccepted, expired, or exhausted invitation is not membership. It serializes with leave/archive through a shared room lock. A curated nook returns `{nookId, scene: null}`.

Custom result **for the server adapter only**:

```js
{
  nookId,
  visibility,
  scene: {id, snapshotHash, generation, appearance},
  artwork: {accountId, path, mime, contentHash}
}
```

Hydrate the private bytes through the existing bounded hash/MIME-verifying Storage reader, using this trusted owner. Strip `artwork` before returning any browser/model result. The model gets only safe scene identity/status. Image bytes and UI appearance belong in UI-only metadata. Do not place images in directory/presence polling. Reauthorize future reads after account switch, membership loss, or archive and clear private UI caches on those events. Authorization cannot retract bytes already legitimately downloaded.

## Persistence and lifecycle

`nooks_room_scenes` uses a nook primary key and unique scene ID. Composite foreign keys enforce scene owner equals room owner and generation owner; `account_id + publication_intent_id` is unique. Runtime service has SELECT/INSERT only, no UPDATE/DELETE. RLS is enabled; ordinary anonymous/authenticated clients have no scene-table grant or RPC/helper execution grant. Every new function uses SECURITY INVOKER and a fixed empty search path.

A live scene contributes to `artwork_persisted_refs`, so deleting its draft cannot expose it to cleanup. The inventory now counts `communityReferences`. Archive first resolves the immutable room owner and acquires that artwork-owner lock before the room/focus locks, including curated archive to keep reconciliation under the same guard. After archive, last-reference reconciliation starts retention at the actual reference removal time. Other live references preserve null `unreferenced_since`. An archived scene association remains immutable audit/receipt data but ceases to retain bytes or authorize reads. Existing generation tombstones, minimum retention, pins, claims, quotas, and Storage-API-only deletion remain intact.

## Verification and boundaries

The isolated runner applies every migration to fresh PostgreSQL 14.20 using private Unix sockets, platform schema stubs, and synthetic Storage metadata. It does not use credentials, contact hosted services, or touch an existing database. Temporary clusters are stopped and removed.

Covered: public read; owner/accepted-member private read; unaccepted/expired invite and former-member denial; wrong actor; digest/revision mismatch; matching string revision denial; foreign/deleting generation rejection; missing review state; invalid appearance/manifest and URI injection; immutable table ACLs; idempotent publication after source draft removal; curated request collision; exact inventory retention; fresh archive retention; archive cannot revive; directory has no private asset locator. All prior local SQL suites are also run.

Six forced two-client races verify actual lock waits in both orderings: publication/cleanup, archive/cleanup, and private read/leave. Other owners can progress while one owner's artwork lock is held. The reports record the tested migration hashes.

Remaining integration gates: server binding/hydration/model sanitization, UI selection/cache invalidation, distinct per-nook focus/progress attribution, hosted migration/advisors, actual private Storage HTTP, native file import→publication, and two-real-user public/private verification. This is not hosted capacity evidence. Custom reward-path authoring is separate original-scope work; this packet keeps `pathTemplate: 'none'`.

## Current platform guidance checked

Supabase changelog was fetched 2026-10-04. Relevant breaking-change notices about explicit Data API grants and PostgreSQL minor upgrades were reviewed; this packet uses explicit grants and built-in SHA-256, no ltree/pgcrypto legacy ciphers/btree_gist/custom operator estimators. No hosted upgrades or settings were changed. Local catalog tests check RLS, privileges, and invoker mode; the hosted Supabase advisor remains a root deployment gate, not a claimed result of this packet.

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Delete objects through the Storage API](https://supabase.com/docs/guides/storage/management/delete-objects)
- [Explicit Data API table grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [PostgreSQL minor upgrade notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
