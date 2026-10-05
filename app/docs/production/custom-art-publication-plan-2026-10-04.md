# Custom artwork publication implementation plan

Date: 2026-10-04. Status: architecture and security review only; this document does not claim implementation, migration, or release.

## Required outcome

A user can generate artwork in ChatGPT or upload an image, save it as a private nook draft, review it, and publish a public or private study nook. Other authorized users can join and see the exact published scene in the same workspace tab. Editing or deleting the original draft does not change the published scene. Focus, membership, and progress belong to the actual nook, not a generic custom-background bucket.

This is an original product requirement. The existing curated-only publication limit is an implementation gap, not a reduction of scope. Creator-authored rewards and progression paths remain additional required work; enabling artwork publication alone does not finish the overall custom-nook requirement.

## Verified current blockers

- `server/nook-creator.mjs`, `nookDraftReadiness`: rejects `backgroundImage`, `_storedBackground`, or non-curated artwork with `CUSTOM_PUBLICATION_UNAVAILABLE`. The prepared manifest contains only a curated `roomId`, metadata, visibility, and `pathTemplate: 'none'`.
- `server/community-tools.mjs`: community creation accepts built-in room IDs and does not accept a custom scene or artwork reference.
- `public.nooks_rooms`: no immutable published artwork association. Latest community implementation is `supabase/migrations/20261004195006_community_management_pagination.sql`.
- `nooks_private.artwork_persisted_refs`, in `supabase/migrations/20261004201449_artwork_generation_lifecycle.sql`: scans workspace and public-share references only. Without a change, deleting a draft can eventually make an image used by a published community eligible for cleanup.
- `ui/src/community/NookStudio.tsx`: disables custom publication and describes custom artwork as private-only.
- `ui/src/community/useLiveNooks.ts`: live nook metadata has no published scene identity or separately authorized artwork read.
- `ui/src/App.tsx`: live selection resolves only through `roomScenes`. An image sets `currentRoomId` to `custom`, while community focus attachment requires the selected nook's `roomId` to equal that value. Merely attaching artwork can therefore omit `nookId` from focus requests and lose community credit.
- `server/model-result.mjs`: sanitizes known private artwork locations, but new publication/scene fields must be explicitly sanitized before they become model-visible.

## Existing infrastructure to reuse

Use the existing database and private `nooks-private` Storage bucket. No new paid service or public bucket is necessary.

Modern artwork objects already have owner/hash/generation paths, immutable uploads, verified hashes and MIME types, reservation pins, and irreversible cleanup fences. A reference to a verified immutable generation is a valid published snapshot; copying its bytes is unnecessary. Legacy two-part owner/hash paths must be promoted to a new verified generation before publication.

`server/supabase-store.mjs` already hydrates private artwork after authorization and verifies the byte limit, hash, and MIME type. `readShare` demonstrates hydration for a trusted foreign owner obtained from an authorized database result. Reuse that pattern, not a client-provided owner or path.

## Implementation sequence

### 1. Immutable community scene association

Add a dedicated table, for example `nooks_room_scenes`, keyed by `nook_id`, containing the creator/asset owner, verified artwork generation identity, sanitized appearance, snapshot digest, and creation timestamp. A published scene is immutable. Use a new reviewed publication for a changed scene rather than silently mutating existing bytes or metadata.

Enforce the owner/asset relationship structurally where possible. Validate the generation's ready state under the existing artwork-owner lock; a foreign key alone cannot enforce mutable lifecycle state. Enable RLS and revoke ordinary client access. Only the server path may create associations.

The snapshot contains only approved appearance and publication fields. Do not include private prompts, host-generated file IDs, signed download URLs, tokens, unrelated workspace content, or draft recovery state.

### 2. Trusted, idempotent publication transaction

Extend the reviewed publication manifest so its canonical digest covers the exact immutable scene, metadata, and visibility. Preserve explicit review/confirmation and draft revision checks.

Add a trusted server-only publication method/RPC. The authenticated actor is bound by the backend, never supplied by the UI or model. Prefer an intent ID resolved inside the transaction, or an equivalently verified internal manifest. Do not broaden the public `nook_create` schema to accept arbitrary owner IDs or storage paths.

Under the common artwork-owner lock and compatible workspace/room lock order, validate:

1. The reviewed draft and publication intent belong to the actor.
2. The current revision matches the reviewed revision.
3. The exact artwork belongs to that owner and is in ready, non-deleting state.
4. The request's canonical snapshot digest matches any existing idempotent result.

Create the community, immutable scene association, owner membership, and outbox event atomically. Preserve safe timeout retries using the same request key. Never return an existing community for a mismatched scene or visibility.

The existing publishing/retry-needed draft lock already preserves the draft reference while commit is uncertain. Prepared intents may be invalidated by draft edits; revision checking must prevent stale publication. Avoid unnecessary long-lived pins for every prepared intent.

### 3. Authorized scene reads

Add a read operation such as `nook_scene_get(nookId)`. The caller supplies only the nook ID. The database authorizes a nonarchived public nook, or active membership in a private nook, before returning a trusted owner/scene association to the server adapter. An invitation is not membership until successfully accepted.

Hydrate bounded, hash-verified image data through the existing server reader. Keep bytes and private storage references in UI-only metadata; return only safe scene status/identity metadata to the model. Do not place full images in directory responses or every presence poll.

Keep the bucket private. Prefer authorized media reads to long-lived signed URLs for private community artwork: Supabase signed URLs remain usable until their expiry, so they do not provide immediate membership revocation. Existing service credentials bypass Storage RLS, making explicit actor authorization before each read mandatory.

The UI may cache a verified immutable scene in memory by account plus scene identity/revision. Clear private scene state on account change, leave, membership revocation, archive, or authorization failure. Reauthorize restoration; a local selected-nook hint is not permission. No system can retract bytes a previously authorized member already downloaded, but future reads and active UI state must respect revocation.

### 4. Lifecycle and orphan handling before feature enablement

Extend `artwork_persisted_refs` and inventory to include live community scenes before any custom publication is enabled. Editing/deleting a draft must preserve an image still referenced by a published nook.

Publication, archive, and cleanup must coordinate through the existing artwork-owner lock. Acquire it before room/focus locks, consistent with the existing workspace commit order. When archive removes the final live reference, set the unreferenced timestamp to the removal time, not the original upload time. Preserve existing retention, bounded claims, permanent deletion fences, and late-upload tombstone handling.

Delete bytes through the Storage API, never by directly deleting rows from `storage.objects`. Keep cleanup operator-controlled under the current policy unless separately authorized scheduling is added. Failed or canceled uploads remain subject to existing pins, retention, quotas, and cleanup reconciliation.

### 5. Live UI, identity, focus, and progress

Treat active community scene state separately from the viewer's editable personal appearance. Store/select the nook ID and published scene revision. Never copy another owner's `_storedBackground` into the viewer's private workspace or reupload it as their own image.

Fetch and render the scene when selecting/restoring a nook. Keep the existing same-tab transition. Handle load failure with an honest retry/fallback state while preserving study work; do not replace or discard the published scene. Directory cards need lazy authorized scene previews rather than one megabyte per row in a bulk list.

Separate three concepts: nook identity, displayed scene, and reward policy. Membership/focus credit must use the actual nook UUID. Custom communities must not share the generic `custom` progress bucket. Use a nook-specific progress identity, with server-validated reward policy separate from appearance. Preserve the original focus session's nook identity if the user changes scenery mid-session.

Arbitrary creator-authored paths are still rejected by the current backend (`pathTemplate: 'none'`). Their authoring, validation, immutable policy snapshots, item fulfillment, and per-nook progression require additional implementation. Do not describe this artwork feature as completing that broader scope.

## Blocking invariants

- A caller cannot supply or infer another owner's private asset path to gain access.
- Private membership is checked by the backend before returning any artwork bytes or private capability.
- A published scene does not change when its draft changes.
- Idempotent retries cannot produce duplicate communities or reuse a request key with a different snapshot.
- A cleanup-claimed/deleting generation cannot become newly referenced.
- A live community reference prevents cleanup after its source draft is deleted.
- Archive and cleanup use a compatible lock order and start retention from actual reference removal.
- Scene bytes, storage paths, generated file IDs, private prompts, and temporary download capabilities do not leak through model-visible results, logs, or public directory metadata.
- Account switching and membership revocation cannot restore cached private artwork without authorization.
- Focus and rewards are attributed to the selected nook, not inferred solely from a background image or generic `custom` identifier.

## Parallel ownership

| Packet | Files and responsibility |
| --- | --- |
| Database/lifecycle | New migration; scene association, publication/read authorization RPCs, lifecycle reference helpers, real SQL authorization and concurrency tests |
| Server publication/media | `server/nook-creator.mjs`, `server/community-tools.mjs`, `server/supabase-store.mjs`, `server/model-result.mjs`; request validation, manifest digest, image hydration, safe result boundaries, server regressions |
| UI continuity | `ui/src/community/NookStudio.tsx`, `ui/src/community/useLiveNooks.ts`, scene loading/cache module, community preview UI, UI regressions |
| Root integration | `ui/src/App.tsx`, focus/progress contracts, API coordination, migration sequencing, deployment and live verification |

Agree the RPC/result contract before parallel edits. The lifecycle migration must be present before enabling server publication, and the server capability must be present before enabling the UI action.

## Release verification

Use real local SQL transactions for authorization and race coverage, not only mocked RPC responses.

- Owner A publishes; B can read a public scene and cannot read a private scene before accepting an invite.
- A forged owner/path, expired invite, inactive membership, archived nook, and unknown nook cannot obtain private bytes.
- Leave, removal, and archive prevent subsequent private reads and clear active private UI state.
- Editing/deleting the original draft preserves the exact published artwork.
- Publication retry after uncertain timeout returns one identical community.
- Snapshot mismatch on a reused idempotency key is rejected.
- Concurrent cleanup/publication cannot delete a newly published image or attach a deleting generation.
- Concurrent archive/cleanup has no deadlock and uses correct retention timing.
- Actual ChatGPT-generated file import completes through publication, not only a test upload fixture.
- Joining/restoring a custom public/private nook renders its artwork in the existing tab and credits the correct nook.
- Scene read failures preserve notes/focus work and offer recovery.
- Directory/presence polling does not repeatedly fetch full images.
- Model-visible output and diagnostics contain no private capabilities or artwork bytes.

No hosted migration or deployment was performed as part of this review. Native host file handoff compatibility and the actual two-user public/private flow must be verified before claiming the feature works end to end.

## Official platform references

- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control): Storage policies, operation permissions, and service-key bypass.
- [Serving private downloads](https://supabase.com/docs/guides/storage/serving/downloads): authenticated private reads and signed URL lifetime.
- [Deleting objects](https://supabase.com/docs/guides/storage/management/delete-objects): remove objects through the Storage API.

