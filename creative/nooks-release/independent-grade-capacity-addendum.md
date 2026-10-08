# Independent grade addendum — October 8, 2026

**Product quality: 7/10, still provisional. Public production readiness: 5/10, broad launch not established.** Scores describe current evidence, not a release approval.

Since the prior updated grade, I independently inspected the inactive-audio release fix and heartbeat jitter, ran their 13 focused regression checks successfully, inspected the revised community status footer, and executed the bounded real-service capacity verification. I did not implement product code, deploy, perform listening review or independently operate the browser/native UI.

Closed or improved findings:

- Inactive audio now fades, stops/disconnects and releases decoded buffers after 5.2 seconds. Stale fetch/decode results cannot reinstate old players. The source and regression checks address the reported accumulation. Actual browser memory profiling remains unperformed by this grader.
- Presence heartbeat cadence now includes 45–55-second jitter; its regression passed.
- Community footer no longer promises an incorrect 20-second cadence. It displays automatic updates, a last-checked timestamp and explicit refresh-needed text on error. Actual hosted UI freshness still needs acceptance.
- All three inspected source manifests now contain 48 motion entries. This is substantial progress and source parity, not fifty completed/deployed/reviewed assets.
- The bounded hosted experiment successfully exercised 100 distinct Auth/account identities, 100 WebSockets, 300 private channels, 869 API operations with zero errors, and ten reconnects. API p95 was 706 ms. Both pre/post profile invalidations reached all 100 room subscribers. See `capacity/results-2026-10-08.md` for exact scope, measurements, prior harness failures and cleanup.

The capacity experiment's 120.414-second wall window includes an 11.034-second pause in API scheduling during sequential reconnects. It is neither an uninterrupted two-minute plateau nor evidence for 1,000 users. The Auth/database and WebSockets are hosted; the HTTP handler is loopback. Admin-confirmed accounts bypass email. These limits prevent using this test to close public onboarding, deployed frontend/backend acceptance or full capacity requirements.

Root's local browser QA report separately records actual device-mode note autosave/reload, quiz completion and saved results, focus credit, onboarding, room selection and sound control behavior. It explicitly predates the final media/resource build and does not claim authenticated public/native acceptance. That supports product confidence within its scope; this grader did not repeat those UI actions.

Remaining launch priorities are unchanged: working public account/email onboarding, final fifty-scene motion and genuine listening review, exact final deployment verification on public and native surfaces, declared freshness/capacity targets tested on the actual deployed HTTP path, and hosted recovery/monitoring/operator acceptance. A native owner-private app and device-local public preview remain distinct from a public multi-user launch.
