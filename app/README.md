# Nooks

**Your study nook within ChatGPT.** Notes, practice, focus, and collectible keepsakes in an illustrated nook you can make your own.

## Share the friends preview

[Open Nooks on Vercel](https://nooks-study-space.vercel.app). This public browser preview includes editable notes, flashcards, quizzes, focus timers, illustrated nooks, and personal progress. Each visitor's workspace is saved in that browser's IndexedDB; no login is needed and no private developer workspace is published. Clearing site data removes that browser's preview work. Community previews are labeled examples; AI generation requires the connected native ChatGPT experience. Website account saving is not configured on this public deployment.

This device-mode preview is separate from the deployed owner-private authenticated MCP service. Its Share preview action copies the site URL; it does not publish a student's notes or pretend to create a live shared lobby. See [Vercel preview deployment](docs/vercel-preview.md) for repeatable builds and deployment.

## Try the working local preview

Use Node.js 22.12 or newer. If you use nvm, run `nvm use 22` first so npm scripts and the terminal share the same version.

```sh
npm install
npm run build
npm start
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787). Saved items, practice results, tasks and focus history survive refreshes. Sample material is included so you can try everything immediately. For development, run the backend with `npm start`, then `npm run dev` in another terminal and open port 5173.

The preview includes a searchable library, editable Markdown notes, flip cards and confidence ratings, quizzes and timed exams, matching and sprint games, study plans, focus sessions with pause/resume, points, progress and a growing garden. Choose from 31 illustrated nooks or upload your own artwork. Real focus time unlocks nook-specific decorations, with up to three placed rewards in each nook; changing nooks keeps each nook’s progress separate. Import your own note text or structured study material to practice something real.

Sharing creates an explicit read-only appearance snapshot. It excludes all private study artifacts and account identity. Aggregate progress is included only when you select it. Revoke a share to disable its link. Local share links work on this computer only; online sharing needs a deployed server.

Nooks retains the prototype's internal `notable` identifiers and data paths so your saved library, progress and installed connection continue to work. The visible product name is Nooks; this is an update to the same plugin.

ChatGPT generation buttons send a follow-up through the host when Nooks is connected inside ChatGPT. The standalone preview cannot borrow your ChatGPT plan. Public preview community profiles and rankings are labeled sample data. The owner-private deployment has authenticated Supabase-backed membership, invitations, presence and publication code; real multi-account hosted acceptance testing remains a launch gate. Lecture recording, Canvas synchronization and billing remain deferred.

## Verify it

```sh
npm run build
npm test
```

Tests cover durable storage, account isolation, anonymous writes, valid educational content, score computation, retry-safe points, pause-aware timers, OAuth verification and MCP discovery/rendering. HTTP tests create temporary localhost listeners and isolated temporary data.

## Connect to ChatGPT

The project contains a real MCP HTTP endpoint at `/mcp`, tool schemas, an embedded UI resource, standard MCP Apps bridge and compatible plugin manifest. `workspace_render` advertises a native sidebar entrypoint and a conversation tab, both using fullscreen, and the bridge can attach explicitly selected material to the actual ChatGPT composer. The host controls whether these extensions are available. Inside the ChatGPT host, Nooks uses the host’s conversation and composer. The standalone browser includes an explicitly labeled sample conversation for design testing.

The native Site/plugin is deployed [owner-private](https://nooks-study-space.eeshwarpara.chatgpt.site), backed by the dedicated Nooks Supabase project. Native same-tab navigation and authenticated workspace access have been observed. This is not a public plugin listing or a production-readiness sign-off. The local development plugin remains a separate development path; never expose its demo identity over a public tunnel.

The public Vercel preview stores work on-device. Browser account support exists in source but is not configured on the public deployment. Website accounts and native host identities use separate account namespaces: libraries do not automatically sync between those surfaces or import device notes.

Hosted native UI uses a configured HTTPS artwork origin to keep the embedded HTML small (about 1.6 MiB in the October 4 baseline). The backend uses Supabase transactions and service-only RPCs; the JSON store is for isolated local development. Keep `.notable-data/` private and out of source control.

Start with [current implementation status](docs/production/implementation-status.md), [deployment evidence](docs/plugin-setup-status.json), and the [independent release judge](docs/release-judge-oct4.md). Controlled owner/developer testing has passed the reviewed baseline; a student pilot and public production launch remain on hold for the documented operational and multi-account gates. See [integration details](docs/integration.md) for the tool contract and local auth configuration; older historical reports are not current deployment evidence.

## Project layout

- `ui/src/`: React dashboard, study interactions and host bridge.
- `ui/public/`: bundled Nooks illustration and licensed font.
- `server/`: MCP/REST transport, validated study engine, account authorization and durable storage.
- `tests/`: behavior and boundary checks.
- `.codex-plugin/plugin.json` and `.mcp.json`: local plugin metadata and endpoint wiring.

The UI uses the original Notable Mac design as a reference. This build is a new ChatGPT study experience; it does not reuse the old app’s service keys or silently call its production backend.
