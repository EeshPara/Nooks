# Custom nook artwork server packet

Implemented in the primary source. This packet has not applied migrations, changed hosted settings, deployed code, or verified two real accounts. It depends on `20261004232607_custom_nook_artwork_publication.sql` being installed before release.

## Result contract

`nook_scene_get({nookId})` is a read-only community tool requiring a server-verified account and `notable.read`. The account is bound by the request adapter, never supplied by tool arguments.

The UI receives `{nookId, scene: {id, snapshotHash} | null, appearance: Space | null, recoveryScope: "account:<verified UUID>"}`. Custom `appearance` contains the optimized `backgroundImage` data URL and validated appearance fields. Curated nooks return `scene: null, appearance: null`. The model receives only `nookId` and scene identity. Existing `_meta.notableData` holds the complete UI result; image bytes, appearance, and recovery binding stay out of model context. No result contains the Storage owner, object path, generation, signing capability, or private scene prompt. Directory summaries retain the database's safe `{id,snapshotHash}` scene metadata without loading bytes.

## Publication

Custom readiness is enabled only for adapters implementing the reviewed publication methods. Missing artwork and failed image hydration block review. Local-only stores retain the explicit unavailable blocker.

Preparation derives the asset from the selected owner-only draft. It verifies the ready generation's account, path, hash, MIME, generation ID, and status through a bounded account-filtered query. Legacy two-component references are promoted through the existing reserve → immutable non-upsert upload → complete flow. No caller-supplied owner, generation or Storage path enters that flow. The new generation is persisted on the draft along with the schema-version-2 review manifest. Appearance, title, description, audience and revision are bound by the sorted-key SHA-256 snapshot digest. The existing draft and publication limits still apply, and the intent limit is checked before legacy uploads.

Confirmation calls only `nooks_nook_publish_artwork` with verified actor, persisted intent ID and snapshot digest. It does not call the curated creator or accept an arbitrary manifest. Successful custom retries re-check the database receipt, including after the original draft has changed or disappeared. An archived publication cannot be reported as live. Ambiguous transport/finalization outcomes preserve the original request; deterministic review conflicts require a new review. Curated publication remains unchanged.

## Authorized hydration

Every scene request first invokes `nooks_nook_scene_read`. Only its trusted owner/path is used for the private Storage fetch. The adapter validates selected nook, immutable scene identity, generation, content hash and the exact appearance shape before downloading. It uses a bounded stream, rejects redirects, verifies SHA-256 and PNG/JPEG/WebP byte signatures, and validates the resulting optimized data-URL size. The shared workspace artwork reader now uses the same bounded stream instead of allocating an unbounded response buffer.

Request-local image caching happens only after verification. Scene authorization is repeated before consulting this cache, so membership loss and archive fail before cached pixels can be returned. The UI must independently clear previously delivered private scene data on account/nook/membership changes. Bytes already legitimately downloaded cannot be retracted.

## Verification

- `tests/custom-nook-artwork.test.mjs`: 14 actual-source transport/protocol tests covering ready-generation review, exact persisted v2 manifests, legacy promotion, owner/state mismatch, quota/upload failures, pre-upload intent cap, immutable repeated publication, deleted-source retry, finalization failure, stale review, archive denial, model redaction, private member authorization, reauthorization before cache, hostile references/appearance, redirects, hash/MIME mismatch, declared/streamed oversize cancellation, and unavailable-image review.
- `tests/community-integration.test.mjs`: the real local HTTP MCP boundary checks scene discovery/scopes, denies anonymous or insufficiently authenticated access before store dispatch, and exposes image bytes only through UI metadata.
- Focused creator/storage/lifecycle/redirect/HTTP suite: **84 passed**.
- Complete backend suite: **285 passed**.
- Logs: `/private/tmp/nooks-custom-art-server-tests.log`, `/private/tmp/nooks-custom-art-server-full.log`.
- Frozen file hashes and test counts: `custom-art-server-packet-2026-10-04.json`.

The protocol fixtures use synthetic identities and in-memory Storage/RPC responses. They do not claim to execute PostgreSQL or live Supabase. Actual PostgreSQL authorization, immutability and concurrency evidence is in the separate database packet. Hosted Storage HTTP, native UI integration, distinct per-nook focus attribution, public/private two-user behavior and production rollout remain root verification gates. Custom reward-path authoring is separate remaining scope.

## Current guidance and security checks

Read the Supabase changelog on 2026-10-04 and current [Storage access-control guidance](https://supabase.com/docs/guides/storage/security/access-control) and [database functions guidance](https://supabase.com/docs/guides/database/functions). The relevant explicit Data API grants and PostgreSQL upgrade changes are already covered by the database packet; this server change creates no extensions, keys, grants, public buckets or RLS policies.

The adapter continues to use server-issued identity proofs, service-only keys, account-bound RPC actors, manually rejected redirects, private Storage, and immutable non-upsert uploads. No user-editable metadata participates in authorization. The new read hydrates only assets returned by the authorization RPC; it is not an arbitrary URL, path, owner or bucket proxy. No new services or plan changes were made.
