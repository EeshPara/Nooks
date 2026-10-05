# Nooks browser backend

The public Vercel app now packages an authenticated same-origin API in addition to the frontend. It remains usable on-device when account configuration is missing. Missing infrastructure is explicit; it never silently labels browser storage as account sync.

## Required deployment configuration

Set these in the existing Vercel project `nooks-study-space` (Production and selected preview environment):

- `SUPABASE_URL`: the selected project's HTTPS origin.
- `SUPABASE_PUBLISHABLE_KEY`: the project's publishable key, or legacy anon JWT (`SUPABASE_ANON_KEY` alias supported). This is the only key returned publicly.
- `SUPABASE_SERVICE_KEY`: server secret/service role key (`SUPABASE_SERVICE_ROLE_KEY` alias supported). Never prefix this with `VITE_`.
- `NOOKS_PUBLIC_URL`: `https://nooks-study-space.vercel.app`.
- Optional `OPENAI_API_KEY`: a server-only API key for website generation. Website API usage is separate from ChatGPT subscription usage.
- Optional `NOOKS_GENERATION_MODEL`: a Responses API model supporting structured output. Default `gpt-4.1-mini`.

Apply all four numbered SQL files in `supabase/migrations` to the chosen project. Never apply `supabase/tests/bootstrap.sql` to a real project. Configure Supabase Auth email OTP sign-in and allowed confirmation redirects for the production origin. Set the email template to include the one-time code expected by the frontend. Keep signup email verification and Auth abuse controls enabled. The migrations and account permissions must be installed before enabling the environment variables. Config presence is not a database health check.

**Inspected 2026-10-02:** the Vercel project had no environment variables configured. There was no linked Supabase project in the Nooks source checkouts. Therefore hosted account sync, real shared communities, private Storage and paid model generation have not been verified against a live project.

## Frontend contract

`GET /api/config` returns:

```json
{
  "backend": "supabase",
  "supabaseUrl": "https://PROJECT.supabase.co",
  "publishableKey": "sb_publishable_…",
  "generation": true,
  "capabilities": {"accountSync": true, "community": true, "generation": true}
}
```

Without valid server configuration, `backend` is `unconfigured`, all capabilities are false, and no keys or URL are exposed. A mistakenly supplied service credential in the publishable field also disables configuration.

After authentication through Supabase Auth, send its access token in `Authorization: Bearer …` to:

- `GET /api/workspace` — existing workspace payload, backend `supabase`.
- `POST /api/tools/TOOL_NAME` — existing tool arguments and structured result contracts, including organization, notes/revisions, practice, focus, appearance, creator drafts and community.
- `POST /api/generate` — create and save a new study artifact from intentionally selected content.

Generation body:

```json
{
  "requestId": "CLIENT-GENERATED-V4-UUID",
  "kind": "flashcards",
  "instruction": "Make 12 useful review cards",
  "source": "Current unsaved draft or selected text",
  "materialIds": ["optional-owned-saved-artifact-id"],
  "sourceArtifactIds": ["optional-owned-id-whose-current-draft-is-in-source"],
  "courseId": "optional-course-id",
  "topicId": "optional-topic-id"
}
```

Retain `requestId` when retrying an ambiguous request. The generated artifact has a stable ID and is add-only; a retry returns an already committed result. A concurrent retry can still consume an additional model request, but cannot overwrite the winning artifact or duplicate a saved item. The current limit is 20 attempts/hour/account, separate from 180 API requests/minute/account. These are initial quotas, not billing credits. Source material is capped at 60,000 characters total, eight saved items, and instruction at 4,000 characters. `sourceArtifactIds` records provenance for current draft snapshots already supplied in `source`; the server verifies these IDs belong to the account and records their saved title/revision without appending older saved content to the prompt. The union of both ID lists is limited to eight items. Unselected account content is never sent to the model. The model response is schema-constrained, validated again locally and saved through the revisioned study engine. Refusal, incomplete or invalid output saves nothing.

Errors use `{ "error": { "code": "REVISION_CONFLICT", "message": "…", "currentRevision": 2 } }` (revision is optional). Relevant statuses: 401 expired/missing sign-in, 403 permission, 404 unavailable artifact/action, 409 conflict, 413 source too large, 429 quota, 503 missing/unavailable service, 502 failed generation. Never replace a local draft with an error response. Preserve and surface conflicted edits.

## Security and persistence boundary

The API verifies each bearer token using Supabase `/auth/v1/user`. Only that verified UUID can resolve an internal Nooks account. Caller-provided actor headers or IDs cannot select an account. Stores are new per request, bound to an issued identity proof; database commits use compare-and-swap revisions. Community actions check memberships in SQL. Same-origin/Fetch-Metadata checks reject cross-site browser calls; bearer auth is still mandatory. Bodies are limited to 2 MiB. Private user data and local `.notable-data` are never packaged.

All database writes use server-only RPCs over HTTPS. RLS and revoked RPC permissions prevent browser clients from bypassing the API. Quotas are durable database rows per account/bucket, capped and reset by database time, with no user content. The early in-process token-hash guard is only a loop guard. Configure Vercel firewall protections and Supabase Auth rate limits for unauthenticated abuse; this implementation does not claim global DDoS protection.

Focus sessions now record an optional owned artifact ID, revision and title. Focus completion uses server timing, excludes pause time, is capped to target and deduplicates rewards. A nook switch keeps the original credit destination. Practice results and timer completion remain distinct events.

`npm run package:preview` produces both static files and a Node 22 Vercel function using the Build Output API. The existing native plugin transport is unchanged. No frontend dependency can read the service key. Deploy with the existing project's prebuilt deployment command after checks.

## Verification

- `node --test tests/browser-api.test.mjs tests/study-generation.test.mjs tests/supabase.test.mjs`
- `node supabase/tests/run-local.mjs` — disposable local PostgreSQL, tests RLS, ownership, invitations, DB timing, quotas and event deduplication.
- Live release gate after configuration: two real accounts, note edit/reload across devices, denied cross-account ID access, private invitation, presence expiry/rejoin, focus pause/reload/completion retry, generator refusal/error recovery, account sign-out never falls back silently to another storage layer.

The Node and SQL tests exercise real application code and PostgreSQL. Auth/Storage HTTP and OpenAI calls in automated Node tests are controlled adapters; they do not establish that a hosted project or paid API key has been provisioned.

Implementation references: [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses), [structured outputs](https://platform.openai.com/docs/guides/structured-outputs), [Supabase Auth users](https://supabase.com/docs/reference/javascript/auth-getuser), [Vercel Build Output API](https://vercel.com/docs/build-output-api/v3).

## Practice continuity

`practice_checkpoint_get {artifactId}` returns the student's current checkpoint or null. `practice_checkpoint_save {artifactId, checkpoint}` validates and saves the bounded UI position; `checkpoint:null` clears it. Positions are bound to the owned artifact's kind and revision and retain a stable practice session UUID. A changed material invalidates the old checkpoint. Card indices, quiz options/answers, stages and elapsed durations are validated against the actual material. The thirty most recent artifact positions are retained. Checkpoints never award points, time or learning results: completion uses the idempotent `progress_record` tool with the same session ID and the `artifactRevision` actually studied. Changed versions are rejected before grading, reviews, or awards change; clients must never replace a stale revision with the latest one. Legacy clients may omit the revision only if an exact owner/artifact/session/kind checkpoint still matches the current version and submitted evidence agrees with its saved answers. Already committed sessions, including pre-upgrade history, return their original result unchanged. Rejected results stay in the originating tab for download or explicit removal while later valid results can save. Deleting the artifact removes its position and raises a bounded workspace revision floor so recreating an ID cannot reuse an old revision. A stale editor cannot silently recreate a deleted item; saving a new copy must be explicit.
