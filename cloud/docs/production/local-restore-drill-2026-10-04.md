# Local synthetic backup and restore drill — October 4, 2026

Result: **passed** on PostgreSQL 14.20. An actual custom-format `pg_dump` and role-definition dump were restored with `pg_restore` into a second, separately initialized PostgreSQL cluster. The [machine-readable evidence](local-restore-drill-2026-10-04.json) records migration hashes, archive size and checksum, schema/data/role fingerprints, timings, and cleanup results.

The final rerun began at 19:30:55 UTC and covered all six migrations, including the focus membership serialization fix. The full local SQL permission, ownership, focus, event, quota, and hardening suite also passed with those migrations.

This proves the current Nooks SQL migrations and synthetic study data can survive a local logical backup/restore while preserving the tested ownership and permissions. It does not establish that a hosted Supabase project or its private artwork files can be recovered.

## Reproduce

From the primary repository, with Node 22+ and PostgreSQL binaries installed locally:

```sh
node supabase/tests/run-restore-drill.mjs --report docs/production/local-restore-drill-2026-10-04.json
```

`NOOKS_TEST_PG_BIN` can select the PostgreSQL binary directory. The report argument is optional. The runner accepts no database URL or connection target; it creates its own source and destination clusters. Do not run either fixture SQL file manually against a hosted project.

The clusters listen only on private Unix sockets in an owner-only temporary directory. TCP is disabled and verified. Child processes receive an explicit environment with no inherited database URLs, Supabase secrets, or PostgreSQL connection settings. Password prompts and implicit password-file reads are disabled. Local synthetic role names use trust authentication inside the private socket directory. On completion the runner stops both clusters and removes all temporary database files, role dumps, and backup archives. If stopping a cluster fails, the runner fails and preserves its directory for inspection rather than deleting a running database.

## Coverage

The source applies `bootstrap.sql` and every current numbered migration, then saves a manifest of the applied filenames and SHA-256 hashes in a test-only table. This manifest is not the hosted Supabase migration history. The bootstrap uses minimal Auth, Storage, and Realtime schema stubs.

Two synthetic auth users resolve to two Nooks accounts. Each account saves four private artifact formats: note, flashcards, quiz, and exam. Both owners intentionally reuse the same artifact IDs to exercise the account component of the keys. Fixtures also include courses, topics, note history, a plan, practice results, personal focus history, room progress, private nooks, invitation hashes, quota counters, outbox events, and a webhook receipt. Each workspace is committed twice before the dump.

The runner exports the source database with `pg_dump --format=custom` and exports global roles with `pg_dumpall --globals-only --no-role-passwords`. It imports the roles into a second cluster with a different bootstrap administrator, then uses `pg_restore --create --exit-on-error` to restore the database. Ownership and privileges are retained; neither `--no-owner` nor `--no-acl` is used. Dump or restore warnings fail the run.

Verification compares all 23 table contents before and after restore, including the complete workspace fixture and migration hash manifest. It compares role attributes and database ownership, plus the schema dump containing functions, constraints, indexes, RLS policies, grants, and object owners. PostgreSQL's own `pg_get_constraintdef(..., true)` canonicalizes redundant CHECK-clause parentheses introduced by parsing during restore; fresh psql restrict tokens are excluded from the fingerprint. Other schema SQL is retained.

Behavior checks then prove:

- Service RPCs reconstruct each saved workspace exactly and resolve the same identity links.
- Each authenticated owner reads only their account, workspace, artifacts, and private nook. Reused artifact IDs return the intended owner's contents.
- Authenticated clients cannot write artifacts, read private identity links, or call service-only workspace RPCs. Anonymous clients cannot read private artifacts or call those RPCs.
- A stale revision attempting to erase saved artifacts is rejected without changing data. A current revision updates a plan and leaves the other account unchanged.
- Owner-prefixed private artwork references survive byte-for-byte as database values.
- The production-hardening regression suite passes after restoration, including bounded outbox hints, claimed-event stability, input limits, and focus-ledger behavior.

All behavior-test mutations roll back. The runner compares the complete restored table contents again to prove the checks left the restored fixtures intact.

## Remaining recovery evidence

No hosted credentials, existing local databases, or remote services are used. No Storage object metadata or image bytes are copied. The fixture contains only owner-scoped artwork references; those references do not prove that an image is available. Supabase explicitly states that its database backups contain Storage metadata and do not include the objects themselves. A real recovery plan therefore needs separately verified private-object backup and restoration. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)

Before claiming hosted disaster recovery, exercise an approved recovery environment against the actual Supabase PostgreSQL version and managed roles, extensions, Auth and Storage schemas; verify saved study material, owner isolation, private image downloads, identity/login continuity, and any needed Realtime behavior. Record operator responsibility, backup retention and encryption, the recovery point, elapsed recovery time, and the handling of writes/events during recovery. Point-in-time recovery, scheduled backups, alert delivery, production data volume, and operational handoff are outside this drill. The tiny fixture timings in the JSON report are not a production RTO or RPO.

The backup mechanics follow PostgreSQL's documented separation between a single-database dump and global objects such as roles, with custom-format archives restored through `pg_restore`. [PostgreSQL pg_dump](https://www.postgresql.org/docs/14/app-pgdump.html), [PostgreSQL pg_restore](https://www.postgresql.org/docs/14/app-pgrestore.html)
