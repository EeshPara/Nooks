# Continue Nooks on another computer

Handoff saved October 5, 2026. Read this before the older project reports.

## Fast start

Clone `https://github.com/EeshPara/Nooks` while signed into the EeshPara GitHub account, then open that folder as a project in Codex. Ask the new chat to read this file and `AGENTS.md` before making edits.

For designer-led UI work, follow `DESIGNER-START.md`: the agent runs `npm run designer` and edits `web/ui/src/`. For broader development use `app/` with Node 22.12+ and the README commands. No paid service or database setup is necessary for local preview work. This export was verified with a fresh `npm ci` followed by a successful TypeScript/Vite production build on October 5; it does not depend on the original project's node_modules or symbolic links.

## Three exact source states are preserved

| Folder | Meaning | Use |
| --- | --- | --- |
| `app/` | Latest development source from the original Mac | Main development, full tests, SQL migrations, research, creative assets. Includes unfinished backend/custom-art changes. |
| `cloud/` | Published owner-private native Site/plugin source | Native MCP/server/Worker baseline, exact source commit `2db2be2c35b76b4971957baab6d137ffa6ae6eea`. |
| `web/` | Published public Vercel source | Existing website release baseline and guarded deployment scripts. |

The three folders intentionally preserve their differences. Do not overwrite a published baseline with the entire development folder: some backend work is not yet reviewed or deployed. Port selected changes and their tests, then verify the affected build. Git stores identical files efficiently; the folders are not three different products.

`SOURCE-SNAPSHOT.json` records source paths, hashes and provenance. Creative Python tools were adjusted to use PATH/relative assets instead of the original Mac's binary locations. Rebuilding media also requires ffmpeg/ffprobe on PATH and Python Pillow/NumPy; the intro reuses its bundled title overlays, with `NOOKS_FONT` available for new typography. Historical reports may still contain that Mac's absolute paths; use the repository-relative equivalent.

## What was just completed

- The accepted Nooks intro is `ui/public/media/opening-film/nooks-opening-v3.mp4`, with warm ambience and the native same-workspace replay overlay. The visible **Watch intro** button is retained.
- Rainy Library alone now has `ui/public/media/nooks/rainy-library-loop-v1.mp4`: 7.208 seconds, 578,523 bytes, silent, 720p.
- Rain is confined to the window, lights vary gently, steam is faint and near the cup. Furniture stays still. The video pauses with the existing animation control and when the tab is hidden; reduced motion and failures use the still image.
- Generated with economical Seedance 1.5 Pro; original generation, prompt, static plate, motion mask, editing script, and QA are in `app/creative/rainy-library-loop/`. No need to spend more credits to use the completed asset.
- 8 lifecycle/selection tests and TypeScript/build checks passed; independent asset review passed. Public playback was verified muted, looping, ready and visible on October 5.
- Public release: `https://nooks-study-space.vercel.app/` (deployment `nooks-study-space-ow7vyeyet-eeshpara-1663s-projects.vercel.app`).
- Native release succeeded: deployment `appgdep_6ac3327884bc8191bf07607650ed2f5b`. The latest native background wasn't visually reverified inside a newly opened host panel; older mounted panels may retain their previous bundle.

## Existing services — reuse them

- GitHub source: `EeshPara/Nooks` (private). Push future source changes here so both computers can pull them.
- Public Vercel project: `nooks-study-space`, scope `eeshpara-1663s-projects`, project `prj_o4Y1xDImjiuXMB3EDdwPfoZO2Lud`, org `team_lNkAWhjTs7JjsRzUB4lY4UjQ`.
- Native Site: `appgprj_6abf1d6c87c08191b8c6f30bc0267fe9`, URL `https://nooks-study-space.eeshwarpara.chatgpt.site`, MCP at `/mcp`.
- Native plugin: `plugin_asdk_app_sites_b049dd9e20708191b708f385c7fa079a`.
- Dedicated Nooks Supabase project: `lcfcjglybfeozyrjjikk`.
- **Do not touch GN Reporting or any unrelated database/project.** Do not create a replacement Site/database or purchase upgrades to continue this work.

These IDs are routing metadata, not credentials. Authenticate to the existing services using the user's normal connectors/CLI sign-in. Credentials, tokens, local `.notable-data`, database dumps, and browser account state are deliberately absent.

The public website currently saves preview work in that browser; changing computers does not transfer those local study notes. The native owner-private app uses its existing hosted backend. This repository moves development work, not browser-local user data.

## Deploying later

**Public website:** work in `web/`, install dependencies with `npm ci`, then from repository root run `node tools/prepare-web-preview.mjs` to restore the nonsecret existing-project link. Sign into the Vercel CLI normally. Use `npm run deploy:preview` from `web/`. Its existing build/package/target guard is the supported deployment entrypoint. Do not deploy `app/` wholesale without reviewing pending backend changes.

**Native plugin:** use the installed Plugin Creator/Sites skills to retrieve the existing Site by the ID above and prepare a fresh separate Site-owned checkout on the new machine. Sites source is already pushed remotely. The `cloud/` folder here is an exact source snapshot for comparison; it is not an independently linked Sites checkout. Preserve the Site/plugin identity and private audience. Use the official Site workflow with ephemeral credentials and publish the exact verified source. Never put a credential in Git.

**Backend:** read `app/docs/production/implementation-status.md`, `app/docs/release-judge-oct4.md` and the custom-art publication reports before applying migrations or deploying pending changes. Controlled owner testing is supported; a public production/student-pilot sign-off has not been established. Multi-account acceptance, hosted recovery/operational checks and other documented launch gates remain.

## Product constraints to preserve

- Brand: **Nooks**, cozy/glassy study nook, clean typography; avoid excessive italic serif headings and generic icon grids.
- The ChatGPT host owns chat and AI compute. The native app receives selected context through tools and presents/edits saved materials. Do not imply access to every chat/upload automatically.
- Keep one seamless mounted UI: use `nooks_present`/same-session navigation instead of opening new tabs for each study item.
- Popups close with outside tap, visible X, and Escape. Editable notes autosave.
- User can move workspace widgets and Spotify panel. Existing curated playlist links should keep working.
- No floating pet animation until it convincingly fits scene geometry.
- New designs are expected later; keep current functionality and be candid about live vs preview features.
