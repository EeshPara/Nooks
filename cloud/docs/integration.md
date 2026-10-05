# Nooks ChatGPT integration

The local preview and MCP integration use the same study engine. ChatGPT prepares educational content in its conversation and supplies complete structured artifacts to Nooks. This server makes no AI/API calls and requires no OpenAI API key. Lecture recording is deferred.

## Local preview

Build with `npm run build`, start `node server/index.mjs --demo`, and open `http://127.0.0.1:8787`. Vite may proxy `/api` to port 8787. Run `npm test` for storage, ownership, grading, timer, OAuth-boundary and MCP HTTP checks.

Demo is explicitly opt-in and loopback-bound. Its isolated `notable-local-demo` workspace persists in `.notable-data/` across refreshes. Do not deploy with `--demo`. REST preview endpoints are disabled without that flag. Add `.notable-data/` to version-control exclusions.

## Data and tools

MCP Streamable HTTP uses `POST /mcp` with stateless JSON responses. Tools work without UI. Only `workspace_render` declares a widget resource, avoiding iframe rerenders during data operations. Resource `ui://notable/workspace-v1.html` embeds compiled scripts/styles and fonts. Local demo images are embedded once in a shared asset map, requiring no external connections. Increment its URI for a breaking widget release.

In production, setting `NOTABLE_MCP_PUBLIC_URL` to the real HTTPS endpoint switches bundled images to URLs on that exact configured origin, and the resource CSP lists only that origin. This keeps the HTML payload small as the nook catalog grows. The server serves the corresponding public build files with normal browser caching; cross-origin image reads are allowed without opening the authenticated API or MCP endpoints. No tool argument can override the origin, and only files in the trusted build registry are rewritten. Keep fonts inline to avoid unnecessary font CORS dependencies. Public URL credentials, queries and fragments are rejected. The local demo ignores public URL settings and remains fully self-contained.

| Tool | Input | Behavior |
| --- | --- | --- |
| `workspace_get` | `{}` | Connected workspace; anonymous sample preview |
| `workspace_render` | `{artifact?}` | Dashboard and optional unsaved generated content |
| `artifact_save` | `{artifact}` | Create/update complete study artifact |
| `artifact_delete` | `{artifactId}` | Delete only within the verified account |
| `progress_record` | `{artifactId,artifactRevision,sessionId,kind?,roomId?,answers?,cardRatings?,matches?,durationSeconds?}` | Grade evidence only against the version studied; save progress and award bounded XP. Legacy omission requires an exact matching saved checkpoint. |
| `room_reward_place` | `{roomId,rewardId,placed:boolean}` | Equip/remove a catalog reward after its real-time unlock; maximum three per nook |
| `focus_start` | `{minutes?,subject?}` | Start/return active server-issued timer |
| `focus_update` | `{sessionId,action:"pause"|"resume"|"cancel"}` | Exclude paused time or end a session |
| `focus_complete` | `{sessionId}` | Credit real active seconds once; XP after planned active minutes |
| `plan_save` | `{plan:{tasks:[{id?,title,subject?,done?,dueDate?}]}}` | Replace saved study tasks |
| `space_customize` | `{space:{name,tagline,theme,room?,accent,companion,layout,decorations,backgroundImage?}}` | Save private appearance; never publishes |
| `space_share` | `{includeProgress?:boolean,description?:string}` | Explicit read-only appearance snapshot |
| `space_unshare` | `{shareId}` | Owner-only link revocation |

Successful tools return `structuredContent:{authenticated,mode,workspace,...}`. Mutations also return `artifact`, `progressEvent`, `focusSession`, or `plan`. The UI bridge flattens this structure. Workspace contains `artifacts`, `progress`, per-card `reviews`, `focusSessions`, `roomProgress`, `plan:{tasks}`, `stats:{xp,level,streak,focusMinutes}`, `version`, and `updatedAt`.

Personalization also returns `space` and `workspace.space`. Themes are `botanical|moonlight|sunrise|lavender|sky`; nook choices are `rainy-library|midnight-train|sakura-garden|seaside-studio|alpine-cabin|autumn-bookshop|moonlit-observatory|sunlit-greenhouse|neon-tokyo|paris-attic|kyoto-teahouse|brooklyn-loft|cloud-bedroom|oxford-library|lighthouse-study|tropical-veranda|mossy-watermill|aurora-cabin|autumn-camper|ricefield-porch|lakeside-boathouse|castle-study|desert-casita|underwater-study|floating-airship|moon-base|woodland-treehouse|lavender-cottage|canal-apartment|night-campus|mosslight-dungeon`. Companions are `sleepy-dog|sprout|cat|none|bunny|fox|capybara|red-panda|owl|turtle|bear|ghost`; layouts `calm|focused`; decorations contain `sparkles|stickers`; accents use the UI's five predefined hex colors. New spaces default to the rainy library. Existing records without a nook keep their theme-based nook fallback until the student chooses a nook, including when shared.

PNG, JPEG and WebP data URLs under 1MB are checked for matching magic bytes; SVG is rejected. `space_share` returns `share:{id,url,createdAt,space,description,roomDisplay?,stats?}`. `GET /api/shared/:id` reads that public snapshot; revoked/unknown links return 404. Study content, artifact titles and identity never enter a snapshot. Progress is absent by default and contains only aggregate xp/level/streak/focusMinutes after explicit opt-in. Background images are appearance and are included: disclose that before sharing. Local link URLs refer to 127.0.0.1 and work only on the same machine until hosting is configured. Shares are snapshots; later nook edits do not update an older link.

MCP results omit background data URLs from model-visible `structuredContent` and send full UI data through `_meta.notableData`, which the browser bridge merges. Decorative pixels therefore do not consume the model's conversational token context. REST preview and public appearance snapshots retain the chosen image.

Artifacts use `kind:"note"|"quiz"|"exam"|"flashcards"`, `title`, `subject`, `color`, optional `id`, `favorite`, `description`, and `source`. Notes contain Markdown `content`. Cards contain `{id?,front,back,hint?}`. Questions contain `{id?,prompt,options?,correctIndex?,answer?,acceptedAnswers?,explanation?}`. Multiple choice uses zero-based `correctIndex`; short answers need accepted answer text. Server sets timestamps and validates lengths, IDs, keys and bounds.

Question answers are keyed by question ID. Flashcard ratings are keyed by card ID and use `again|hard|good|easy`. Matching evidence contains `{cardId,front,back}`. Client `score`, `total`, and `xp` are ignored. An artifact/mode awards once per UTC day; retries with the same `sessionId` are idempotent. Focus points use server active elapsed time and exclude pauses. Confidence is self-reported, not an exam-security guarantee.

Each `workspace.roomProgress[roomId]` stores `{focusSeconds,sessions,practices,placed:string[]}`. Nook focus time uses integer active seconds, capped to the planned duration; ending early credits elapsed seconds but gives no completion XP. Pausing excludes elapsed pause time. Cancelling discards that session's nook credit. The server captures the nook at `focus_start`, so changing backgrounds mid-session cannot redirect time. Custom uploaded artwork uses a separate `custom` track. Practice events store the `roomId` captured when practice began and increment completed practices once per valid session ID. Omitted nook IDs fall back to the current nook for legacy clients. Practice durations and client score/XP do not add focus time.

The shared `ui/src/world/room-rewards.json` catalog contains four milestones per track at 15, 45, 90 and 180 credited minutes. The server validates the exact nook/reward pair and time threshold before placing a reward; tool arguments cannot grant progress or unlocks. At most three rewards may be placed in each nook, and placing/removing the same item repeatedly is idempotent. Reward perks describe cosmetic soundtrack/hidden-nook unlocks; secret hidden nooks stay on their parent nook's progression track. Public snapshots may include only the current nook’s validated equipped reward IDs as `roomDisplay:{roomId,placed:string[]}`. Focus seconds, sessions, practices and other nooks remain private. Copying shared nook appearance grants no reward ownership or progress.

Older completed focus and practice records are not assigned retroactive nook credit. An active legacy focus session binds to its current nook during its first workspace hydration, persisted as a server-owned schema migration even for a read-only connection. An elapsed-time offset excludes all pre-migration seconds from nook rewards while preserving existing global history. No timer or practice metric measures attention, model tokens, or usage of ChatGPT itself.

## Authentication

Production anonymous access is read-only. Account IDs and identity headers are never trusted. Durable records are selected exclusively by verified OAuth identity. Signup and paid upgrades are not implemented.

To wire a real provider, configure:

```text
NOTABLE_MCP_PUBLIC_URL=https://your-server.example/mcp
NOTABLE_OAUTH_ISSUER=https://your-oauth-provider.example
NOTABLE_TOKEN_INTROSPECTION_URL=https://your-oauth-provider.example/introspect
NOTABLE_OAUTH_CLIENT_ID=<server-side client>
NOTABLE_OAUTH_CLIENT_SECRET=<server-side secret>
NOTABLE_DATA_DIRECTORY=<private durable directory>
```

Introspection must return an active token with `sub`, configured `iss`, matching `aud`, unexpired `exp`, and `scope` containing `notable.read` plus `notable.write` for mutations. With complete configuration, server publishes protected-resource metadata and MCP auth challenges. Configure OAuth registration, authorization-code/PKCE, consent, and issuance in your identity provider; those are not implemented here. Secrets never belong in the browser or manifest.

Storage uses atomic JSON with hashed account filenames, restrictive permissions, and serialized per-account writes inside one process. It fits the local prototype or single-process deployment with durable storage. Multi-worker launch requires a transactional database, backups, migrations, monitoring, privacy/deletion workflows and shared rate limits.

## Connecting and publishing

Nooks is the current product name. Internal plugin ID `notable-ai@notable-development`, MCP server key `notable`, resource URI, OAuth scopes, environment variables, storage directory and browser preference keys retain their existing names to keep installed connections and saved study data compatible. The local marketplace displays **Nooks Development**. Rebranding does not create a second installed plugin or migrate private records.

The compatibility manifest and `.mcp.json` wire a local endpoint. They do not publish or register an online ChatGPT app. The local desktop development plugin is now installed and enabled as `notable-ai@notable-development` through the supported desktop-bundled CLI. Its installed package is in `~/.codex/plugins/cache/notable-development/notable-ai/0.1.0`. The personal marketplace is `~/.agents/plugins/marketplace.json`, rooted at the user's home with source path `./plugins/notable-ai`. CLI installation status is verified; native visual rendering still needs host verification. Reload the Plugins Directory or start a new chat; if discovery is cached, restart the app after active work ends.

For online use, deploy HTTPS and configure OAuth. Enable developer mode under ChatGPT Settings → Security and login, add a connection through the Plugins Directory's plus button, then obtain the technical `plugin_asdk_app...` connection ID. Only then create `.app.json` with that real mapping and reference it through the manifest `apps` field. Do not invent an ID or treat a local marketplace as public distribution. Legal URLs, submission screenshots and live OAuth provider wiring remain launch work. Do not publicly tunnel the localhost demo; its single local identity is for this machine only.

The supported local marketplace shape is:

```json
{
  "name": "notable-development",
  "interface": { "displayName": "Nooks Development" },
  "plugins": [{
    "name": "notable-ai",
    "source": { "source": "local", "path": "./plugins/notable-ai" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Education"
  }]
}
```

`codex plugin marketplace add <marketplace-root>` registers it; `codex plugin add notable-ai@notable-development` installs it. `codex plugin list --marketplace notable-development --json` verifies installed/enabled state. Reinstall after manifest, skills, or wiring changes; frontend assets are served by the running backend from the build directory. Refresh MCP discovery after changing server tool/resource metadata.

The local CLI was observed copying `.notable-data` into its cache even though that directory is in `.gitignore`. No plugin-specific exclude configuration has been verified. Every direct development-source reinstall must therefore audit the installed package for `.notable-data`, `.env` files, test output, and other private or transient records. Preserve the original workspace; move only an unwanted cached mirror into a private temporary quarantine if it was copied. The current cache was audited and its copied data mirror quarantined, with original storage preserved. For distribution, prepare a clean allowlist package containing only the manifest, MCP wiring, skills, approved branding assets and required documentation; do not publish this development working directory. A version-control ignore file alone does not make the plugin package safe.

The current task's tool catalog was assembled before installation and does not expose Nooks's new native tools yet. CLI installation and metadata checks therefore do not prove native rendering. Test after the desktop host refreshes its plugin discovery. Starting an unrelated CLI agent or thread would not verify this task's native view. The package uses the sleeping cat Nooks mark for the official `interface.composerIcon` and `interface.logo` fields; the sidebar tool icon remains a theme-aware monochrome SVG as the extension spec recommends.

## Optional Spotify player

A student can choose to load Spotify’s official embedded player by pasting a supported `open.spotify.com` track, album or playlist link. The player provides Spotify-controlled playback alongside study tools; the embedded experience is needed to retain Spotify’s own controls and media handling rather than proxying or scraping music. Spotify controls `https://open.spotify.com`. Loading a link is explicit user opt-in, not a Nooks-to-Spotify account connection. Nooks receives no Spotify account credentials, access tokens or library permissions from the embed, and this backend implements no Spotify account OAuth.

The resource declares only `https://open.spotify.com` in both `_meta.ui.csp.frameDomains` and the legacy `_meta["openai/widgetCSP"].frame_domains`. Parent-widget `connectDomains` remains empty, and asset origins remain unchanged. Network requests inside Spotify’s nested frame follow its own policy; no additional Spotify resource/API domains are granted to the Nooks widget. [Official OpenAI security guidance](https://developers.openai.com/plugins/guides/security-privacy).

This purpose, domain ownership and data boundary supply the iframe justification for submission. Third-party iframe eligibility still requires platform review; the declaration itself does not establish approval or guarantee player availability inside every host. [Official OpenAI iframe policy](https://developers.openai.com/plugins/plugin-guidelines#iframes-and-embedded-pages).

## Native entrypoints and model context

The `workspace_render` tool accepts `{}`, an owned saved `artifactId`, or a complete unsaved `artifact` preview (never both artifact inputs), and advertises `_meta["openai/ui"].entrypoints` with `global` and `thread`. It supplies a monochrome SVG tool icon. Its versioned HTML resource declares only `fullscreen`; browser initialization advertises the same mode. It requests fullscreen once when supported and accepts the actual returned mode. The global desktop view uses the host's real composer and thread layout. These extensions are platform-dependent, and a display preference is a hint the host may decline.

The bridge negotiates host capabilities, receives partial host-context changes, and exports `updateModelContext({title,text,structuredContent?})` for user-selected study material. It calls standard `ui/update-model-context`, which replaces the app's attached context for future turns. Passing null clears it. Unsupported hosts return false. `requestDisplayMode` checks the host's advertised modes before requesting a change and respects the actual returned mode. `getHostContext` and `notable:host-context` allow the UI to observe host changes. Audio stops when native `ui/resource-teardown` is received.

Browser bridge uses standard MCP Apps initialization, `tools/call`, tool-result notifications and `ui/message`, with legacy `window.openai` fallback. Messages are accepted only from the parent iframe and pin its origin after the response. Generation requests send a follow-up only on a student action. An ordinary browser cannot borrow a student's ChatGPT plan.

Official references: [UI resources/bridge](https://developers.openai.com/plugins/build/chatgpt-ui), [OAuth](https://developers.openai.com/plugins/build/auth), [MCP](https://developers.openai.com/plugins/build/mcp-server), [packaging/testing](https://developers.openai.com/plugins/build/plugins).

Extension details: [OpenAI native extension guide](https://developers.openai.com/plugins/build/extensions), [official OpenAI MCP extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md), [MCP Apps 2026-01-26 specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).


## Conversation-first layout

The native view uses ChatGPT’s composer, without a duplicate Nooks textbox. Notes, flashcards and quizzes send intentional context-rich chat requests and display completed tool results. A new artifact opens from any library view; incoming work does not discard unsaved note edits. Current editor context is attached after a 500 ms debounce, with long excerpts explicitly marked incomplete; explicit note actions pass immediate complete snapshots or the exact selected passage. The server resolves saved artifact IDs under account ownership and read permissions.

The website offers `?layout=chatgpt` as a visual preview only; this never changes transport, identity, or permissions. `&chat=collapsed` selects the wider workspace. “Space for chat” leaves a design reserve at the right on large screens; “Full workspace” restores width. These controls never open, close, move, or measure the host chat panel. Verified safe-area insets apply separately from the app’s own composer reserve. See [designer handoff](chatgpt-layout-handoff.md).
