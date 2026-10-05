# Private artwork inventory

The `nooks_artwork_inventory` SQL RPC is an operator-only, read-only observation of the `nooks-private` bucket. It measures stored metadata and known references. It neither deletes objects nor authorizes deletion. Deploying or running it does **not** close the artwork lifecycle or hosted recovery gate.

Apply all current migrations in filename order to the verified dedicated Nooks project through the normal reviewed release process. This source change alone is not evidence that the function is deployed. No other bucket or project belongs in this procedure. Do not apply the test bootstrap or fixture files to a hosted project.

An operator with the existing service role can take a bounded observation in the trusted SQL environment:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
SET LOCAL lock_timeout = '1s';
SELECT public.nooks_artwork_inventory(50, NULL);
ROLLBACK;
```

The function has no browser, model-tool, public health, scheduler or webhook route. `anon` and `authenticated` cannot execute it. It uses `SECURITY INVOKER` with an empty search path and runs as a stable read-only function. The caller must set the statement timeout; the row limit bounds returned metadata, not the aggregate scan. If the timeout expires, report the incomplete observation instead of retrying aggressively or claiming zero objects.

The result reports `mode: dry_run`, `metadataOnly: true`, `deletionSafe: false`, and `inFlightUploadsTracked: false`. Counts include total objects, known bytes, objects with unknown byte sizes, references by source, missing referenced paths, malformed references/containers, quarantined owners and paths, and apparently unreferenced objects/bytes. Unknown sizes are counted separately; `knownObjectBytes` is a lower bound when that count is nonzero. Object counts describe Storage metadata rows; missing metadata is different from unavailable or corrupt image bytes.

The `candidates` page contains only `{path, status}`. A path is returned only when it exactly matches the canonical `<account-uuid>/<sha256>` legacy format or the immutable `<account-uuid>/<sha256>/<generation-uuid>` format. Arbitrary malformed object names or reference text are counted without being echoed. Paths still contain account identifiers and belong only in restricted operator output. Store aggregate counts and coarse timestamps in ordinary monitoring; do not log path pages, account IDs, snapshots, signed URLs or image data.

Use `nextAfter` from a page as the second argument to fetch the next page. `hasMore` is false and `nextAfter` is null at the end. The maximum page size is 50. Each call measures current data; concurrent uploads or saves can change counts and later pages. For a single coherent multi-page observation, use a short `REPEATABLE READ, READ ONLY` transaction with the same time limits and promptly roll it back. Avoid leaving an operator transaction open while inspecting results.

Known references are the current workspace appearance, every private creator draft appearance, and every retained `nooks_shares` snapshot appearance. A share remains a reference when its original draft or active background changes. The scanner does not recursively inspect note or other study content. An invalid appearance/container/reference quarantines its owner; a canonical cross-owner reference also quarantines the target owner. A missing account, duplicate object metadata or unknown byte size is quarantined. Malformed object names are omitted from path pages. These cases require investigation before any future cleanup process.

Statuses:

| Status | Meaning |
| --- | --- |
| `referenced` | A valid known reference and matching object metadata exist. No image download was tested. |
| `missing_metadata` | A valid owned reference has no matching metadata row. Preserve the reference and investigate availability. |
| `unreferenced_at_snapshot` | No known persisted reference was visible at this snapshot. An upload or save may be in flight; deletion is unsafe. |
| `quarantined_reference` | A malformed or foreign reference/container affects the owner scope. |
| `quarantined_unknown_owner` | The canonical path's owner does not exist in the account table. |
| `quarantined_metadata` | Duplicate object metadata or an unknown/invalid byte size prevents ordinary classification. |

This inventory enforces no retention duration and does not inspect upload pins or lifecycle fences. The separate [generation lifecycle](artwork-lifecycle.md) now supplies reservations, reference protection and explicit cleanup claims with a default 30-day retention. Use that protocol for generation cleanup; never treat an inventory row as a deletion authorization. Legacy owner/hash paths remain noncollectible. Two scans separated by a grace period are not a proof that an object is safe to delete. Deployment, operator cadence and hosted proof remain separate gates.

Objects must eventually be removed through the Storage API, never by deleting `storage.objects` metadata with SQL. Supabase documents that metadata deletion leaves the underlying object behind. [Storage schema](https://supabase.com/docs/guides/storage/schema/design), [object deletion](https://supabase.com/docs/guides/storage/management/delete-objects)

Local verification uses `supabase/tests/artwork-inventory.sql` in the disposable SQL runner. It creates only synthetic metadata, exercises owner/draft/share/missing/quarantined paths, malformed values, unrelated-bucket exclusion, pagination, exact output keys, client-role denial and unchanged data, then rolls back. This does not exercise hosted Storage HTTP, image-byte recovery, a cleanup scheduler, alert delivery or an operator's real recovery process.
