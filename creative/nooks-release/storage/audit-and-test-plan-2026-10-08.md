# Private Storage audit and proposed bounded verification

Initial status at plan preparation: source/document audit complete, with no fixtures or mutations. Root subsequently selected and authorized the narrower existing-QA-object read test described below. Its live results are in README.md; only one empty foreign Auth fixture was created and fully cleaned, with no object/catalog/source-owner mutation.

## What is actually deployed

The public web and native cloud `nook-creator.mjs` implementations match. `app/server/nook-creator.mjs` deliberately differs: it contains additional custom-publication capability. Nothing was copied from app into a deployed target.

The public UI supports choosing an image in `web/ui/src/community/NookStudio.tsx:281`, optimizing it locally, then saving via `nook_draft_save` at line 199. The exact public endpoint is authenticated `POST /api/tools/nook_draft_save`, with an ordinary user JWT. A minimal private draft supplies a random UUID, title, `artworkMode: "upload"`, `space.backgroundImage` as a small valid PNG data URL, and `expectedRevision: 0`.

`web/server/supabase-store.mjs:62` reserves an immutable generation, uploads to existing private bucket `nooks-private` using server credentials with upsert disabled, confirms the upload and commits an owned reference. Paths are `<nooks-account-uuid>/<byte-sha256>/<generation-uuid>`. A distinct `nook_draft_get` loads bytes through server-authenticated Storage, verifies their SHA-256 against the path and returns a hydrated data URL. Reads do not issue a signed URL. No Supabase signed-URL generation call was found in the deployed web/cloud source reviewed. Authorized ChatGPT input-file URLs are a separate import capability, not Nooks Storage download links.

The source bucket configuration is private, maximum 1 MiB, allowing PNG/JPEG/WebP. Its client Storage policy permits SELECT only when the first path component equals the caller's mapped Nooks account. Ordinary authenticated users have no Storage INSERT/UPDATE/DELETE policy in the reviewed migrations. Server writes therefore remain the intended path. The public/private bucket distinction and authenticated download route agree with [Supabase's serving documentation](https://supabase.com/docs/guides/storage/serving/downloads).

Custom image **drafts** are supported, but shared custom image publication is blocked in deployed web/cloud by `CUSTOM_PUBLICATION_UNAVAILABLE`. The UI line 354 nonetheless says the published nook keeps the exact artwork. That is a concrete copy/availability mismatch for root to fix, not permission to port the app-only publication implementation.

## Existing hosted evidence and remaining gaps

`app/docs/production/artwork-lifecycle-verification-2026-10-04.md` records a real owner-native private draft upload/read of the existing cat logo, with catalog/object size and Storage GET 200 evidence. Anonymous public/authenticated object routes returned errors without bytes. The temporary draft was deleted, while bytes were deliberately retained normally. That report explicitly does not establish foreign signed-in isolation, a second downloaded-byte hash, or physical deletion.

The local race suite and hosted rollback SQL tests cover catalog reservations, fences, reference protection and ACLs; Storage transport was mocked or not exercised there. They are not proof of hosted byte deletion. No new hosted storage operation has been run by this audit.

## Cleanup constraint before the full deployed upload test

A successful new public API upload creates a row in `public.nooks_artwork_assets`. Its account FK has no cascade; service_role has SELECT/INSERT/UPDATE but **no DELETE** privilege. Consequently the usual ephemeral-test account deletion will fail while a generation/catalog row exists.

Deleting a draft only removes the reference. Ordinary collection requires the upload pin to expire (15 minutes), at least **24 hours** continuously unreferenced even at the shortest allowed retention, and then preserves permanent tombstones after deletion. Default retention is 30 days. The runbook explicitly says never purge tombstones or reuse generation addresses. Even waiting 24 hours does not permit ordinary account deletion. This is why no supposedly disposable end-to-end upload fixture has been started.

Do not change timestamps, shorten retention below validated bounds, grant privileges, purge catalog rows or force a generation fence merely to make this test clean up. Deleting Storage metadata directly in SQL is also wrong: [Supabase requires deletion through its Storage API](https://supabase.com/docs/guides/storage/management/delete-objects).

## Proposed scopes for root to choose

**A. Immediately disposable Storage transport/isolation proposal (not selected; no upload performed).** Create exactly two admin-confirmed `example.invalid` Auth fixtures with normal JWTs, initialize their mappings through the actual public `/api/workspace`, and record the dedicated config/entry-asset identity first. Generate one harmless valid PNG smaller than 1 KiB in memory. Upload it through the existing Storage API using the service credential to one unique path `<fixture-A-account>/<sha256>/<random-uuid>`. Do not attach it to any workspace or create a catalog generation. This service-upload fixture intentionally tests the Storage transport and actual mapped-user RLS, **not the deployed application upload/reservation lifecycle**.

Validate owner-A authenticated Storage download and exact byte hash; deny B's authenticated download and anonymous/public access; repeat owner download after denials to exclude a missing-object false positive. Optionally verify B cannot mint a signed URL, clearly labeling this a provider authorization boundary rather than a product feature. Do not mint an owner signed URL or log private addresses. Delete only the exact created object through the Storage API in `finally`; verify object-not-found using an authorized exact-path check. Revoke sessions and delete both fixture accounts/Auth users, check absence, and return their exact private throttle topics to root. No prefix/list/bucket deletes, schema changes, quotas, email, broad reads, or publication. Preserve path/fixture IDs in a restricted cleanup checkpoint only, never credentials or image data. This can close actual byte upload/hash/download/isolation/delete evidence, but it cannot close generation fencing, deployed draft-upload, or retention behavior.

**B. Full deployed private-draft lifecycle test (prepare only until disposition is agreed).** Use the same two-identity constraints, but save exactly one tiny PNG private draft via public `nook_draft_save`, then read it via a separate `nook_draft_get` and compare decoded byte hash. B must receive draft-not-found, and direct owner/foreign/anonymous Storage reads should enforce owner isolation. Query only A's exact catalog generation metadata to identify the object; no broad inventory. Assert custom publication remains unavailable without invoking publication. Delete the exact draft with expected revision, prove it cannot reopen, and prove its bytes are retained under the documented policy. A dry-run cleanup restricted to A should have no candidate while the pin/retention period applies. Do not mutate cleanup state or timestamps.

Scope B requires a reviewed plan to retain the deliberate QA owner/catalog and tiny object until normal retention, plus an explicit eventual account-erasure procedure; otherwise its fixture cannot be truthfully reported fully removed. Root may instead choose a separate approved isolated environment for this full lifecycle test. No isolated project creation, persistent fixture authorization, special catalog deletion, or retention exception is inferred here.

Neither A nor B establishes SQL-plus-private-object backup recovery, a restored production dataset, operator schedules, alert delivery, signed-link expiry in a nonexistent product path, or shared custom-art publication. Those remain separate gates.

## Root-selected scope and read-only preflight outcome

Root declined new artwork fixtures/permanent ledger state and authorized a narrower existing-QA-object check: uniquely identify the documented Oct4 cat-logo hash/date, verify bytes with a bounded service read, then create only one empty disposable foreign account for authenticated/anonymous denial and cleanup. The source owner's object/catalog would remain untouched. Physical deletion and restore would remain unproven.

The first read-only exact-hash/date lookup at 09:09:24 UTC returned exactly one candidate, but the initial script's expected path/UUID/MIME/ready-state check failed before requesting object bytes. It stopped before any Auth fixture or Storage mutation. The failure report is `existing-qa-object-preflight-2026-10-08T09-09-24.179Z.json`; it does not establish a Storage outage or authorization bug. The initial shape guard assumes PNG even though the Oct4 evidence states only a cat-logo byte hash/size, so a precise field-level diagnostic is needed before deciding whether the candidate is invalid or the preflight expectation is too narrow.

The field-level diagnostic subsequently confirmed the unique candidate was valid WebP, with every owner/generation/exact-path/ready guard passing. Root authorized continuing under existing allowed image MIME types without relaxing identity/path/hash/size checks. The existing-object foreign/anonymous denial run passed; see README.md and existing-object-isolation-2026-10-08T09-13-26.420Z.json. No new object or catalog generation was created.
