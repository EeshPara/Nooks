# Nooks native integration audit

## Updated hosted status — October 3, 2026

The existing private Sites plugin is installed and connected to the user's dedicated Nooks Supabase project `lcfcjglybfeozyrjjikk`. Native tools successfully loaded an empty workspace, saved a note, read it back in a new request, and opened it by its confirmed saved ID. Four migrations and hosted permission/isolation checks passed. The current deployment identifiers are in `plugin-setup-status.json`.

Fixed native summary rendering, stale-response navigation, current MCP transport support, and two Cloudflare fetch incompatibilities. The Sites-only transport adapter accepts omitted mirrored method/name headers while retaining mandatory version/body metadata, mismatch validation, and the existing trusted identity boundary. An actual workerd test reproduced the old illegal receiver error and verified the fix. The expanded native app was visually inspected. Editing the note title showed Saving → Saved; returning to Library and reopening retained the new title. A separate native artifact_get confirmed the changed title at revision 2 in Supabase. Screenshot: `native-supabase-autosave-2026-10-03.png`. This verifies the note save/reopen path, not every feature or large-scale capacity.

The public Vercel website still uses device storage while explicit approval to store its server credential is pending. It does not automatically share the native account's library. No plans were upgraded, and no other Supabase project was modified or deleted in this setup.

## Chat-first update — October 3, 2026

Published shared model instructions and explicit navigation for Study, Library, Explore, Focus, Plan, Collection, Music, and People. Read-only plan/status tools expose bounded state; additive plan updates check revisions. Partial appearance changes preserve custom artwork. Dirty-note autosave delays navigation instead of losing the draft. Native unsaved practice previews now skip server checkpoints and awards until saved. The latest deployed unsaved flashcards were opened in the native host and displayed their card player without the earlier missing-item error.

69 focused backend checks, 127 initial UI checks, 22 follow-up preview/navigation checks, nine cloud adapter checks, TypeScript and production builds passed. Native artifact_save then workspace_render created and opened `Getting started with Nooks`; its three-card player and a successful card flip were observed in the actual host. Screenshot: `native-chat-created-deck-2026-10-03.png`. The host tool catalog in this conversation remains on its older schema, stripping the new `view` argument; therefore explicit panel navigation is not yet host-verified. Do not count local navigation tests as that missing check. See `chat-first-interaction.md` for the interaction contract.

## Historical source audit before hosted setup

Source inspection: October 3, 2026. Scope: `notable-ai` and `nooks-cloud` source, manifests, and documentation. Build outputs, account records, credentials, and private data were not inspected.

Nooks has a real MCP implementation and an existing cloud project. It is not yet possible to infer a working hosted ChatGPT connection from the local manifest or the public website. Preserve the existing identities and finish that connection.

| Surface | Verified source configuration | What remains unverified |
| --- | --- | --- |
| Local plugin | Plugin `notable-ai`, displayed as Nooks; documented marketplace `notable-development`; MCP key `notable`; endpoint `http://127.0.0.1:8787/mcp`. | Current listener/host connection. The loopback health request failed from this execution environment; that does not establish that the user's host process is stopped. |
| Private cloud checkout | Sites project `appgprj_6abf1d6c87c08191b8c6f30bc0267fe9`; MCP capability; no D1 or R2 bindings. | Project deployment URL, deployment status, installed plugin connection ID, and configured secrets must be read from the existing hosting project. |
| Public website | Documented Vercel project `nooks-study-space`, URL `https://nooks-study-space.vercel.app`; same-origin browser API packaging exists. | Current live capabilities. Documentation records no environment variables on October 2; the web lookup did not retrieve today's `/api/config`. The website is not wired as the native MCP endpoint. |

The local manifest has no `apps` mapping, and neither inspected checkout contained `.app.json`. This is a scoped finding, not proof that no cloud connection exists elsewhere in the account.

## Existing cloud route

`nooks-cloud/worker/index.mjs` implements stateless JSON MCP at `POST /mcp`, including initialization, discovery, tool calls, and UI resources. It also implements `/health`, `/api/workspace`, `/api/tools/:name`, and access-controlled appearance shares.

The Worker expects a verified `oai-authenticated-user-id` from the Sites authenticated dispatcher. It deliberately strips self-hosted OAuth security descriptors; it has no authorization or token endpoint. It must remain behind that dispatcher. A directly exposed copy would accept a caller-controlled identity header.

Every tool call currently requires a Sites identity and working Supabase configuration, including the welcome/render action. Missing configuration returns `BACKEND_NOT_CONFIGURED`; it does not fall back to a demo account. Required server configuration is `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and a stable `NOOKS_SITES_NAMESPACE` matching the existing project. The reviewed migrations must also be installed. Configuration presence alone does not prove database health.

Sites identities and website Supabase Auth identities use separate namespaces. They do not automatically share a library or link by email. Cross-surface account linking requires an explicit verified linking flow.

## Changes needed before deploying this checkout

The cloud copy predates the latest native work. It still uses the v1 UI resource; `workspace_render` lacks the saved `artifactId` path; its resource and bridge advertise inline/fullscreen rather than fullscreen only; and its UI lacks the latest host layout and editor context changes. Practice checkpoint tools are also missing.

Use the existing source sync script, then update the Worker-specific resource metadata and compatibility handling. Sync required dependencies as well: the latest UI imports `@supabase/supabase-js`, which is absent from the cloud package manifest. Preserve the source's v1 resource compatibility where applicable.

The current cloud build embeds all curated artwork in its UI resource. Documentation reports roughly 17 MiB; this audit did not rebuild or measure it. Its CSP allows the Spotify frame but no external resource or connection domains. The latest Node source supports trusted public artwork delivery, but that strategy is not wired into the cloud build. Confirm host payload/performance limits or serve public curated assets from a fixed allowlisted HTTPS origin. Keep private uploaded artwork permissioned.

Community refresh is visibility-aware polling every 20 seconds. Online status expires after 90 seconds without a heartbeat. Database membership, invitation, focus-credit, and event foundations exist; a hosted WebSocket relay, outbox scheduler, and webhook receiver are not wired here. Do not describe these as verified instant realtime delivery.

## Next concrete sequence

1. Inspect the existing Sites project and its associated plugin through supported hosting/plugin tools. Recover the actual URL and connection identity; do not create a replacement project.
2. Bring the cloud checkout up to date, check the native resource and dependency changes, and run its protocol/auth tests.
3. Connect the intended Supabase project through secure configuration, apply reviewed migrations, and verify an empty owned workspace plus denied access to another account.
4. Deploy privately through the authenticated Sites route. Validate live discovery, resource loading, a saved note, and reopening by the exact saved ID.
5. Connect or update the existing Nooks plugin mapping with the real platform-issued ID. Test inside ChatGPT: native composer → generate → save → open → edit → reload, then verify two-account community permissions.

The alternate Node MCP path has token introspection and protected-resource metadata support, but needs a separately configured OAuth provider. Its standard startup still uses the JSON store, not the Supabase adapter. The existing Sites project is the more direct route already prepared in this codebase.

Source references: local `.codex-plugin/plugin.json` and `.mcp.json`; `server/index.mjs`; `server/browser-api.mjs`; `server/supabase-auth.mjs`; `ui/src/community/useLiveNooks.ts`; `supabase/README.md`; sibling `nooks-cloud/.openai/hosting.json`, `worker/index.mjs`, `scripts/sync-core.mjs`, and `scripts/build-cloud.mjs`.
