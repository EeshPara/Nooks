# Independent deployment-skew review — October 8, 2026

**Current status: PASS within the tested bounded frontend-compatibility scope. The confirmed P1 defect is closed on public release `iebenwu3j` by source review, deployed byte/cache checks and old-client browser acceptance.** No platform settings, purchases, server data or user content were changed by this reviewer. This scoped acceptance does not close the remaining onboarding and operational launch gates.

## Independently reproduced public failure

Read-only GETs to the existing public origin returned:

| Requested path | HTTP | Type / bytes | Cache policy |
| --- | --- | --- | --- |
| `/assets/study-content-CAoZffAd.js` | 200 | HTML / 796 bytes | public, max-age=31536000, immutable |
| `/assets/study-content-CAoZffAd.js?nooks_retry=1` | 200 | HTML / 796 bytes | public, max-age=31536000, immutable |
| `/assets/nooks-nonexistent-skew-review.js` | 200 | HTML / 796 bytes | public, max-age=31536000, immutable |

The older published deferred module is missing from the current deployment. The blanket immutable `/assets` rule runs before filesystem lookup, and the catch-all then serves the current SPA index. Existing open tabs can therefore fail when they first open a note after an alias update; fresh retry URLs still cannot fetch code that the deployment no longer contains. This is separate from the already-fixed single transient download failure.

## Required acceptance gates communicated to implementer

- Retain a bounded number of **complete previously verified JS/CSS generations**, including initial shared and deferred modules, without mixing partial graphs. Validate transitive referenced assets or retain their exact required hashes too.
- Establish provenance from exact published-byte reports and reproducible locked-source builds. Do not accept merely similar rebuilt assets or unverified remote code. Record source commit, lock/build context, paths, byte lengths and SHA-256 values.
- Keep the old graph's assets only. Never replace current HTML, API/server code, environment, configuration or user data with a historical package.
- Static preflight must validate an exact union of the current build and explicitly approved retained assets. Reject extra files, missing files, altered bytes, collisions, unsafe paths and symlinks; do not weaken the current exact-package guard to a subset test.
- Bound generations and bytes; prune whole generations deterministically and preserve overlapping shared files needed by any retained graph. State the supported deployment horizon rather than claiming indefinite old-tab compatibility.
- Missing `/assets` paths, with or without retry queries, must return a genuine noncacheable 404 and never the SPA index with immutable caching. Existing assets should retain correct types and intended caching. Verify actual deployed behavior, not only JSON route structure.
- Exercise an older entry/static/deferred graph against the new alias and verify successful note opening. Restoring server bytes cannot erase HTML or failed-module results already cached in a browser; test the existing loader's next fresh retry URL and document that limitation accurately.

Source review, focused tests and scoped deployed acceptance are complete. Existing project identity, audiences and billing remain unchanged; platform skew-protection upgrades are not part of this repair.

The official [Vercel Build Output configuration reference](https://vercel.com/docs/build-output-api/configuration) supports explicit route status and pathname matching without query strings. It also states that its build-cache field does not apply to locally built/prebuilt deployments; retention must therefore be present in the verified static package itself. These documented primitives do not replace the deployed response check.

## Initial implementation review

The proposed store retains at most sixteen complete generations and 32 MiB of stored JS/CSS, using a 48-hour capture deadline and a maximum one-hour age for the live capture before invoking deployment. Public metadata carries retained records so a fresh checkout can reconstruct their verified bytes. Static output keeps the existing exact package/source comparison and adds an exact current-plus-retained JS/CSS union check. Filename/hash collisions, unknown files, symlinks, missing non-code dependencies, stale captures and observed alias changes fail closed. These source properties pass this scoped review but do not alone constitute deployed release approval.

I independently verified both bootstrap archives against the original public verification records: the nine-z release report retrieved from Git commit `8f548b9fa0df3a5fc9bfa3cfb3596a6743350a4a`, and the current f4pl report. Their report hashes match provenance; all twelve archived JS/CSS files match exact byte lengths and SHA-256 values; both sets of ten audio dependency hashes match. The f4pl record explicitly identifies a published dirty working tree and treats exact published bytes as authoritative, avoiding a false source-commit claim.

Three initial source issues were found and corrected: the network helper buffered entire responses before checking limits, incoming aggregate budgets were checked after fetching assets, and retention/provenance metadata lacked sufficient bounds. The final helper streams and cancels over-limit bodies; both incoming records and their union with the local store are budgeted before asset fetching; records require an exact 48-hour deadline, bounded clock tolerance and strictly validated provenance. I independently ran all **33 focused retention/deploy tests**, which passed, and inspected the final atomic-retirement refinement. Expired directories are renamed out of the active registry before recursive cleanup; interrupted cleanup has a recognized restart path. There is no remaining blocking source finding within this scope.

The final prepublish alias check detects an already-observed competing rollout but is not a distributed compare-and-swap: another publisher could act between that check and Vercel alias replacement. Keep the single-publisher operational assumption explicit. The declared retention interval is measured from capture, not the old build date or a confirmed retirement event; do not promise indefinite or exact retirement-based compatibility from those timestamps.

## Prepared package

The final candidate manifest identifies current HTML `df2d810df2a8f0b88e19f23b` and entry `index-BHG_76oL.js`, retaining both registered historical graphs. The implementation agent records a successful real live capture and alias recheck, 4,347,965 stored historical bytes, a 229-file package, and passing full preflight before and after clean-environment backend import. I inspected that manifest and evidence; this package evidence is separate from the independently run focused tests and is supported by the deployed acceptance below.

## Deployed acceptance method

Root has prepared read-only HTTP verification for exact public metadata, current index, every current/retained JS/CSS hash and MIME type, retained retry URLs, and missing-asset 404/no-store behavior. The old-release browser harness verifies requested historical code against original published hashes while forwarding only to the existing public alias. Root also has an actual still-open f4pl tab that has not loaded its editor since the earlier deployment. These are complementary checks; their completed results are recorded below.

The bootstrap covers the exact registered nine-z and f4pl graphs. It does not retroactively cover every earlier release, including the unregistered pre-deferred graph. Restored server assets cannot erase a browser’s already cached HTML response or failed module evaluation; a fresh retry URL can recover where the existing loader supports it.

## Deployed acceptance results

The new `iebenwu3j` release is published on the existing public alias. Root's `public-compatibility-verification.json` at 09:54:03 UTC passes all sixteen rows: current index/registry, the ten-file unique JS/CSS union, both historical deferred retry URLs, and two missing-path 404/no-store checks. I independently repeated two read-only HTTP requests: the nine-z module with a new reviewer retry query returned JavaScript, 543,864 bytes, SHA-256 `0303d418eedfa2c93486c4303c0b790592951a9e72826243d36634db81c28498`; a fresh missing retry-query path returned 404, text/plain and no-store. This independently confirms the former cached-HTML failure is repaired at the server for those paths.

Root reports the real f4pl page was kept open through deployment with its original `index-3dqvx5TN.js` script and no editor import before the rollout. After publication it opened the old editor with prior QA content intact, saved the title `Public release compatibility verified` while still running the old entry, and retained that title after a full reload into the new release. These are root's browser observations, not independent grader browser actions. The separate nine-z clean-origin historical-entry check also passed, as detailed next.

I inspected `deployment-compatibility-browser-qa.md` and all fourteen entries in `old-release-browser-assets.json`. The fresh loopback-origin browser used the historical nine-z entry with device-only configuration while fetching its code from the actual current public alias. The original deferred module loaded successfully; a disposable thirteen-word note reached Saved and retained its exact body after full reload and reopening. All fourteen observed JS/CSS requests match the original recorded hashes and sizes. Root also verified the current public Nook Studio close action focuses Nooks instead of body. These are recorded actual browser operations by root, with raw asset observations independently inspected here.

The latest current/retained/media sweep passed 70/70 resources. The new release's one-fixture authenticated probe passed configuration 200/125 ms and workspace 200/393 ms. Its targeted 10,000-level malformed request returned 400 INVALID_INPUT with the profile unchanged; account/Auth/session and exact orphan-topic cleanup are verified in the matching 09:56 operations records. No new capacity claim is implied.

**Acceptance:** the observed missing-old-module and immutable-SPA-on-asset-miss defects are repaired for the registered graphs and tested retry paths. This closes this scoped P1, while preserving the documented bounded capture-based retention, sixteen-generation/32-MiB limits, single-publisher race limitation and exclusion of unregistered older releases. It does not prove indefinite tabs, old authenticated API/schema compatibility, physical-device performance, email onboarding or scheduled operational recovery. Overall quality/readiness grades remain 7.5/6.5.
