# Nooks private ChatGPT plugin

The hosted Worker is deployed owner-private with Sites-owned authentication and the dedicated Nooks Supabase database. The current release supports controlled owner/developer testing; it has not been approved for a student pilot or public launch. See `docs/release-judge-oct4.md` and `docs/production/implementation-status.md` for evidence and remaining gates. It fails closed when database configuration is missing; it never creates a substitute local account or returns sample community members.

Source implementation is maintained in `../notable-ai`; run `node scripts/sync-core.mjs` to copy UI and source modules only. This excludes local account data, credentials and private files. The Worker build adapts Node source helpers for the portable Web runtime. `npm run build` writes `dist/client` and `dist/server/index.js`.

Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and stable `NOOKS_SITES_NAMESPACE=sites:appgprj_6abf1d6c87c08191b8c6f30bc0267fe9`. Apply the reviewed Supabase migrations from the source project before enabling access. No credential belongs in the UI, tool arguments, or source control. Identity headers are trusted only behind the Sites authenticated dispatcher; do not expose this Worker directly.

MCP tools cover private materials, organization, bounded continuity context, human and reviewed AI note edits, focus/progress, real community rosters, expiring invitations, private creator drafts and explicitly reviewed curated-nook publication. Custom artwork is saved privately; shared custom-art publishing remains blocked until its asset authorization and moderation pipeline are implemented. ChatGPT image generation requires an explicit user image selection/upload handoff.

`node --test tests/cloud.test.mjs` checks discovery, authentication, missing-configuration behavior and native UI resource metadata. These checks do not verify installed ChatGPT rendering or a hosted Supabase deployment.

The native resource is about 1.6 MiB after moving curated artwork to the fixed public origin `https://nooks-study-space.vercel.app`. CSP allows that origin only for resources. User-uploaded artwork and saved study data stay behind authenticated tools. All referenced public artwork URLs are verified separately. Actual native first-open performance still requires host testing.

Every account operation checks the durable `nooks_request_limit` RPC (180 requests per minute per verified account), including MCP calls and REST share reads. All six current migrations have been applied to the dedicated Nooks project; apply the full ordered migration set when creating an isolated environment. Database failures fail closed; `/health` configuration presence is not a database readiness probe.

`node --test tests/*.test.mjs` covers discovery, authentication denial, current/legacy UI resources, quotas, quota outages, and account isolation in the hosted request adapter. These use controlled HTTP responses and do not substitute for two real accounts against the deployed database.

The original D1/R2 prototype files remain unused. The hosting manifest requests no D1 or R2 bindings; production persistence is Supabase only. Deploy privately using the supported Sites workflow after configuration and runtime verification.
