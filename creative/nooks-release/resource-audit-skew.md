# Public deployment asset skew — October 8, 2026

The risk was reproduced on the actual public alias, not inferred only from source. An open page from the first deferred-editor release would later request its original compiled module after the copy-only followup replaced that deployment.

## Observed failure

Read-only HTTP checks at **2026-10-08 09:16:43 UTC**:

| Requested path on `nooks-study-space.vercel.app` | Observed result | Expected |
| --- | --- | --- |
| `/assets/study-content-CAoZffAd.js` | 200, `text/html`, 796 bytes | Verified 543,864-byte JavaScript module |
| `/assets/study-content-CAoZffAd.js?nooks_retry=1` | 200, `text/html`, 796 bytes | Same verified module |
| `/assets/index-DECl8W_L.js` | 200, `text/html`, 796 bytes | Pre-deferred release JavaScript verified at 08:26 UTC (Git `cd1cd9a` report) |
| `/assets/index-BcKeIWXw.css` | 200, `text/html`, 796 bytes | Same pre-deferred release's verified stylesheet |

All missing asset responses inherited `Cache-Control: public, max-age=31536000, immutable` while returning the current SPA index. The 796-byte document had SHA-256 `3c3d4164950ace2411497a8bc8b3bca43f1ab191f4b937ab1f960eff2100f18c`. Current HTML referenced `index-3dqvx5TN.js` and `NoteAppearance-CQlKYQkf.js`. Local diagnostic results are `/tmp/nooks-deployment-skew-audit.json`.

The package script previously removed its output and copied only the latest build. The routing contract applied immutable asset headers before filesystem lookup, then sent every missing path to `/index.html`. Neither retries with a new query nor immutable browser caching can recover a compiled file the current deployment no longer serves. Already cached HTML/error responses may also require a fresh retry query after the asset is restored.

Direct prior immutable-deployment asset URLs redirected away from the asset, so they were not an anonymous fallback. Read-only project/team metadata reported framework `null` and plan `hobby`; no plan or project setting changed. Vercel's documented Skew Protection requires Pro or Enterprise, and custom prebuilt implementations must explicitly pin requests. It is not an existing automatic fix for this project. [Vercel Skew Protection documentation](https://vercel.com/docs/skew-protection).

## Authorized fix prepared

`web/release-assets/` now stores verified prior public JS/CSS graphs with exact publication provenance. The old `9z41r5dtu` graph was rebuilt from Git commit `8f548b9` in `/private/tmp/nooks-skew-8f548b9-vebtbqjd`; all six JS/CSS files and ten referenced hashed media dependencies match the actual deployed verification report stored at that commit. The old HTML remains at `web/dist-preview/index.html` inside that temporary checkout for root's old-client acceptance proxy; it is not copied into the new deployment.

The current `f4plfem4r` graph was captured from its build, matched to the actual public verification report, and freshly checked through public HTTP. Its dirty working-tree provenance is stated honestly. The two archives are approximately 2.17 MB of JS/CSS each; shared files are counted in each archive for the storage bound.

The deployment workflow now:

1. Reads the live HTML and public release manifest, verifies its registered JS/CSS bytes, and captures the current graph before building a replacement. A known, independently verified legacy bootstrap is allowed; unknown manifest-less releases stop publication.
2. Carries complete unexpired generations in `/nooks-release.json`, permitting reconstruction from a fresh computer. Only same-project public assets are read; no protected-deployment bypass is attempted.
3. Merges verified retained JS/CSS into the current output, preserving filename/hash identity and checking that registered media/font dependencies still exist unchanged. Current HTML/API/server remain current.
4. Verifies that both local build and package contain the exact registered current-plus-retained JS/CSS union. Symlinks, extra files, hash mismatches, changed dependencies, and filename collisions fail closed.
5. Rechecks live HTML immediately before publishing, and refuses captures older than one hour. Another operator's alias change stops this deployment.

Generations target 48 hours from capture, supporting a conservative minimum 24-hour open-page window during normal bounded deployment. Limits are 16 prior graphs and 32 MiB of stored JS/CSS. An unexpired graph is never evicted merely to fit a limit; publishing stops. Expired graphs are pruned together. This does not promise indefinite open-tab compatibility or pin old clients to old backend APIs. There remains a narrow concurrent-publication race after the final alias check; no platform-wide atomic compare-and-swap was added.

The routing contract now places a dedicated `404` / `Cache-Control: no-store` asset miss after filesystem lookup and before SPA fallback. `/nooks-release.json` is also `no-store`. The former immutable header must be overridden on misses; actual deployed response verification remains necessary.

## Verification status

Latest retention and deployment guard run: **33 tests passed**. Tests exercise exact union packaging, fresh-machine reconstruction, fixed old deadlines, asset hash/path/symlink rejection, collisions, count/byte limits without eviction, whole-generation expiry, missing/changed media dependencies, unknown live release, alias change, stale capture, routing order, idempotent packaging, relative CSS font dependencies, bounded stream cancellation, pre-fetch budget limits, and constrained retention/provenance metadata. Root and the independent grader are reviewing the final implementation.

The final public UI build passed. Its HTML identity is `df2d810df2a8f0b88e19f23b`, with entry `index-BHG_76oL.js`. An actual read-only live capture of `f4plfem4r`, followed by registry preparation and live-alias recheck, passed. The two retained graphs occupy **4,347,965 stored bytes**. Packaging produced 229 static files; the complete preflight passed before and after importing the packaged backend in a clean environment. Root independently verified the current Nook Studio focus fix in the local browser. No public deployment was performed by this audit/implementation agent.

Before reporting this fixed in production, verify missing canonical and retry-query assets return true 404/no-store; both retained historical graphs return exact JS/CSS; the public manifest reconstructs the registry; and an old entry page that has never opened its editor can open the old deferred module against the new public alias while preserving its note content. These deployed/browser checks are not claimed yet.
