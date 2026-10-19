# Request-disconnect cancellation review — October 8, 2026

The public handler now cancels its injected upstream fetches when its Node request/response actually disconnects. This is **locally verified handler hardening, not verified hosted Vercel cancellation or measured provider/compute savings**. No deployment, provider configuration, real credentials, production fixture, schema or policy change was made.

## Change and preserved behavior

`web/server/request-lifetime.mjs` owns one request AbortController and three listeners. `request.aborted` or an incomplete `request.close` (`complete === false`) cancels it; `response.close` cancels only before `writableFinished`. An already disconnected request is rejected immediately. A normally consumed request can be destroyed/closed while its response is still pending, so neither request closure nor destruction alone is sufficient evidence. The helper removes only its own listeners in the handler's `finally`, including early returns and failures. Lightweight preparsed test adapters with no event APIs remain supported.

Each fetch receives `AbortSignal.any` combining this lifetime with its existing timeout signal. Input/init methods, headers, body and redirect behavior remain unchanged, and a Request object's signal is retained when init does not supply a signal. Explicit `signal: null` retains fetch override semantics. A preflight abort check blocks subsequent network requests even when a caller caught an earlier abort; a post-fetch check handles injected transports that resolve despite cancellation. The composed signal remains attached to native fetch while response bodies are consumed, rather than being removed as soon as headers arrive.

The public handler suppresses response writes and operational failures only after confirmed disconnect or an already destroyed/ended response. Connected clients retain normal errors, including existing timeout 503s and bounded redacted diagnostics. Optional artwork hydration deliberately catches read failures to preserve study work; its degradation callback is therefore separately suppressed on disconnect. Auth → identity → account quota → body validation ordering, all timeout durations, body limits, CAS attempts, idempotency/retry handling and credential boundaries are unchanged. No body deadline was added.

An aborted database commit, artwork write or generation request **may already have succeeded remotely**. Cancelling its transport does not prove rollback, database transaction cancellation, refunded generation, or exactly-once execution. The existing revision checks, idempotency and recovery behavior remain authoritative. This patch sends no rollback/cleanup commands and adds no automatic replay.

## Local evidence

Node 22.17.1, fake credentials and loopback HTTP only:

- Incomplete real HTTP uploads disconnected while Auth or quota RPC was pending: upstream signal aborted; no later fetch, response write or outage log.
- Fully consumed preparsed request closed normally while quota RPC remained pending: no cancellation. A later client socket closure cancelled the pending response work.
- Delayed normal RPC after request close: one HTTP 200 response, existing call order and no cancellation.
- A real native fetch received upstream headers but an incomplete JSON body: client disconnection aborted body consumption and closed the loopback upstream connection.
- Existing requested Auth/identity/RPC timeout values remained 10,000/10,000/15,000 ms. The test shortened only the test clock for the pending RPC timeout; the connected client retained HTTP 503 and one redacted timeout log.
- Original abort reason, Request/init fetch options, existing listeners, absent event-API stubs and already-ended response behavior were preserved. Listener cleanup ran after normal and cancelled requests.
- An injected transport ignoring abort could not trigger another fetch or a response. A caught private-artwork hydration abort emitted neither degradation nor response.

Focused cancellation suite: **11/11 passed**. Final combined browser API, operations and cancellation suites: **30/30 passed**; `git diff --check` passed. Existing browser API tests exercise stale revisions and idempotent focus/generation retries. These are regression checks, not new hosted isolation/load evidence.

```sh
node --test web/tests/browser-api.test.mjs web/tests/operations.test.mjs web/tests/request-cancellation.test.mjs
```

The earlier `api-resource-boundaries.test.mjs` destruction observation uses a generic Readable lacking IncomingMessage `complete`/`aborted` semantics and a response without lifecycle events. It remains evidence only about that minimal stub, not a current real HTTP disconnect test; the actual lifecycle cases above supersede its old disconnect conclusion. The earlier audit's missing body deadline remains unchanged.

## Hosted limitation and next gate

Independent review identified a necessary distinction: Vercel documents request cancellation as opt-in with `supportsCancellation`, and exposes the cancellation through a Web Request signal. The current prebuilt contract has `launcherType: 'Nodejs'` with a default Node-style `(request, response)` handler; neither its function nor project config enables this opt-in. No hosted propagation is inferred from local Node socket events. [Vercel cancellation documentation](https://vercel.com/docs/functions/functions-api-reference#cancel-requests)

The documented opt-in can terminate the function and discard unfinished work unless it uses the platform's background-work mechanism. Enabling it is therefore broader than this fetch-wrapper patch. A separate review must establish the precise prebuilt adapter/config contract, define required completion versus cancellation behavior for writes, and verify actual hosted signal delivery before any opt-in/config change. This iteration deliberately does not change the adapter, provider setting or deployment config. [Vercel announcement](https://vercel.com/changelog/node-js-vercel-functions-now-support-per-path-request-cancellation)

Root and independent grader were notified of this hosted limitation before review completion. This patch alone must not close the public-host cancellation readiness gap.

After root deployed release `f2z3aj98o`, the normal connected-client canary passed at 10:33:08–10:33:17 UTC: workspace 200/365 ms and empty authenticated draft list 200/368 ms, using one disposable fixture subsequently revoked/deleted and verified absent. See [fixture evidence](operations/authenticated-probe-fixture-2026-10-08T10-33-08.718Z.json). This is a normal-path regression check only; no hosted disconnection was induced or measured.
