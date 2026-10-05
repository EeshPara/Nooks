# Hosted database smoke test — 3 October 2026

Prepared script: `supabase/tests/hosted-smoke.sql`.

Run the complete file in a single Supabase `execute_sql` call as the database administrator **after the four numbered migrations**. It ends with `ROLLBACK`. Do not execute the local `bootstrap.sql` on Supabase. If an SQL client stops at a failed assertion while retaining its connection, explicitly roll back that aborted transaction before reusing the connection.

The script creates two unique Sites test identities, notes with identical IDs, a private nook, and an invitation inside one transaction. It checks account separation, revision conflicts, owner-only invitations, invite retry idempotency, access before/after joining and leaving, actual service-role execution, and denial of service RPCs to `authenticated` and `anon`. It also checks RLS and the expected managed Storage/Realtime policies. Generated outbox rows remain uncommitted and disappear with the rollback.

There are no Auth user inserts, persistent test accounts, schema changes, psql commands, external API calls, or extensions required by the test.

## Verified locally

The disposable PostgreSQL runner applied all four migrations, passed the existing permission suite, then passed the new smoke script on 3 October 2026. `node supabase/tests/run-local.mjs` now includes both suites. The runner uses a fresh Unix-socket-only local cluster and removes it afterward; it does not use a remote database URL.

## Verified on the dedicated hosted project

The same script also passed against the user's dedicated **Nooks** project, `lcfcjglybfeozyrjjikk`, on PostgreSQL 17.11 at approximately 02:27 UTC on 4 October 2026 (3 October locally). The private bucket was created through Storage API first. No other project was modified.

Hosted migration history:

| Hosted version | Migration | Reviewed source |
| --- | --- | --- |
| 20261004022616 | nooks_production | 202610010001_nooks_production.sql |
| 20261004022625 | nooks_community | 202610010002_nooks_community.sql |
| 20261004022632 | nooks_events | 202610010003_nooks_events.sql |
| 20261004022641 | nooks_browser_api | 202610020001_nooks_browser_api.sql |

Post-test metadata confirmed zero smoke identity records remained, all 17 Nooks tables had RLS enabled, neither client role could execute a service RPC, anonymous users had no `nooks_private` schema usage, and all three expected Storage/Realtime policies existed. The private bucket retained the exact upload restrictions.

Supabase advisors reported no warning- or error-level findings. Six security information notices concern intentional deny-all RLS on service-only tables; adding client policies just to remove those notices would weaken the design. Performance information notices identify seven foreign keys without covering indexes, an unused newly created outbox index, and the pre-existing absolute Auth connection allocation. These are not evidence of a crash or hosted-load validation. Relevant advisor references: [service-only RLS notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [Auth connection allocation](https://supabase.com/docs/guides/deployment/going-into-prod).

## Compatibility review

- **Realtime:** migration 2 only creates RLS policies on `realtime.messages`; its helper functions live in `nooks_private`. This matches the explicit exception in Supabase's [July 2026 Realtime lockdown](https://supabase.com/changelog/realtime-schema-locked-down-against-modification). No modification of managed Realtime tables or functions is needed. The smoke script fails clearly if either policy was skipped because the managed table was absent.
- **Storage:** the bucket columns and policy used by migration 1 match the [documented Storage schema](https://supabase.com/docs/guides/storage/schema/design). Following its API-first guidance, root created `nooks-private` through the official Storage API with `public: false`, `file_size_limit: 1048576`, and MIME types `image/png`, `image/jpeg`, `image/webp` before migration. Migration 1's existing conflict branch preserved that matching configuration; post-migration SQL verified it again. No Storage object metadata was written by the smoke test.
- **Roles and API grants:** migrations explicitly grant table access and RPC execution to `service_role`, read access with RLS to `authenticated`, and revoke client execution of service RPCs. They do not depend on legacy automatic public-schema grants. This is compatible in design with the [new Supabase grant defaults](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). Actual grants are checked by the script.
- **Private helpers:** keep `nooks_private` out of the Data API's exposed schemas. Helpers accept internal IDs for policy evaluation and must not become a general external RPC surface. Inspect the new project's exposed schemas and ensure no unrelated permissive Storage/Realtime policies broaden access.

All four migrations and the rollback smoke test succeeded on the dedicated hosted project; no SQL compatibility failure occurred. An HTTP request using the public key and `Accept-Profile: nooks_private` returned `PGRST106`, listing only `public` and `graphql_public` as exposed schemas. The private schema is excluded. Native MCP saving and reopening a note also passed against this database. Hosted browser Auth and a real private Storage upload remain separate checks.

## Foreign-key index follow-up

No indexes were added in this pass. The seven advisor findings concern child-side foreign-key indexes. Parent key checks during normal inserts already use the parent primary keys. The current RPC queries were inspected; none of these missing indexes is established as the cause of an interactive crash or slow request.

| Missing leading-column index | Current query behavior | Where the index would help |
| --- | --- | --- |
| `nooks_identity_links(account_id)` | Identity resolution filters `namespace, subject_hash`, covered by its primary key. | Account deletion cascade and future identity-link management by account. |
| `nooks_invite_uses(account_id)` | Invite retry lookup filters `invite_id, account_id`, covered by its primary key. | Account deletion cascade and future per-account invite history. |
| `nooks_invites(created_by)` | Current invite reads use the unique token hash or invite primary key, not creator-only lookup. | Checking references during creator account deletion; an index does not resolve the deletion policy itself. |
| `nooks_invites(nook_id)` | Revocation also supplies invite ID, so the primary key finds one row; acceptance uses unique token hash. | Nook deletion cascade or a future invitation-management list for a nook. |
| `nooks_outbox(account_id)` | Dispatch uses the existing pending-event index; acknowledgment uses event ID. | Account deletion cascade/event cleanup. Higher future importance because each workspace commit adds an event and retention is not implemented. |
| `nooks_outbox(nook_id)` | Dispatch does not filter by nook; archiving updates membership/focus and does not delete the parent. | Future hard deletion of a nook and targeted event cleanup. |
| `nooks_shares(account_id)` | Share read/revoke uses the share primary key; revocation also verifies ownership. | Account deletion cascade or a future list/export of an account's shares. |

Before enabling account deletion at scale, design the deletion/retention flow and add the child indexes that support it in a reviewed migration. Do not remove the new outbox pending index merely because the advisor has not observed its use yet. Hosted traffic and load tests are still required to assess interactive query performance.

## Evidence boundaries

Sites identities have no Supabase Auth user UUID. This script therefore proves service-RPC account containment and fail-closed RLS for an unmapped JWT; it does **not** prove that the Sites dispatcher supplies genuine identities, that browser Auth login/refresh works, or that two mapped Auth users can read only their own data. Those require a separate test with two real accounts after deployment.

The Storage policy check does not upload/download a real object. Realtime checks do not establish delivery or immediate removal of existing sockets after membership revocation. The test does not exercise load, payment, image generation, or webhook delivery.
