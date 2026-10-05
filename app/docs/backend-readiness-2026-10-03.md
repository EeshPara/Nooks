# Nooks backend readiness — 3 October 2026

## Current verdict

The native Nooks plugin is now connected to the dedicated Supabase project `lcfcjglybfeozyrjjikk` created by the user. All four migrations and the hosted account-isolation smoke test passed. Native `workspace_get`, `artifact_save`, `artifact_get`, and `workspace_render` succeeded; the saved “Welcome to Nooks” note was read back in a separate request. All 17 Nooks tables have RLS and the private schema is excluded from the Data API. GN Reporting and other projects were not modified or deleted.

The public Vercel website still has no database environment variables: automatic approval review requires explicit permission to store the Nooks server key in Vercel. That approval is pending. Browser login also needs Auth URL/email configuration; delivery to friends requires custom SMTP. Website and native identities remain separate. These tests do not establish capacity for thousands of concurrent students.

A read-only request to `https://nooks-study-space.vercel.app/api/config` returned HTTP 200 with `backend: "unconfigured"` and all three capabilities false: account sync, community, and website generation. No remote settings or data were changed during this review.

## Bugs fixed in this pass

1. **Review history could escape its account-owned map.** Valid identifiers such as `toString` and `valueOf` were resolved through JavaScript's prototype chain. A flashcard review could mutate a shared built-in function instead of persisting under that student's material. Review maps and quiz answers now use own-property lookups. Regression tests use two accounts with identical prototype-named IDs and confirm separate, persisted histories without built-in mutation.
2. **The actual flashcard due date ignored its interval cap.** A mature card could store a 180-day interval while scheduling its next review 540 days away. The interval is now capped before both fields are calculated. Repeated-review tests verify the stored interval and timestamp agree.
3. **Revision-free replacement could overwrite newer flashcards, quizzes, and exams.** Revision preconditions were mandatory only for notes. Every existing study item now requires its loaded revision; stale and missing-revision edits fail without replacing newer work. Additive generation retries still recover the already saved result.

## Verification performed

- **117 Node tests passed**, zero failures, using Node 22: `node --test tests/*.test.mjs`. This includes engine/HTTP ownership checks, rejected forged identities, stale-edit conflicts, account switching, bounded source selection, generation persistence/retries, practice checkpoints, focus timing and reward idempotency, and creator publication safeguards.
- **All four migrations and the expanded SQL permission suite passed** in a newly created, disposable PostgreSQL cluster: `node supabase/tests/run-local.mjs`. The runner uses a private Unix socket with TCP disabled and does not connect to an existing or remote database.
- SQL checks exercise actual `anon`, `authenticated`, and `service_role` roles. They cover owner-only study data and private artwork, denied client writes/service RPCs, private roster membership, invitation limits/expiry/revocation, optimistic concurrency, account quotas, database-time focus credit, exact-nook attribution, and repeated completion.
- Added departure/archive checks verify that a private-nook member loses roster and new-channel authorization, leaving cancels shared focus credit, later personal completion cannot revive that credit, and archiving cancels active shared sessions.
- Webhook helper tests verify HMAC tampering, timestamp expiry, and body limits. SQL tests verify inbox deduplication and refusal of a reused event ID with changed content. Outbox tests verify lease ownership and prevent double claims.

Test log: `/tmp/nooks-backend-tests-2026-10-03.log` (local diagnostic output, not a deployed artifact).

## Required before a public account/community launch

1. **Finish the public website connection.** The dedicated database and native server secrets are configured. Public Vercel runtime credentials await explicit destination approval. Configure the public Auth key, redirect URLs, and email delivery for that domain; never expose the server key in a browser bundle.
2. **Test real hosted integration with two separate accounts.** Verify login, refresh/expiry, switching accounts, saving/reopening/edit conflicts, Storage ownership, private invitations, leaving/archiving, and focus completion against that project. Local adapter tests and local SQL cannot verify hosted Auth, Storage HTTP, or deployment configuration.
3. **Verify the native plugin independently.** Its Sites dispatcher must supply trusted identity; its worker must not be exposed as a generic endpoint trusting a caller-supplied identity header. Sites identity and Supabase website identity are separate unless an explicit account-linking flow is implemented. Core source sync does not update the worker's own metadata/instructions.
4. **Exercise native quotas under load.** The fourth migration is installed, and successful native account tool calls have traversed `nooks_request_limit`. Ordinary calls are verified; a hosted burst/rate-limit test has not been run.
5. **Run hosted load and recovery tests before a large rollout.** The current store reconstructs a full workspace per request and retries optimistic commits up to five times. Libraries are bounded to 16 MiB, 1,000 artifacts, and 10,000 practice/focus records, but those bounds are not a throughput guarantee. Measure latency/error rate under concurrent autosaves, focus completion, and community polling using realistic library sizes; verify backup and restore procedures.
6. **Keep website AI disabled until its billing path is chosen.** It uses a separately configured server OpenAI key, not the student's ChatGPT subscription. Account quotas and saved-result retries exist, but simultaneous requests can still invoke the model more than once before the first result commits. Add a durable in-flight generation claim and operator cost limits before enabling paid website generation at scale.

## Implemented foundations that are not deployed services

- Community currently uses authenticated polling. Realtime membership policies are tested for new authorizations; existing socket revocation and actual hosted delivery have not been verified. Do not claim a live WebSocket service based on these policies alone.
- Outbox/inbox tables and helper clients exist. There is **no deployed event dispatcher, scheduled retry worker, or public verified webhook receiver** in this repository. Define fixed destinations, minimal payloads, consumer deduplication, retention, and dead-letter handling before depending on webhooks.
- Uploaded artwork is private and content-addressed. Failed commits can leave unreferenced objects; a conservative reference-aware cleanup task is still needed.
- Public custom-art nook publishing, creator-defined reward paths, moderation/reporting, and account deletion/export are not established by this test pass. Keep unsupported features unavailable rather than implying they are production services.

## Boundaries of the evidence

Timer credit is derived from server/database elapsed time, capped to the planned duration, and excludes pauses. It measures an active timer, **not attention or learning**. Client-reported presence never awards points. No production credentials, remote migrations, deployments, or data mutations were performed by this backend review.

## Historical integration notes before the dedicated project was created

The following records earlier checkpoints and is superseded by the current verdict above.

- Restored full-width home deployed to the existing public Vercel domain; no custom chat composer or reserved right third.
- Supabase plugin permissions changed to full access at the user’s explicit request; the connector can list their projects.
- User selected the Eeshwar Parasuramuni organization. Supabase quoted $0/month, but creation was rejected because an owner/admin has reached the free-project limit. No Nooks project was created and no unrelated project was modified.
- Cloud core synchronized, current/legacy UI resources supported, fullscreen-only host metadata. Native resource reduced from ~17 MiB to ~1.6 MiB by loading public curated artwork from a fixed CSP-allowed origin. All 41 referenced image URLs returned 200/image content types. Private study data and uploaded artwork remain authenticated.
- Cloud runtime dependency audit found zero production dependency vulnerabilities. The flagged Drizzle build dependency was updated to 0.45.3; four moderate development-only transitive advisories remain in the unused legacy Drizzle tooling.
- 123 frontend/account tests passed. Account configuration retry now recovers without losing the selected account or silently switching its work to device storage.

- Private Sites deployment succeeded with MCP enabled: https://nooks-study-space.eeshwarpara.chatgpt.site (version 1, source `af3bc3a9aec15533de1a68b9cabc1ad36fe35df9`). Database env remains empty; this is installable infrastructure, not a verified production account service.

- User upgraded the selected Supabase organization to Pro; verified through the connector. New project quote changed to $10/month. Awaiting explicit recurring-cost confirmation before retrying creation.
- Nooks installation was offered from the canonical Sites plugin ID. Native installation/tool invocation is not yet confirmed. Direct service-credential MCP probes returned HTTP 401; they are not evidence of a successful host session.
