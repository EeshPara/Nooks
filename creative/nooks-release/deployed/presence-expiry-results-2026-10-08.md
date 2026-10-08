# Real-clock presence expiry and return

The public deployed backend passed the two-account inactivity/return check on 2026-10-08, 08:37:36–08:39:28 UTC. Earlier smoke coverage established immediate presence and explicit leave; it did not establish real-clock expiry.

The SQL online rule is `last_seen_at > server_now - interval '90 seconds'` for members whose `left_at` is null. The later scaling migration suppresses redundant presence timestamp writes within 15 seconds. This test did not alter timestamps or use a test clock.

Two newly created admin-confirmed `example.invalid` accounts joined one private fixture room. After both were online, the second account made no requests until the return check; only the first account continued heartbeats. Actual deployed API snapshots showed:

| Observation | Elapsed since inactivity started | Members | Online | Inactive account online |
| --- | ---: | ---: | ---: | --- |
| Initial | 0 s | 2 | 2 | Yes |
| Active heartbeat | 30.758 s | 2 | 2 | Yes |
| Active heartbeat | 60.637 s | 2 | 2 | Yes |
| Inactive expired | 95.609 s | 2 | 1 | No |
| Returning heartbeat | 96.672 s | 2 | 2 | Yes |

At the expiry observation, the inactive member's stored timestamp was unchanged and its server-clock age was 96.351 seconds. Its membership persisted with no leave. All snapshots showed zero shared focus credit, and both personal workspaces still had zero focus minutes and no focus sessions afterward.

Only 18 public API requests were made. The public HTML SHA-256 and entry asset references matched before/after: `c32271aa0236082fab3477700ae78292e32b31f3f016a8a409f3d9ff7cb25f91`, `/assets/index-DECl8W_L.js`, `/assets/index-BcKeIWXw.css`. These identify the sampled page content, not an independently queried Vercel deployment ID.

All owned room/account/Auth deletions and session revocations succeeded. The final scoped queries found zero accounts and rooms. Root subsequently removed all three exact private fixture throttle topics using guarded SQL that required the corresponding account/room to be absent. Shared `nooks:directory` was preserved. The timestamped report records this completed cleanup.

This proves backend expiry on a subsequent snapshot and restoration through a normal heartbeat. It does not prove browser visibility timing, automatic expiry broadcasts, a suspended mobile browser, email onboarding, or large-scale behavior. Read-oriented workspace GETs may still perform normal identity/quota/legacy-hydration bookkeeping.

Evidence: `presence-expiry-2026-10-08T08-37-36.566Z.json`. Reusable explicitly gated harness: `verify-presence-expiry.mjs --run-authorized-two-fixtures` with Node 22. Credentials remain in memory; only exact fixture IDs and bounded outcome evidence are checkpointed.
