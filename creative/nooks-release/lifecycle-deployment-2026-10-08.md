# Metadata and lifecycle release — October 8, 2026

Published to the existing public site and owner-private native Site. The public deployment is `c4t3ni42i`, https://nooks-study-space.vercel.app. Its HTML/manifest ID is `640128902cacc8f377e1a477`; entry JavaScript is `index-JcQqudl0.js` and deferred study code is `study-content-DtGBrsQ6.js`.

Native version 40 uses source `a72d3fe9a695035f0ea4e525a00d02653ad138d4`, saved version `appgprj_6abf1d6c87c08191b8c6f30bc0267fe9~appgver_86cc15fec0008191ad869a437058091b`, deployment `appgdep_6ac78591ad408191910e80e6d73f3f26`. The service reported succeeded at 12:00:08 UTC, MCP enabled and environment revision 1, at https://nooks-study-space.eeshwarpara.chatgpt.site. The existing private audience was preserved. No fresh native iframe interaction is claimed.

Included changes:

- Studio metadata listing validates owned artwork references without downloading image bytes. Full reads and writes still hydrate artwork; no hosted latency/bandwidth improvement is claimed.
- Deliberate account changes protect hidden unsaved Studio fields, appearance-only edits, pending saves/imports and unsafe cancellation work. Save/discard guidance and scoped focus restoration passed mounted simulated-account tests. The browser-found StrictMode close-handler issue was corrected before publication.
- Shared-library views isolate owner/status/invitation state and reject stale asynchronous completions. Deliberate invitation changes preserve unsaved edits/comments and pending work. Mounted simulated-account/tool tests passed; real email/authenticated sharing remains a separate gate.

Source commits are `86c1382`, `810260d` and `47e892f`. Selective ports preserved app/cloud differences. All affected type checks/builds and the documented tests passed. Root checked Site file baselines before porting and built its exact source locally; the native archive contained 224 files and 95,180,800 bytes.

The public guarded deployment retained the prior `d03cf6fb1687397f7f16feb1` frontend graph. Actual deployed checks passed **75/75 assets** and **23/23 compatibility cases**, including exact hashes, media resources, retained dependencies and missing-asset behavior. The existing retention limits remain unchanged.

The fresh disposable authenticated probe at 12:01 UTC passed configuration (200, 90 ms), workspace (200, 486 ms) and empty owner-scoped Studio draft listing (200, 350 ms). Session/account/Auth cleanup passed; the exact guarded throttle cleanup found no remaining row. This is one initialized admin-confirmed fixture, not email delivery, populated authenticated artwork listing, persistent monitoring or a load test. See the timestamped operations reports.

Root reloaded the retained public QA browser into this release. At measured 390 × 844, document width and scrollWidth were both 390. My Nooks showed the existing QA quiet corner private draft. Its Studio opened and closed; closing restored the Nooks button and left zero open dialogs. The temporary viewport override was then reset. This adds deployed device-local rendering/retention/focus evidence, not a signed-in browser or physical-phone result.

The corrected final 15-minute soak subsequently passed on this fixed release: 100 identities in five rooms, 3,559 plateau requests, zero unexpected errors, p95 394 ms, both reconnect rounds and final integrity checks passed. Start/end HTML and manifest hashes matched. All fixture identities/accounts/rooms were verified absent; root removed the 105 exact orphan throttle topics and verified zero remained. Neither earlier incomplete attempt counts as a completed soak; their reports and cleanup records remain preserved. See [final soak evidence](deployed/soak-results-2026-10-08-final.md) for exact scope and limits.
