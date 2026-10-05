# Creating and publishing a nook

Status: **implementation plan, not a shipped creator system**. Reviewed 2026-10-01. This document covers custom artwork, private invitations, public discovery, and versioned progression. It does not change the existing community API or activate the proposed paths in `ui/src/world/nook-paths.json`.

## What exists, and what remains

The current server can create a public or private community using a curated backdrop, join a public community, accept a private invitation, expose a membership-gated roster, and archive an owned community. A trusted server identity determines the account; tool arguments cannot choose the actor. Invitations have hashed codes, expiry, a limited use count, and atomic acceptance. Focus credit belongs to a recorded server session, not presence heartbeats.

The Supabase adapter also stores owner-only appearance images, addressed by SHA-256, in a private bucket. Its current limit is **1 MiB per image**, accepting PNG, JPEG, and WebP. This is not yet a shared custom-nook artwork system: there is no community-specific image foreign key, immutable publication revision, generated-image ingestion worker, creator reward catalog, report queue, or moderator role. `custom` as a background identifier does not resolve those missing relationships.

These findings refer to `server/community-tools.mjs`, `server/supabase-store.mjs`, and the three existing Supabase migrations. The backend owner confirmed this scope. The Supabase connection, hosted migration application, real authentication, and realtime behavior still need end-to-end verification; local schema and permission tests do not demonstrate a deployed service.

Invitations are owner-only. There is no moderator role in the current schema; creator documentation and UI must describe only the owner permission. A future moderator tier requires an explicit permission migration before it appears in product copy.

## The intended creator experience

Keep creation inside the Nooks interface, with ChatGPT as the conversation anchor. A creator should never need to understand buckets, manifests, model names, or file identifiers.

1. **Start a nook.** Choose a curated background, describe a new scene, or upload a picture. Save an owner-only draft immediately. Use a short name and an optional description. Suggested styles are illustration, anime, watercolor, pixel art, and realistic; they are choices, not generated marketing copy.
2. **Make the scene.** “Ask ChatGPT to draw it” sends the selected scene brief to the conversation. Keep the draft open with a clear “Choose image” action. The user can also choose an existing authorized file or upload a saved image. Never report “Your nook is ready” before Nooks has actually received and validated an image.
3. **Make it usable.** Preview desktop and narrow layouts, choose the focal point, set text contrast, and choose an optional ambient sound. The chat column remains readable over every crop. A still illustration is enough; animations and placed objects require reviewed scene anchors.
4. **Choose its path.** Initially use a small, platform-authored cosmetic path template, or no path. Show its exact time thresholds and rewards. A creator cannot type arbitrary code, invent unlimited rewards, or grant study time. Rich custom paths come later.
5. **Choose who can join.** Default to private. Show precisely what a public listing contains before “Publish publicly.” Private publication creates an invitation-only nook. Public publication enters review; it does not appear in discovery while pending. The final result is a saved, versioned nook that can be reopened from another ChatGPT conversation.

The last screen is a real preview: name, image, description, creator display name, visibility, proposed path, and audio source. One clear primary action publishes the displayed version. No nested onboarding panels, inspirational filler, or payment screen is part of this flow.

## Native ChatGPT image generation: the supported boundary

The documented file helpers let a widget upload a selected file, optionally pick from the ChatGPT file library, and obtain a temporary download URL. The picker is not available to every user, so feature-detect it. File tools declare a top-level file input through `openai/fileParams`; its schema declares `download_url`, `file_id`, `mime_type`, and `file_name`, with only the first two required. A follow-up message can ask ChatGPT to act. These mechanisms are documented in the [plugin UI reference](https://developers.openai.com/plugins/reference).

**Unverified:** the inspected reference does not establish a direct native image-generation method or promise that a generated image automatically becomes selectable or is delivered to Nooks. A follow-up request is not a generation-completion callback. The handoff must be tested with a real generated image in the actual ChatGPT host before promising one-click generation and installation.

For now the reliable product contract is **ask ChatGPT to create an image, then choose or upload the image to use**. Never scrape the conversation, infer a file ID, inspect undocumented ChatGPT endpoints, or treat the assistant's textual mention of an image as possession of its bytes.

OpenAI separately documents an [API image-generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation). That is a different backend integration; it is not evidence that a user's ChatGPT subscription pays for Nooks' API usage. Do not silently substitute it for native generation. An API fallback would need its own explicit product, cost, quota, and credential decisions.

The native proof must record the host, account capability, generated file's authorization path, successful import, expired-URL retry, and unavailable-picker fallback. Until then, label the action “Ask ChatGPT to draw” rather than implying a guaranteed in-widget generator. Never advertise unlimited generation: ChatGPT's capabilities and limits remain host-controlled.

## Draft and release state

Use separate records for the creator's mutable draft and each immutable release. A draft is not a community people can accidentally join.

| State | Who can see it | Permitted next action |
| --- | --- | --- |
| Draft | Owner | Edit, import asset, preview, discard |
| Processing asset | Owner | Continue editing metadata, cancel import |
| Ready to publish | Owner | Publish privately or submit publicly |
| Private release | Owner and active invited members | Study; owner edits a new draft or archives |
| Public review pending | Owner and reviewers | Review, withdraw, reject with reason |
| Public release | Public listing; members' study details remain gated | Join; owner edits a new draft or unlists |
| Changes requested | Owner and reviewers | Revise and resubmit |
| Archived | Owner's management view; retained personal history | Restore if permitted, export, request deletion |

`draftRevision` increments on every accepted edit. Publishing requires `expectedDraftRevision`; reject a stale request without overwriting newer edits. An idempotency key identifies one publishing attempt. Store its request hash so reuse with different content returns a conflict rather than silently returning an unrelated release.

Publishing snapshots the approved asset IDs, crops, attribution, path version, and metadata into an immutable release. Editing a published nook creates a new draft. Existing study sessions keep their originating nook and path version. They are not interrupted by a new background or renamed listing.

A public release has a dedicated publication audience; historical public versions must never be exposed through a private-draft read endpoint. Public-to-private changes unlist future access and require a separate private release. Explain that previously public images may have been downloaded or cached. Previously issued access cannot be undone by changing a label.

## Proposed data contract

Keep the existing `nooks_rooms.id` as the stable community ID. Public copy says nook; a database rename is unnecessary. Introduce new tables in a later migration, with RLS and server authorization designed together.

| Record | Minimum contents | Authority and lifetime |
| --- | --- | --- |
| `nook_drafts` | ID, nook ID if existing, owner, revision, title, description, style, private scene prompt, selected asset, crops, proposed visibility, proposed path | Owner-only mutable draft; no public search index |
| `nook_assets` | ID, owner, content hash, MIME, dimensions, byte count, private original key, derivative IDs, processing state, provenance, moderation decision | Immutable bytes; ownership checked on every attachment |
| `nook_releases` | Nook ID, monotonic version, manifest hash, asset IDs, display metadata, visibility, path version, review state, published timestamp | Immutable manifest; only published versions are joinable |
| `nook_release_assets` | Release ID, asset ID, role, crop/anchor configuration, public derivative key when approved | Explicit reference prevents unrelated private files from being exposed |
| `nook_path_versions` | Nook ID, version, stable milestone IDs, integer-second thresholds, asset references, release status | Validated schema; no executable creator code |
| `nook_member_controls` | Nook ID, account ID, restriction state, reason category, actor, timestamps | Owner/platform moderation; never derived from client claims |
| `nook_reports` | Reporter, target release/member, category, concise evidence, decision, appeal state | Reporter and reviewer access only; no public allegation feed |
| `nook_jobs` or existing outbox | Unique event ID, job type, object/revision ID, attempts, lease, next attempt, error category | Server-only at-least-once processing with deduplication |

Continue using the existing members, invitations, focus sessions, and identity links. Add foreign keys and indexed lookups rather than saving an entire creator catalog inside the general workspace JSON. The server derives `owner_id` and `account_id`; neither is accepted as authorization from a tool body.

The release manifest contains stable references, not signed URLs or image data URLs. The model receives a concise summary and selected identifiers. Image bytes, private generation prompts, membership lists, and opaque storage capabilities are not repeatedly pushed into conversation context. A session can reopen a saved draft by ID without importing the chat transcript. OpenAI's [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) require narrow tool inputs and prohibit reconstructing accumulated conversation history; a creator brief is an explicit selected input, not permission to import the conversation.

## Image import and storage

The current 1 MiB appearance bucket remains unchanged. A separate generated-image ingestion lane is proposed because large source images may require resizing before storage. The following are **Nooks design limits to validate**, not ChatGPT platform limits: one source image per import, 8 MiB maximum encoded input, 24 megapixels maximum decoded area, and 30 seconds maximum fetch/decode time. Start with PNG, JPEG, and WebP. Reject SVG, HTML, animated formats, malformed images, and ambiguous polyglots. Tune these limits after measuring real generated files and memory usage.

1. Authenticate the account and verify ownership of the target draft before accepting work. Reserve the draft's expected revision and a unique import request ID.
2. Receive a user-authorized file input or a directly uploaded file. A textual URL is not sufficient proof of file ownership or permission.
3. For host download URLs, validate HTTPS, constrain the verified host/origin set, block private/reserved destinations, limit redirects, revalidate each hop, and stream with a byte limit. Do not invent the permitted host list before testing real host files. If a safe allowlist cannot be established, keep the file-picker/manual-upload path and defer remote server fetching.
4. Treat MIME and filename as untrusted hints. Decode in a resource-limited worker, verify actual format and dimensions, strip metadata, and re-encode approved derivatives. Never forward Nooks credentials to the download origin or log the signed URL.
5. Save the owner-only source to quarantine, if source retention is needed. Produce a desktop image, narrow crop, and small discovery thumbnail. Hash the final bytes. Do not reuse a private original as a public thumbnail.
6. Attach an asset to the draft only after validation succeeds and its revision still matches. A completed obsolete job must not overwrite the creator's newer selection. Retain the previous usable asset on failure.
7. Before public release, complete image/text moderation and rights review. Only then copy approved derivatives into the public delivery lane. Generated images are untrusted user content, not automatically approved because a model produced them.

Use private storage for drafts, originals, and invitation-only assets. Supabase documents that public bucket retrieval bypasses read access controls; authenticated downloads or signed URLs are needed for private objects. [Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals). The current owner-prefix policy is insufficient for sharing a private custom background with invited members: introduce a release-aware access check instead of making the whole bucket public.

Signed URLs remain usable until they expire even if auth credentials change. Choose a short TTL, proposed 60 seconds, for private derivatives; use an authenticated image proxy if immediate membership checks are required on every new request. Revocation cannot erase a file already downloaded. [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads).

Serve immutable public derivatives through cacheable content-hash URLs. Keep public discovery thumbnails small and load full scenery only when joining. There must be no per-view database write or signature-generation call for public assets. At 10,000 joins, a 1 MiB background means roughly 10 GiB of delivery before cache effects; artwork bandwidth is a cost center even if ChatGPT handles text generation.

## Visibility, invitations, and study privacy

Publishing a nook shares its approved scene and listing. It does **not** share the creator's courses, notes, flashcards, quizzes, uploaded lecture material, chat history, generation prompt, or private account details. Each of those requires a separate explicit sharing contract. A public nook is a shared place to study, not permission to read its members' schoolwork.

Before joining, show which profile fields other members see. Use a chosen display name and avatar; do not infer a legal name or institution. Expose only the selected nook's public study statistics. Total focus time, current timer, and streak should be opt-in display fields, with a way to hide presence. Avoid broadcasting exact attendance history across unrelated nooks.

Reuse the current invitation contract: owner-only creation, 1–168-hour validity, 1–25 uses, hashed token at rest, revocation, and atomic acceptance. Never put invitation codes in analytics or log bodies. A code should be shared deliberately by the user, not sent to contacts automatically. Existing membership and exhausted-invite behavior need explicit product copy.

For an invitation-only launch, add owner removal and platform blocking before public creator discovery. Distinguish removal from banning: a removed member of a public nook can otherwise immediately rejoin. Membership checks must cover the roster, private release metadata, asset access, presence, and all invitation management operations. Archiving stops new joins and presence but preserves a student's personal earned history.

Realtime channel access needs its own authorization, not just database table policies. Supabase documents authorization caching for a connection, so verify revocation behavior rather than promising immediate removal from an already-open channel. Disconnect affected connections or bound their authorization lifetime. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization). Until genuine Supabase Auth linking exists, use the trusted relay/polling boundary already planned by the backend owner; never manufacture a browser JWT from a Sites account identifier.

## Public discovery and moderation

Public custom nooks require an operated moderation queue, not only a filter in the client. Begin with a reviewable volume and clear response ownership. Automated checks can prioritize the queue; an appeal and takedown route still need a human operator.

- Review the title, description, background, thumbnail, visible text inside artwork, avatar, outbound links, and audio source. Re-review new public versions; approval of one version does not approve future edits.
- Ask creators to confirm they have rights to share supplied images/audio. Record provenance and attribution fields. Do not describe generated fan art or a Spotify link as automatically licensed for redistribution.
- Keep reports private, rate-limit duplicate reports, and record decisions without exposing reporter identity. Provide a concise reason and appeal path to the creator.
- Supply platform unlisting, account restriction, and emergency asset denial controls. A CDN purge cannot retract copies users already saved; communicate the actual result accurately.
- Do not expose raw stranger-to-stranger chat, direct messages, file trading, or public note sharing as an accidental side effect of joining a nook. Those need their own moderation and permission designs.
- Do not invent busy lobbies. Count authenticated recent presence, label delayed counts, exclude blocked/banned accounts, and keep demo populations out of production discovery.

OpenAI's [security and privacy guidance](https://developers.openai.com/plugins/guides/security-privacy) calls for minimal scoped access, explicit data handling, and a clear retention policy. For Nooks, that means private prompts and study materials stay out of discovery and operational logs, and deleted drafts do not remain indefinitely in orphaned storage.

## Custom progression and scenery

The complete curated proposal is in `nook-paths.md` and `ui/src/world/nook-paths.json`. It is disabled. It preserves the existing 15/45/90/180-minute unlocks and adds separately gated long-term proposals. Do not activate those proposals simply because custom creation ships.

Custom nooks initially choose a published platform path template. Bind a specific template version to each release. The creator can name the nook, choose artwork, and write a short description, but cannot edit a student's earned ledger or redirect credit into another nook. All unlocks use server-recorded completed active focus seconds, with pauses/breaks excluded. This is timer accounting, not proof of attention or comprehension.

Later custom paths use a constrained manifest: stable milestone ID, integer-second cumulative threshold, allowed effect type, approved asset, and disclosure text. Validate monotonically increasing thresholds, distinct IDs, a finite maximum path, and asset availability. No JavaScript, arbitrary CSS, HTML, external fetch instructions, paid random drops, token-use scoring, or creator-defined executable conditions.

Keep at most three placed objects, one soundtrack, and one selected scene variant. A scene needs reviewed anchors, perspective, scale, occlusion, and responsive crop mapping before objects can be placed in it. Until then rewards appear in a collection viewer. No roaming cat or generic overlay creature returns through the custom creator.

Changing a path version never relocks earned items. Preserve existing grants; grant newly released milestones retroactively when existing eligible seconds meet their thresholds. A child study space credits its originating parent path unless the release explicitly defines an independent community and explains that distinction. Duplicating someone's public nook creates a new stable ID and fresh ledger; it never copies members or earned history.

## Tools and server boundaries

Do not overload the existing `nook_create` call with publication, file fetching, and moderation side effects. Its current curated-backdrop behavior remains valid during migration. Introduce narrow tools with their own schemas and permission checks.

| Proposed operation | Inputs that matter | Server result |
| --- | --- | --- |
| `nook_draft_create` | Request ID, optional curated backdrop, title | Owner-only draft ID and revision |
| `nook_draft_update` | Draft ID, expected revision, allowed metadata patch | New revision or conflict with current revision |
| `nook_asset_import` | Draft ID, expected revision, request ID, authorized file | Import job ID and processing state |
| `nook_creator_get` | Owned draft or nook ID | Minimal current draft/release state; authorized image references |
| `nook_release_preview` | Draft ID and revision | Exact public/private manifest preview and remaining blockers |
| `nook_release_publish` | Draft ID, expected revision, request ID, explicit visibility | Immutable private release or public review submission |
| `nook_release_unlist` | Nook ID, expected current release | No further discovery; retained history and explicit access result |
| `nook_member_remove` / `nook_member_ban` | Nook ID, target member, reason category | Owner/platform-authorized membership change |
| `nook_report` | Target release or member, category, concise evidence | Private report receipt |

The release preview is read-only; saving, importing, publishing, joining, and reporting are writes. Publication and unlisting must describe their actual audience and side effects in tool metadata. Set annotation values from the final behavior, not a global default. Public publication has a different external effect from an owner-only draft save; review its approval presentation in the host. Application authorization is still enforced on the server regardless of tool hints.

Return typed errors: unauthenticated, forbidden, conflict, invalid file, import expired, processing, quota reached, review required, and temporarily unavailable. Preserve the draft on every recoverable failure. Return the same stored result for a repeated successful request ID. Never return a signed private asset URL in a public listing response.

## Jobs, events, and operational limits

Use the existing outbox's leases, deduplication, retries, and dead-letter handling for work Nooks owns. Proposed event types are `asset.import.requested`, `asset.validated`, `asset.rejected`, `release.review.requested`, `release.published`, `release.unlisted`, and `asset.cleanup.requested`. Each contains IDs and versions, not image bytes or private notes. A job rechecks authorization/state before committing, so a late worker cannot publish an archived draft.

No native ChatGPT image-generation completion webhook has been verified. These Nooks events must not be presented as that missing host capability. If a moderation provider later calls Nooks, require signed, timestamped callbacks, replay detection, body limits, and exact provider authentication. Creators cannot register arbitrary webhook URLs in the initial product.

Proposed starting limits are two concurrent imports per account, ten imports per account per hour, and a bounded queue per worker. Retain the existing cap of 50 active created nooks until cost/abuse data supports a change. Enforce a total asset-byte quota as well as a count. Select exact storage and public-publishing quotas before launch; “free” is not an operational quota. Limit expensive decoding globally so one burst cannot exhaust all workers.

Suggested retention defaults for product review: remove abandoned quarantined uploads after 24 hours, failed imports after seven days, and unreferenced superseded drafts after 30 days. Keep approved release derivatives while a live release references them. Account deletion must remove private drafts/originals, revoke invitations, and resolve owned public nooks deliberately. Do not silently orphan a community under a deleted owner. Published history, reported content, and legally required retention need an explicit policy before implementation.

Record import latency, failure category, decoded memory budget, queue depth, publish conflicts, permission denials, asset delivery volume, moderation age, and account deletion completion. Log IDs and coarse sizes, not signed URLs, private prompts, invitation codes, or study content. Alerts require an assigned operator and a tested response, not just a dashboard.

## Implementation sequence and launch evidence

**First: make curated creation trustworthy.** Deploy and verify the existing identity/community contract; correct the owner/moderator description; paginate discovery and rosters; exercise invites, removal, archive, and denied access with two independent accounts. Keep fake activity confined to an explicitly separate demo mode.

**Second: private custom images.** Implement owned drafts, revision checks, authorized file import, immutable assets, crop preview, release-aware private image access, and cross-session reopening. Prove the native handoff or keep the explicit choose/upload step. No public gallery is needed to validate this first useful creator loop.

**Third: public publishing.** Add immutable releases, review operations, reports, rights fields, public derivative delivery, unlisting, abuse limits, and deletion. Publish only the reviewed version. Verify the real ChatGPT plugin UI and hosted service together before announcing public creator nooks.

**Fourth: custom paths and scene placement.** Add validated creator manifests, reviewed reward assets, version migration, and authored anchors. Unlocking illustrations in a collection is independently useful while scene-specific animation remains deferred.

Required acceptance evidence, not a claim that these tests have run:

1. A generated image selected in the real ChatGPT host imports, survives a new conversation/device, and becomes a private nook. Test missing picker capability and expired download URLs without losing the draft.
2. Account B cannot read account A's draft, private original, signed-URL minting endpoint, or private roster; invitation acceptance grants only the intended release/member access. Leaving, removal, revocation, and archive remove future authorized access.
3. Oversized, malformed, SVG, misleading-MIME, redirecting, private-network, and decompression-bomb inputs fail within the configured resource budget. Validation failure never replaces an existing good background.
4. Concurrent edits and duplicate publish requests produce one chosen immutable release. A stale worker, revoked owner, archived draft, or withdrawn review cannot publish later.
5. Editing a public nook does not leak its new private draft. Public-to-private changes stop new public listing/access as designed and state the limits of prior cached copies.
6. Focus earned before an update remains, retries do not award twice, and a creator cannot grant time or relock a member's reward. A private note attached to a course never appears in discovery or a creator manifest.
7. A measured load exercise covers public thumbnail/background delivery, a busy lobby, pagination, concurrent imports, queue backlog, and moderation operations. Choose a capacity target and record results; do not infer support for thousands of users from a successful local demo.

The launch promise can be simple: **create a study nook, keep it private or share it, and return to the place and progress you saved.** Automatic native image handoff, creator-defined rewards, and scene-fitted animation must each earn their own verified release rather than being implied by that promise.
