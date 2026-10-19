# Hosted integration verification

`verify-hosted.mjs` tests the real `web/server/browser-api.mjs` handler over loopback HTTP against the existing Nooks Supabase project `lcfcjglybfeozyrjjikk`. It uses two independently authenticated real Auth users and distinct account mappings. It is not browser UI, public Vercel routing, email delivery, or a many-user capacity sign-off.

Use Node 22. The script retrieves project keys from the signed-in Supabase CLI directly into process memory; it never prints or writes credentials, passwords, invitation secrets, or JWTs. Fixtures use explicitly confirmed `example.invalid` email addresses through the Auth admin endpoint (no email sends). Run only with authorization for hosted fixtures.

```sh
node creative/nooks-release/hosted/verify-hosted.mjs --run --realtime
```

Without `--run`, it prints usage and performs no hosted work. `--realtime` requires the reviewed realtime migration to be deployed. The baseline covers account isolation, Data API RLS, competing note edits, private access, retry-safe room creation and invitations, live delivery and denial, presence without credit, leave revocation, public membership, a real one-minute focus session and retry-safe credit, and archive revocation. Owner removal of an individual member is not currently an exposed community action; leave and archive are the supported revocation paths tested.

Supabase's transport adds an `id` UUID to the authored `{v:1}` broadcast payload. The test allows only those fields. Former subscribers may receive content-free hints until authorization refresh; authoritative reads must deny them immediately, and a fresh subscription must be denied. See [Realtime protocol](https://supabase.com/docs/guides/realtime/protocol) and [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

Every run writes a timestamped JSON report with individual checks and exact nonsecret fixture IDs. Cleanup deletes only rooms created by that execution, account IDs mapped from its created Auth users, and those Auth users. Account cleanup cascades owned artifacts, focus history, and memberships. The private realtime throttle table has no fixture foreign key and may retain harmless topic timestamps for those IDs; an operator can delete only the exact `account:<id>` and `nook:<id>` topics listed in a report if desired. No existing owner data is read or deleted by cleanup.

## Bounded connection test

Do not run until the project's quota and current health have been checked and the maximum approved. A load run creates independent WebSocket clients using one fixture member JWT, so its evidence is **connection fanout**, not independently authenticated concurrent students or realistic API write throughput. There is no automatic progression to higher tiers, quota change, or upgrade.

```sh
node creative/nooks-release/hosted/verify-hosted.mjs --run --realtime --load=100 --approved-max=100
```

Supported requested bounds: 100, 250, 500, 1000. Connections open in batches of ten with spacing; the ramp stops on the first failed batch, then cleanup runs. The run verifies all accepted connections receive a content-free invalidation. Default Pro quotas may make 500/1000 inappropriate; an unrun larger bound is not a capacity claim.
