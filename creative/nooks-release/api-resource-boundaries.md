# Public API resource boundaries — October 8, 2026

The public handler enforces a 2 MiB body limit and meaningful product array bounds. This audit did not find a demonstrated unbounded large-array route. It reproduced one small input-error classification bug, now fixed in the public handler, and two bounded cancellation/deadline gaps that remain unchanged. The initial audit used no application edits; root subsequently approved only the narrow RangeError-to-client-input fix. No production requests, credentials, fixtures or provider changes were used. Applicable `AGENTS.md`, `START-HERE.md`, public handler/deployment contract and existing relevant tests were read; app/cloud differences remain untouched.

## Fixed: preparsed deep JSON previously returned a false backend outage

At `web/server/browser-api.mjs:49`, host-provided `request.body` objects are serialized with `JSON.stringify` before the post-serialization byte check. A **20,028-byte** valid JSON object containing a 10,000-level nested `displayName` array is below the 2 MiB limit. With a streamed body it parses and returns the expected input HTTP 400. With the same JSON supplied as a preparsed body, serialization throws a `RangeError`; the generic handler catch reports HTTP **503 BACKEND_UNAVAILABLE**.

The original defect was a local reproduction of a handler path explicitly supported for Vercel's possible pre-parsing. The post-deployment check below subsequently proved the actual public route returns 400 for this exact wire payload; it does not identify which body representation Vercel supplied internally. The exception is caught; no process crash, excessive duration or unbounded allocation was demonstrated. Treat it as a P2/P3 input/error-classification defect rather than a launch-critical availability failure.

Implemented only in `web/server/browser-api.mjs`: catch serialization `RangeError` from the preparsed-body branch and return HTTP 400 `INVALID_INPUT`. Other exceptions retain their existing behavior. The 2 MiB limit, auth/quota ordering and malformed-JSON handling are unchanged; no recursive walker, early parsing, deadline or cancellation change was introduced. The production regression in `web/tests/browser-api.test.mjs` verifies both 20,028-byte deep forms return 400, perform exactly the existing Auth → identity → quota sequence, and perform no profile/tool mutation. An ordinary valid preparsed profile request still succeeds. The original 503 is retained here only as before/after evidence; executable audit expectations now require 400.

## Finite timeout/cancellation gaps, not unlimited hosted work

| Operation | Existing local timeout/bound |
| --- | --- |
| Auth user verification | 10 seconds (`supabase-auth.mjs:51`) |
| Identity resolution RPC | 10 seconds (`supabase-auth.mjs:27`) |
| Each normal database RPC | 15 seconds (`supabase-store.mjs:23`) |
| Artwork hydration | 3 seconds per deduplicated concurrent image (`supabase-store.mjs:111`) |
| Artwork upload/verification | 15 seconds per fetch (`supabase-store.mjs:75–78`) |
| Optional generation provider | 60 seconds and 6,000 output tokens (`study-generation.mjs:46–48`) |
| Workspace CAS attempts | At most five (`supabase-store.mjs:169`) |
| Public Vercel function contract | `maxDuration: 90` (`preview-deployment-contract.mjs:9`) |

The request does not have a shared application lifetime signal. Destroying a local IncomingMessage while its injected Auth fetch is pending leaves the upstream timeout signal unaborted; the request can continue until its existing timeout or completion. This was reproduced without a network. Sequential operations/retries do not share one remaining-time budget, though every inspected external operation has its own finite deadline and the public function has the 90-second host ceiling. This is P2 wasted work after disconnect, not a claim of unbounded live execution.

If chosen as a later patch, put cancellation composition at the handler's injected fetch boundary so Auth, RPC and generation preserve their existing timeout signals via `AbortSignal.any`. Keep manual/error redirect policy and credentials behavior unchanged. Detect an actually aborted/incomplete incoming request or a response closed before completion; **do not abort on every `req.close`** because Node can emit it when a request completes normally. Remove listeners/timers in `finally`; do not send a second response after closure. An abort during a commit is an unknown outcome, not proof of rollback; retain current idempotency, CAS and retry recovery.

Required focused tests before such a patch ships: premature disconnect aborts pending Auth/RPC fetches; a fully received request closing normally does not cancel its response; per-fetch timeout still works; a completed response cleans listeners; downstream abort errors emit no raw exception or credential; an ambiguous write still uses existing retry recovery. Use a local real HTTP stream for close behavior, plus the existing preparsed-body stub, rather than assuming Vercel lifecycle events.

The streaming `for await` at `browser-api.mjs:52` has no body-specific application timeout. A local stream containing only `{` remains pending until the caller ends it (the audit observed 250 ms and then deliberately completed it). Source establishes the absent body timer; the short test does not establish a live indefinite wait. Vercel may supply an already parsed body, and the configured function ceiling is 90 seconds. This is also P2 and host-dependent.

A body deadline should be a separately reviewed, generous upload budget for legitimate image uploads and slow connections, apply only while consuming an actual stream, stop the reader on timeout, and clean up handlers without prematurely destroying the socket before a controlled response can flush. A bare `Promise.race` that leaves the consumer running is insufficient. Test a stalled stream, slowly arriving valid sub-limit data, already-parsed bodies, client abort, and timeout cleanup with a local HTTP server. Do not choose an aggressively short timeout merely to make a synthetic test pass.

Node documentation was checked through its official JSON docs. [IncomingMessage completion/close semantics](https://nodejs.org/api/http.html#class-httpincomingmessage) and [AbortSignal composition](https://nodejs.org/api/globals.html#static-method-abortsignalanysignals) support the cautions above.

## Authentication-before-parsing is intentional; cheap headers are a distinct choice

The handler checks origin/method/config and bearer shape, then performs Auth verification, account resolution and account quota before reading/parsing JSON. A valid-token oversized `Content-Length`, wrong Content-Type, or malformed JSON therefore produces three upstream operations before its 400/413 rejection. Local injected-fetch tests confirm this exact sequence. No profile/tool mutation happens in those cases; normal identity/quota bookkeeping can still write on the real backend.

Do not call this ordering itself an authentication flaw: it prevents unauthenticated callers from triggering the application's expensive body parsing, and makes quota refusal take precedence over invalid content. Cheap Content-Length/media-type checks could be separated from full parsing, but moving their rejection before verified Auth or quota changes existing 401/429 versus 400/413 precedence. It is impossible to both skip those upstream calls and preserve every existing error-precedence case. The approved narrow iteration **keeps current auth/quota ordering** and fixes only preparsed serialization classification. Decide cheap-header precedence explicitly if it is later changed. Never move full JSON parsing ahead of authentication as an incidental optimization.

## Bounds confirmed or retained

- The advertised oversized body rejects before stream consumption; actual streamed bytes reject above 2 MiB even without Content-Length. Preparsed bodies and multibyte UTF-8 are checked by serialized byte count, not only character count.
- Artifact validation caps 200 cards, 100 questions, 8 choices and 20 accepted short answers. Local checks reject each over-limit array before traversing its contents. Notes cap 100,000 characters; plans cap 100 tasks.
- Generation source selection caps eight IDs, combined source 60,000 characters and instruction 4,000. Nine IDs reject before store/provider work in the focused test. Generation is separately configuration/quota gated.
- Community pagination caps 50 results. Practice checkpoints cap index maps to artifact size, serialize to at most 250,000 characters and retain at most 30 entries. Workspace sessions cap 12 records. The process-local request limiter caps 10,000 keys; account quotas are separately database-backed.
- Upstream JSON uses ordinary `response.json()` without an application byte-stream cap, and artwork checks its size after `arrayBuffer()`. These are finite-time requests to fixed trusted providers with workspace/bucket/output limits, not a reproduced public-input allocation bypass. Streaming byte caps would be defense in depth; no broad refactor is proposed from this audit.

## Local reproduction

Run with Node 22:

```sh
node --test creative/nooks-release/api-resource-boundaries.test.mjs
```

**9/9 audit checks passed** after updating the deep-JSON expectation to the corrected 400 response. The affected public browser API and operations suites also passed **19/19**; after extending the focused regression with an ordinary valid preparsed request, that regression passed again. Remaining deadline/cancellation observations are still evidence of current behavior, not claims of fixes. All upstream behavior is injected and uses fake credentials/`.invalid` hosts. No actual Auth-isolation or 100-user load test was repeated.

Reviewed public handler SHA-256: `a8231fbb53d6e8c74f55ecfc9da283d2e0f8e7a9d584320db22010c9531357d1`. Deployment contract SHA-256: `a66a5ecaa92618f8974b4202117ddb1bea1cf80a55c3b328ecc2e0dc49b05f30`. Line references and evidence apply to this audited source; later fixes should update expectations deliberately.

After the approved fix, public handler SHA-256 is `370fb13cd92bbf73046981bce81fa30061c5c9f4f645c46408f0f52c5f3ac972`. Exact files changed for the fix/evidence: `web/server/browser-api.mjs`, `web/tests/browser-api.test.mjs`, `creative/nooks-release/api-resource-boundaries.test.mjs`, and this report. No cloud/app source or deployment was changed by this worker.

## Narrow post-deployment verification

After root deployed `nooks-study-space-iebenwu3j-eeshpara-1663s-projects.vercel.app` to the stable public alias, the explicitly authorized one-fixture harness ran at **09:56:16–09:56:24 UTC**. Config returned 200 in 125 ms and authenticated workspace returned 200 in 393 ms. Using that same disposable initialized empty account, a 20,028-byte JSON profile payload with nested array depth 10,000 returned **400 `INVALID_INPUT`** through actual public Vercel HTTPS. Scoped reads before/after confirmed that fixture's display name/avatar were unchanged. This proves no profile/tool mutation for that invalid input; unchanged identity/quota bookkeeping can still write.

Global session revocation, account deletion and Auth deletion all succeeded; exact-fixture verification found zero account rows and Auth absent. The orphan throttle topic was handed to root for guarded cleanup. No broader smoke/load suite was repeated, no email was sent, and no persistent credentials were created. See [fixture result](operations/authenticated-probe-fixture-2026-10-08T09-56-16.062Z.json) and [content-free canary](operations/authenticated-probe-live-2026-10-08T09-56-16.062Z.json). The initial source audit and local tests used no production requests; this separately authorized check did.
