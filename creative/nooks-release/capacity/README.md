# Bounded distinct-identity hosted verification

`verify-capacity.mjs` is a finite, explicitly authorized experiment against the existing Nooks Supabase project `lcfcjglybfeozyrjjikk`. It does not edit product code, deploy, change quotas, purchase upgrades or send email.

Run with Node 22 and the signed-in Supabase CLI:

```sh
node creative/nooks-release/capacity/verify-capacity.mjs --run-authorized-100
```

Fixed bounds: 100 distinct admin-confirmed temporary Auth identities/account mappings; one private room with membership acquired through bounded invitations; 100 WebSocket connections, each subscribing to the directory, its own account and the private room; two-minute mixed snapshot/presence workload scheduled at eight API requests per second; a few profile writes; ten sequential disconnect/reconnect exercises. API starts are globally spaced at least 90 ms apart. Password-grant setup is spaced at least 2.5 seconds apart to respect the documented `/auth/v1/token` bucket of 150 requests per five minutes, burst 30; no IP forwarding or quota changes are used. The test checks Auth/DB health before creating fixtures and stops the workload if cumulative error rate exceeds 2% or p95 exceeds five seconds after 20 observations. Channel failures stop the run. It never automatically increases the bound.

The HTTP path is a local process running the real `web/server/browser-api.mjs` with hosted Auth and DB calls. WebSockets go to real hosted Realtime. This deliberately does not establish Vercel routing, public email delivery, browser rendering, real UI convergence or 1,000-user capacity. Fixture confirmation bypasses email to avoid sends. The final report names these limits.

Credentials are retrieved into memory and never printed or written. Nonsecret exact fixture UUIDs and private throttle topics are checkpointed during setup so an interrupted run can be cleaned up without broad deletion. Cleanup disconnects sockets, deletes only this run's room/account/user fixtures, revokes sessions and verifies room/account absence. The private throttle table is not exposed through the Data API; its exact account/room topics are reported for separate SQL cleanup, preserving the shared directory topic. Never delete fixtures by a broad email pattern or alter unrelated accounts.

Successful measured workload and complete cleanup are separate requirements. Retain failed reports with their phase: sandbox/credential retrieval failures before any fixture is created are infrastructure startup failures, not product capacity measurements.

The current harness performs the ten reconnects sequentially and pauses API scheduling during that phase. Therefore the two-minute workload window is wall time, not an uninterrupted two-minute plateau; the report's reconnect duration must accompany throughput claims. See `results-2026-10-08.md` for the successful run and its exact limits.

Documentation checked for fixture and subscription APIs: [Supabase admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Realtime schema lockdown](https://supabase.com/changelog/realtime-schema-locked-down-against-modification). This harness uses supported clients and does not modify the Realtime schema.
