# Community ownership and artwork verification — 2026-10-04

## Source and database evidence

The community interface now reaches older nooks through bounded directory pages and a Joined filter. Owners can inspect paginated invitation metadata, revoke an invitation, and explicitly confirm archiving their nook. Archive ends membership and community credit; personal timers and earned study history remain.

The native tool contract includes `nook_archive`, `nook_invites_list`, and `nook_invite_revoke`. Read-only identities cannot invoke mutations; owner enforcement remains in the database. Invitation lists contain no code/hash. Archive retries by the owner return a no-op success after a lost response.

- 407 primary regression tests passed (178 backend + 229 UI logic), including five hook race/lifecycle tests and four HTTP/auth community tests.
- Independent judge ran all nine new community checks and 51 artwork-focused checks successfully.
- Local PostgreSQL suite passed all eight migrations, permission/isolation, hardening, community pagination/owner lifecycle, and metadata inventory fixtures.
- Migration `20261004195006_community_management_pagination.sql` SHA256 `7d50bcca386c7307f89bd2fce88ed7382d1f5294111847120fdafe2a28fd8a4e` applied to Nooks only. Hosted rollback fixture passed pagination, private isolation, invite metadata/revoke and retry-safe archive.
- Migration `20261004195615_artwork_inventory_dry_run.sql` SHA256 `6a627aa4d5b5ed536039be68131df8c3bbe29868ba032ed2760a89362bcfe1be` applied to Nooks only. Live metadata inventory returned zero objects/references; no deletion occurs. Both functions remain invoker, empty search path, service-only execution.
- Artwork metadata-only renames retain the image and appearance, including hydration failure. Invalid artwork and oversized workspace payloads fail before uploads.

## Browser evidence — simulated host, not hosted community acceptance

Used the built native UI in `scripts/native-host-harness.mjs`, a loopback host with disposable A/B accounts and 55 explicitly simulated nooks. No user data or hosted identities were changed.

Verified in one existing browser tab:
1. Directory page two reaches an older joined private nook; Joined filter lists it immediately.
2. Entering changes the active backdrop through the existing portal transition.
3. Owner controls show invitation states, including used/expired/revoked rows; page two reaches invitations 51–55.
4. Revoking invitation 51 changes its status to Revoked after the tool confirms success.
5. Archive requires a separate named confirmation, then returns to the filtered directory and removes the archived nook.
6. Clicking the background closes the community panel; the scene remains.

Screenshot: [simulated owner controls](simulated-community-owner-oct4.png).

## Limits

These checks do not establish real multi-user account journeys, native host reload persistence, real Storage image upload/read/delete, hosted restore, or production-scale load. Inventory is an operational dry run, not a deletion mechanism. Previous workload/restore artifacts cover their stated six-migration baseline; they are not relabeled as testing all eight current migrations. Public Vercel account configuration remains pending explicit credential-destination permission. Native Site access remains owner-private.

## Deployment

- Private native Site succeeded at 2026-10-04T20:09:32Z, source `b8157698e14452aecc2f69b20712bb503ab38e9a`, deployment `appgdep_6ac2b270fae0819193b0d18f619a38dc`. Native bundle `index-CqaEZQm8.js`.
- Public Vercel alias updated to deployment `nooks-study-space-kgpbujsni-eeshpara-1663s-projects.vercel.app`; bundle `index-Bmv_vswC.js` observed in browser. Existing 139-word note reopened Saved; no browser console warnings/errors.
- Cloud adapter tests 17/17 passed; total 424 tests for this round, plus SQL and browser checks.
- Authenticated native reads after deploy returned the new directory pagination fields and four saved study items without error. Hosted counts remained one account, four artifacts, zero nooks after rollback fixtures.
- Security advisors reported only six informational no-policy RLS findings on intentionally service-only tables; no new policy was added to weaken denial.
