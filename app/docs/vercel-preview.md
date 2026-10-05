# Nooks web app on Vercel

Public URL: https://nooks-study-space.vercel.app

Project: `nooks-study-space`, scope `eeshpara-1663s-projects`.

## Deploy an update

Use Node 22.12 or later, with Vercel CLI signed in to the project owner’s account.

```sh
npm run deploy:preview
```

The [guarded release command](production/public-deploy.md) builds, validates the exact existing destination and package contents, then uses Vercel’s prebuilt deployment mode.

The packaging script produces compiled static assets **and an isolated Node 22 browser API function** via Vercel's Build Output API. It copies only the server modules and their fixed reward catalog into the function bundle. It does not copy `.notable-data`, environment files, credentials, private account data or test workspaces. Server source is not publicly served. The normal `npm run build` and local/native MCP transport remain separate.

## Device mode and account mode

With no backend configuration, visitors can write autosaved rich notes, manually create cards/quizzes, practice, track focus, collect rewards, change nooks, use Spotify playlist/album/song embeds and ambient sounds, and save private nook drafts. Data stays in that browser's IndexedDB. Different profiles and devices have separate libraries. It is not account sync or a cloud backup. Explicit revision checks and atomic compare-and-swap transactions prevent stale tabs silently overwriting notes. Storage failures preserve the previously committed workspace and surface an error.

`GET /api/config` now returns HTTP 200 and an explicit `backend: "unconfigured"` state when the service is not connected. Protected actions return a structured 503 instead of a static 404. The UI must keep device and account modes visibly distinct and never silently fall back to device storage after an account operation fails.

After the operator provisions the [Supabase backend](production/browser-backend.md), config supplies only the Supabase public URL/publishable key. Signed-in browser requests carry a verified access token to the same-origin API. The existing study engine then persists notes, revision history, practice checkpoints/results, focus sessions, personal collections, organizational context and creator drafts to that account. Membership, invitations, presence polling and rankings use real database records. Browsing a backdrop alone does not publish a profile or fabricate occupants.

The new service transports are implemented and tested, but **live account features require a configured Supabase project, all numbered migrations, email Auth settings and server environment variables**. The Vercel project inspected on 2026-10-02 had no environment variables. No hosted Supabase integration has therefore been verified yet.

## Generation

One composer accepts typed/pasted material, selected passages/current drafts or intentionally selected library items. Manual writing is available without AI setup. Inside ChatGPT, the existing plugin uses the supported host flow. Outside ChatGPT, users can copy a scoped prompt for ChatGPT until a server AI key is configured.

Optional `OPENAI_API_KEY` enables actual website generation via `/api/generate`: output is constrained and validated, then saved as a new artifact through the account engine. It is separately billed API usage, **not ChatGPT subscription usage**. The server limits inputs, output tokens and per-account generation attempts. A stable request ID prevents duplicate saved material after network retries. No key is included in browser assets. See the full [API and deployment contract](production/browser-backend.md).

Curated public/private nook creation has a backend path once Supabase is connected. Publishing uploaded/generated custom artwork remains intentionally unavailable until community-owned artwork storage and access checks are implemented. WebSocket presence delivery and shared synchronized focus rounds are not claimed by the current polling implementation.

## Verification

Before deploying, run the backend and relevant frontend tests, build the app, and import the packaged function once to catch missing dependencies. Check anonymous homepage access, config response, save/reload a note, separate-browser isolation, mobile overflow, popup dismissal and persistent audio.

Once Supabase is configured, additionally verify two real accounts, signed-in reload and cross-device persistence, cross-account ID denial, private invitation/revocation, presence expiry, focus pause/completion retry, generated material persistence and recovery from expired sign-in. Local controlled-adapter tests do not replace these hosted checks. Do not expose the loopback demo server to simulate a production backend.
