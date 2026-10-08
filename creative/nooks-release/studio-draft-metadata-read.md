# Studio draft metadata read — next iteration

Read-only source assessment, 2026-10-08. No implementation or live benchmark performed. Keep separate from the reviewed My Nooks/save-focus release.

## Finding

`web/server/nook-creator.mjs:68–70` calls `store.read(user.id)` before producing the `nook_drafts_list` summary. `web/server/supabase-store.mjs:134–142` routes that read through `load` and `unpack`. `unpack` enumerates the current workspace appearance and every creator draft appearance, validates all stored references, then downloads each unique uncached artwork object, checks its hash, validates its image, and converts it to a data URL. The list response subsequently returns metadata only: no pixels or private storage paths.

The store is request-scoped. Duplicate references are deduplicated within a read; different images load concurrently with a three-second per-fetch timeout. Normal creator limits permit three custom-image drafts, plus the current workspace appearance, so listing can fetch up to four distinct artwork objects in that normal case. This is a source-derived opportunity, not a measured latency or bandwidth result. Skipping hydration would still read the existing workspace RPC response; it would not make the database query metadata-only.

## Minimal recommendation

Add an internal, default-on artwork-hydration option to `read`/`load`/`unpack`, selected off **only** for `nook_drafts_list`. Keep the existing workspace RPC, `account(userId)` binding, authoritative revision checks, clone, removal of transient warnings, and `parseArtworkReference` validation of **all** known appearance records. Return before network hydration only after those checks. Other stores can keep their existing read behavior. Do not accept a client-supplied hydration flag, expose raw stored state, or change get/preview/write/share behavior.

Keep the existing summary function: `hasArtwork` describes a saved image/reference, not proof of an available object. The current missing-object path already retains `_storedBackground`, so missing or hash-corrupt artwork remains `roomId: custom, hasArtwork: true` in the list. Actual image availability remains checked when the full draft/workspace is opened. No database migration, new Storage permission, public URL, HEAD check, or caching layer is needed for this first step.

## Required parity proof

| Case | Required metadata-list behavior |
| --- | --- |
| Valid saved image | Same summary/publication fields as the hydrated list; zero Storage requests; no pixels or private paths in the response. |
| Missing object / Storage 404 | Same existing custom/hasArtwork summary; retained reference not cleared; no false claim that bytes were verified. Full reads still emit their existing artwork-unavailable warning. |
| Hash-corrupt bytes / unavailable Storage | Same summary as current degraded hydration; list no longer downloads bytes. Full reads continue hash verification, preserve the reference, and warn. |
| Duplicate artwork reference | Identical summaries for each draft; zero list Storage requests. Full reads retain their current one-download-per-unique-reference behavior. |
| Malformed / foreign-owner reference | Reject before returning any metadata, including references in the current workspace appearance or a different draft. Skipping hydration must not bypass the existing whole-appearance validation. |
| Invalid caller identity / mismatched userId | Constructor verification and account binding reject as before, before backend access; creator read-scope checks remain. |
| Invalid authoritative revision | Reject as before, including negative/non-integer revision; database revision remains authoritative. Preserve the current no-workspace/empty-account behavior. |
| Owner with no drafts / malformed creator state | Same empty list or `STORAGE_INVALID` behavior as today; no implicit repair/write. |
| Full get/preview/read/write | Hydration stays default-on; existing missing-object, hash, ownership, duplicate-fetch, cancellation, and write-preservation regressions continue to pass. |

One intentional operational difference must be documented: a metadata-only list no longer attempts artwork retrieval and therefore no longer emits `onArtworkUnavailable` telemetry for that list request. It must not emit a fabricated success observation instead. Full reads retain the existing observation.

Use deterministic mocked store/API tests comparing hydrated and metadata responses, asserting exact fetch counts and absence of image/path leakage. Existing Supabase coverage is in `app/tests/supabase.test.mjs` and `cloud/tests/supabase.test.mjs`; source snapshots differ, so port selectively. The current public request-cancellation suite covers caught hydration cancellation and must remain valid for full reads.

Official [Supabase download documentation](https://supabase.com/docs/reference/javascript/storage-from-download) was checked for the storage context. This proposal uses the application's existing service-only authenticated REST path and adds no Supabase API feature. The skill-requested changelog index returned HTTP 503 during this read-only assessment; recheck relevant official documentation before any implementation that changes platform API usage.
