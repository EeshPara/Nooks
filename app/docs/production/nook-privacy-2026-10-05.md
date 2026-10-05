# Nook privacy and invitation links — 5 October 2026

Database migration applied to the dedicated Nooks project on 2026-10-05, recorded as `20261005224928_nook_visibility`. Matching source is prepared; app deployments are not completed yet.

The service-bound `nook_visibility_update` tool calls `nooks_set_visibility` with the verified account. The RPC validates public/private, requires the active owner of an unarchived nook, and locks the room using the same ordering as existing membership mutations. Repeating the same visibility is safe. Existing members remain; the existing directory and join checks exclude unjoined private rooms and require valid invitations.

The community heading now shows nook name, public/private pill and current online people count. Only owners can toggle privacy. Private owners have an Invite button on the People/Leaderboard row. Invitations retain the existing 24-hour, one-use policy and revocation support. Copy produces a link with its token in the fragment. Opening the link requires account connection and explicit acceptance; legacy codes remain supported. The local designer community is labeled sample activity and cannot change real privacy.

Validation: 15 backend adapter/integration tests; 16 invitation and live-hook tests; app and cloud migration chains plus community-management and privacy SQL checks in isolated PGlite PostgreSQL; web/app/cloud TypeScript checks and designer build passed. This does not establish hosted two-account behavior or real concurrent transaction behavior.

Release sequence: apply `20261005222042_nook_visibility.sql` to the dedicated Nooks database, then deploy the matching server/UI sources for the intended surface. Verify with two controlled accounts that non-owners cannot toggle privacy, uninvited private joins fail, copied links admit the intended recipient and exhausted/expired/revoked links fail. Do not deploy the unrelated pending development snapshot as part of this feature.

## Hosted migration evidence

The RPC is SECURITY INVOKER with an empty search path. Direct execution is denied to anon/authenticated and allowed only to service_role. Hosted synthetic rollback checks passed for owner/non-owner changes, invalid visibility, discovery exclusion, denied private joins, retained members, invitation acceptance and archived-room denial. No synthetic test accounts or rooms were retained. Security advisors report only the existing service-only tables with RLS and no client policies; no new privacy-function warning was returned.

Public deployment guard tests: 22 passed. Public bundle and API packaging passed the existing target and asset guard. Vercel login is pending in the workspace-specific CLI config. The existing public `/api/config` reports unconfigured account/community; it requires server-only Supabase configuration before claiming live browser communities. Native cloud build and tests are checked separately; the required Sites source workflow input was rejected by automatic approval review (`approval required`, unavailable `sandbox_approval`), before restoring/pushing source or publishing. No website release has succeeded in this turn.
