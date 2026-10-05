# Artwork handoff — 2026-10-04

Implemented: save private draft → issue artwork request → native ChatGPT generation → host-authorized file handoff → browser validation/optimization → atomic image-only draft completion. Studio refreshes pending requests in the same tab and preserves local title/description edits. `nooks_present {draftId}` opens the owned creator draft in an existing app. This never publishes a community or applies a background without the subsequent user action.

Four tools: `nook_artwork_request`, `nook_artwork_receive` (official `openai/fileParams`), app-only `nook_artwork_complete` and `nook_artwork_cancel`. Fresh server request IDs, 12-hour expiry, bounded idempotency receipts, verified owner recovery scope, exact-host URL allowlist, credentialless/no-referrer/no-redirect download, streaming12MB limit, image signature/dimension checks, and existing private immutable image storage. Signed URLs are UI-only; expired metadata is hidden immediately and pruned on the next creator write, not a promise of timed physical deletion.

Source review passed. Backend225/225 and UI278/278 before the final no-host regression, then focused7/7 (279 total frontend tests); TypeScript/build passed. UI artwork27 focused tests include cancellation failure/retry, lost completion recovery, stale-account/request fences, unsupported origins, denied host permissions, oversized streams/dimensions, unsaved metadata preservation and explicit removal. Browser simulation verified save-before-prompt, pending feedback, cancel preserving rename, and fresh request afterward. No real image generation was performed by that harness.

Remaining acceptance gate: credentialless CORS download in a fresh deployed native widget → completed private image visible after reopening. A real built-in image-generation output was passed through the native tool's local-file parameter. The host populated official fileParams from `sdmntprcentralus.oaiusercontent.com`; the exact-host compatibility fix was deployed and the retry returned `status: received` at 2026-10-04T23:23:19.693Z. An authoritative draft read confirmed receipt, revision1, and no completed background image. Receipt alone does not establish automatic import/save.

Exact allowed origins: files.oaiusercontent.com (official OpenAI Help Center), sdmntprwestus.oaiusercontent.com (observed native Site image URL), and sdmntprcentralus.oaiusercontent.com (actual native fileParams on this test). Server validation, browser importer, and both resource CSP dialects match; unknown hosts, suffix lookalikes, credentials, ports, redirects, and oversized input remain rejected. Focused artwork26/26, server resource22/22, cloud9/9 and TypeScript/build pass.

The existing native app tab10 is an older mounted build with an unsaved Hogwarts scene draft and an active unsaved-changes confirmation. It was not navigated, reloaded, or overwritten. Other existing quiz sessions also remain untouched. A current native widget is still needed to prove the actual CORS/import/completion step; no manual completion or fake file payload was substituted.

Public/no-host editors only save their local draft and offer an ID-free drawing prompt; they never queue native import or imply their library is shared with ChatGPT. Native APIs are feature detected. A local imagegen output or simulated download does not establish native automatic handoff.

Official references: https://developers.openai.com/plugins/reference#file-apis and https://developers.openai.com/plugins/build/chatgpt-ui . No new database, plan upgrade, paid AI API, billing change, audience change, or GN Reporting access.

Deployment: private Site succeeded2026-10-04T21:30:22.034849Z, commit bb00f90428b28394f9d08aaad8c6e3c3c2e5ff47; public alias updated to nooks-study-space-3cl9ssx7n-eeshpara-1663s-projects.vercel.app. No native end-to-end automatic file-handoff claim.


Origin compatibility release: private Site succeeded2026-10-04T23:22:53.553797+00:00, commit05eca07aae393b1faba9758c8b5ef700d2bedfc4, deploymentappgdep_6ac2dfc2dad88191a58f7b4dd834504c. No new database/plan/audience changes.
