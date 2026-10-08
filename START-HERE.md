# Continue Nooks on another computer

Handoff updated October 8, 2026; current release verification is in `creative/nooks-release/`. Read this before the older project reports.

## Fast start

Clone `https://github.com/EeshPara/Nooks` while signed into the EeshPara GitHub account, then open that folder as a project in Codex. Ask the new chat to read this file and `AGENTS.md` before making edits.

For designer-led UI work, follow `DESIGNER-START.md`: the agent runs `npm run designer` and edits `web/ui/src/`. For broader development use `app/` with Node 22.12+ and the README commands. No paid service or database setup is necessary for local preview work. This export was verified with a fresh `npm ci` followed by a successful TypeScript/Vite production build on October 5; it does not depend on the original project's node_modules or symbolic links.

## Three exact source states are preserved

| Folder | Meaning | Use |
| --- | --- | --- |
| `app/` | Latest development source from the original Mac | Main development, full tests, SQL migrations, research, creative assets. Includes unfinished backend/custom-art changes. |
| `cloud/` | Published owner-private native Site/plugin source | Native MCP/server/Worker baseline, version40 source commit `a72d3fe9a695035f0ea4e525a00d02653ad138d4`. |
| `web/` | Published public Vercel source | Existing website release baseline and guarded deployment scripts. |

The three folders intentionally preserve their differences. Do not overwrite a published baseline with the entire development folder: some backend work is not yet reviewed or deployed. Port selected changes and their tests, then verify the affected build. Git stores identical files efficiently; the folders are not three different products.

`SOURCE-SNAPSHOT.json` records source paths, hashes and provenance. Creative Python tools were adjusted to use PATH/relative assets instead of the original Mac's binary locations. Rebuilding media also requires ffmpeg/ffprobe on PATH and Python Pillow/NumPy; the intro reuses its bundled title overlays, with `NOOKS_FONT` available for new typography. Historical reports may still contain that Mac's absolute paths; use the repository-relative equivalent.

## What was just completed

- Final hosted soak on c4t3ni42i passed exactly 15 minutes with 100 users in five rooms, 3,559 plateau requests, zero unexpected errors and 394 ms p95. Both reconnect rounds, room isolation, final integrity and unchanged release hashes passed. All test accounts/rooms/topics were removed and verified absent. This is bounded 100-user API/realtime evidence, not 1,000-user or browser-capacity proof; see `creative/nooks-release/deployed/soak-results-2026-10-08-final.md` and `creative/nooks-release/MORNING-HANDOFF.md`.
- Public c4t3ni42i / private native40 publishes metadata-only Studio listing, protection for unsaved Studio work during account changes, and shared-library owner/target isolation. Independent source reviews, selective ports, affected tests/builds and mounted simulated-account browser checks passed. Deployed assets75/75, compatibility23/23 and one authenticated empty-list canary passed. Real email onboarding remains blocked by SMTP; see `creative/nooks-release/lifecycle-deployment-2026-10-08.md`.

- Public f2z3aj98o / native39 fixes My Nooks missing current Studio drafts and preserves Save-button focus. Owner guards, canceled-switch retry and repeated modal journeys passed; browser QA caught and fixed duplicate sibling keys before release. That release’s assets72/72, compatibility19/19 and one authenticated empty-list canary pass. Public Node disconnect hardening is included; hosted cancellation propagation is not proven.

- The accepted Nooks intro is `ui/public/media/opening-film/nooks-opening-v3.mp4`, with warm ambience and the native same-workspace replay overlay. The visible **Watch intro** button is retained.
- All 50 curated rooms now have exact-art Higgsfield animations, independently reviewed by final SHA and decoded completely. Original three clips were corrected using existing source assets; their historical files remain untouched. New final filenames are under `ui/public/videos/nooks-animated-all/`. The final media release gate confirms all four source targets match.
- Public release `iebenwu3j` now retains verified earlier JS/CSS for a bounded compatibility window, so an open page can still load its editor after a deployment. Real old-tab/archived-build save and reload checks passed; missing assets now return 404/no-store. The guarded deployment captures the live graph automatically. Read `web/release-assets/README.md` before changing this policy.
- The public editor/reference code loads on demand with retryable, build-verified module URLs and eager draft protection. Initial JavaScript gzip is about39.8% smaller; actual failed-download retry, autosave and reload checks passed. Native remains self-contained.
- All 50 rooms have natural ambience presets. Field recordings are loaded as separate audio assets; inactive decoded players fade out and release buffers. License/attribution details are in `ui/src/world/audio/SOURCES.md`.
- A visible Motion control persists the animation preference; playback stops while hidden and respects reduced motion. Task entry now keeps keyboard focus while saving. Actual browser checks verified notes/autosave, quiz grading and persistence, focus credit, task persistence, discovery recovery, ambience controls, and animation pause/reload/resume.
- Dedicated hosted Supabase has the two additive October 8 realtime/scale migrations. Public signed-in clients use private content-free invalidations with authorization on each data read; native clients reconcile by polling.
- A bounded hosted test used 100 distinct identities, 100 sockets/300 private channels and 869 requests with zero errors (p95 706ms). All fixture accounts/rooms/topics were cleaned. This does not establish 1,000-user capacity or uninterrupted production HTTP load; see the exact capacity report.
- All50 reviewed clips and new ambience are deployed to the existing public URL and owner-private native version40. Public deployed acceptance passed16/16 checks. A second actual Vercel-path capacity run passed100 identities/100 sockets/300 private channels,873 requests with zero errors and p95 364ms; all fixtures/topics were cleaned. See `deployed/`. The truthful guest header/share-copy followup is published; the public header was verified in the browser. Public email onboarding remains blocked by missing custom SMTP/provider configuration; verification was not disabled.
- Independent grade after the completed 15-minute soak: quality 7.5/10, readiness 7/10; see `final-independent-grade.md`. No continuous playback or subjective audio audition is claimed. See `OVERNIGHT-LOOP.md`, browser QA, scene reviews and operations reports under `creative/nooks-release/`.

## Existing services — reuse them

- GitHub source: `EeshPara/Nooks` (private). Push future source changes here so both computers can pull them.
- Public Vercel project: `nooks-study-space`, scope `eeshpara-1663s-projects`, project `prj_o4Y1xDImjiuXMB3EDdwPfoZO2Lud`, org `team_lNkAWhjTs7JjsRzUB4lY4UjQ`.
- Native Site: `appgprj_6abf1d6c87c08191b8c6f30bc0267fe9`, URL `https://nooks-study-space.eeshwarpara.chatgpt.site`, MCP at `/mcp`.
- Native plugin: `plugin_asdk_app_sites_b049dd9e20708191b708f385c7fa079a`.
- Dedicated Nooks Supabase project: `lcfcjglybfeozyrjjikk`.
- **Do not touch GN Reporting or any unrelated database/project.** Do not create a replacement Site/database or purchase upgrades to continue this work.

These IDs are routing metadata, not credentials. Authenticate to the existing services using the user's normal connectors/CLI sign-in. Credentials, tokens, local `.notable-data`, database dumps, and browser account state are deliberately absent.

The public deployment now has the configured backend and verified authenticated API. Guests still save work in their browser; changing computers does not transfer device-local notes. Account saving requires sign-in, and public email signup still needs custom SMTP. The initial server-credential deployment failure and verified correction are documented in `creative/nooks-release/public-auth-deployment-incident.md`. The native owner-private app uses its existing hosted backend. This repository moves development work, not browser-local user data.

## Deploying later

**Public website:** work in `web/`, install dependencies with `npm ci`, then from repository root run `node tools/prepare-web-preview.mjs` to restore the nonsecret existing-project link. Sign into the Vercel CLI normally. Use `npm run deploy:preview` from `web/`. Its existing build/package/target guard is the supported deployment entrypoint. Do not deploy `app/` wholesale without reviewing pending backend changes.

**Native plugin:** use the installed Plugin Creator/Sites skills to retrieve the existing Site by the ID above and prepare a fresh separate Site-owned checkout on the new machine. Sites source is already pushed remotely. The `cloud/` folder here is an exact source snapshot for comparison; it is not an independently linked Sites checkout. Preserve the Site/plugin identity and private audience. Use the official Site workflow with ephemeral credentials and publish the exact verified source. Never put a credential in Git.

**Backend:** read `app/docs/production/implementation-status.md`, `app/docs/release-judge-oct4.md` and the custom-art publication reports before applying migrations or deploying pending changes. Controlled owner testing is supported; a public production/student-pilot sign-off has not been established. Two-account hosted correctness and the bounded 100-distinct-user test passed; email onboarding, actual native iframe acceptance, hosted recovery/alert delivery and other documented launch gates remain.

## Product constraints to preserve

- Brand: **Nooks**, cozy/glassy study nook, clean typography; avoid excessive italic serif headings and generic icon grids.
- The ChatGPT host owns chat and AI compute. The native app receives selected context through tools and presents/edits saved materials. Do not imply access to every chat/upload automatically.
- Keep one seamless mounted UI: use `nooks_present`/same-session navigation instead of opening new tabs for each study item.
- Popups close with outside tap, visible X, and Escape. Editable notes autosave.
- User can move workspace widgets and Spotify panel. Existing curated playlist links should keep working.
- No floating pet animation until it convincingly fits scene geometry.
- New designs are expected later; keep current functionality and be candid about live vs preview features.
