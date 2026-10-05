# Movable study workspace — 2026-10-04

The default study layout is preserved. Arrange exposes dedicated handles for music, welcome, people, timer, tasks and collection. Done hides handles; each positioned widget and the entire layout can be reset. Touch and keyboard gestures are supported above the compact breakpoint; phones use their default layout without overwriting desktop preferences.

## Persistence and trust

An app-only workspace_layout_update tool validates six widget IDs and bounded normalized coordinates, persists through the existing owner-scoped workspace transaction, and keeps layout out of model-facing context and shared nook appearance. It requires connected read/write permission. No migration or new service is required. The public device preview persists through IndexedDB and never claims account synchronization. Failed saves remain visibly pending with retry. Account switches keep pending queues separate. Arrange remains disabled until the workspace successfully loads.

## Verification

- 208 backend tests and 251 UI tests pass, including 15 primitive geometry/gesture/save-queue tests. Cloud tests and final packaged builds are checked by the deployment workflow.
- Actual pointer drag moved the timer and Spotify. All six widgets also moved via keyboard. Reload restored all six saved placements.
- Real Spotify playlist embed remained visible across drag and expansion; its URL stayed unchanged. Automated child-identity and source checks cover no iframe remount. Audible playback was not verified.
- Tested 1280×720, 900×540, and 390×844. All custom positions clamp within viewport bounds. Compact mode restores normal layout, hides Arrange, and preserves desktop positions. A compact toolbar overlap found in browser review was fixed.
- Individual music reset and global reset both restored defaults. Widgets may intentionally overlap when manually placed; global reset remains reachable.
- Changes affect the shared UI; this browser exercise used an isolated local device preview. A real native layout-save journey is not yet asserted.

- Review found and fixed two additional issues: focus controls now sit above moved widgets, collection dialogs above other widgets, and Home fades without translating fixed children. Browser hit-tests passed for all focus buttons and collection close; saved timer bounds matched after Library→Home.

## Release boundary

This feature does not resolve the previously documented launch gates: real two-account and native recovery journeys, public Auth/secret permission, hosted recovery and capacity, and operational alerts/cleanup ownership. GN Reporting and unrelated projects are untouched.

## Deployment

- Private native Site succeeded at 2026-10-04T20:57:01.571698+00:00; commit `d2b7542e03f08f2de7de71809f0eeb511d4cfc88`, deployment `appgdep_6ac2bd653c548191a228ec9af7160941`, existing environment revision1, MCP enabled.
- Public preview alias updated successfully to `https://nooks-study-space-olcn90d53-eeshpara-1663s-projects.vercel.app`.
- Final totals:208 backend +251 UI +18 cloud =477 passing checks. Typecheck and both packaged builds passed. Independent reviewer cleared this feature, with broader launch gates unchanged.
