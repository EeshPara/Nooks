# Private Storage verification — October 8, 2026

The existing documented October 4 QA cat-logo object passed a real foreign-account isolation check on dedicated project `lcfcjglybfeozyrjjikk`. No new artwork was uploaded, and no existing object, catalog row or source-owner account was changed.

The exact documented SHA-256 and October 4 creation window identified one ready generation, created at `2026-10-04T20:29:03.952455Z`, MIME `image/webp`. A bounded service read before testing returned HTTP 200 and exactly 173,490 bytes whose SHA-256 matched the documented fixture. The test then created one empty admin-confirmed `example.invalid` account, initialized it through the deployed public workspace API, and verified its mapped account differed from the object owner.

| Read | Result |
| --- | --- |
| Valid authenticated foreign user, authenticated object route | HTTP 400 error JSON; no image bytes |
| Anonymous request, authenticated object route | HTTP 400 error JSON; no image bytes |
| Anonymous request, public object route | HTTP 400 error JSON; no image bytes |
| Privileged exact object read after denials | HTTP 200; same 173,490 bytes and documented hash |

The positive before/after checks rule out missing-object false positives. Image bytes remained in memory only; reports contain no bytes, credentials or signed URLs. The fixture session, account and Auth identity were removed successfully; final checks found zero account rows and Auth returned 404. Its one exact private throttle topic was provided to root for guarded cleanup.

Evidence: `existing-object-isolation-2026-10-08T09-13-26.420Z.json`. The earlier `existing-qa-object-preflight-2026-10-08T09-09-24.179Z.json` is a preserved harness failure: it incorrectly assumed PNG from a document that specified only byte hash/size. A metadata-only diagnostic confirmed WebP and all identity/path/ready-state guards. The corrected test accepts only the product's existing PNG/JPEG/WebP types; hash, byte count, exact owner/hash/generation path, unique date match and ready state remain required.

This adds foreign authenticated denial and an independent downloaded-byte hash to the earlier native owner-upload/read and anonymous-denial evidence. It does **not** establish a new public draft upload, owner-user-JWT download, signed-URL behavior, physical object deletion, retention cleanup, hosted backup restore or shared custom-art publication.

The audit found a concrete reason not to create a new disposable artwork fixture casually: generation catalog rows permanently reference their account, service_role cannot delete them, cleanup requires at least 24-hour unreferenced retention, and tombstones are preserved indefinitely. No privileges, FK, retention timestamps or policy were changed to circumvent that design. Existing source allows private artwork drafts but blocks custom shared publication in web/cloud; app-only pending support was preserved. Root was informed about the misleading publication copy in `NookStudio.tsx:354`.

See `audit-and-test-plan-2026-10-08.md` for source contracts, existing evidence and why the narrower existing-object scope was selected. The reusable exact-object harness is `verify-existing-object-isolation.mjs --run-authorized-one-foreign-fixture` with Node 22; it is not scheduled monitoring and must not be repeatedly run without a new need.
