# Local fanout admission correction

Prepared after the incomplete `11-32-55.475Z` soak. No hosted execution belongs to this correction. Both failed reports are preserved.

## Cause and change

A deterministic event-loop simulation executes the actual extracted scheduler/fanout with the shared HTTP gate, 100 fixture members in five rooms, eight initially pending reads and fixed 300 ms responses. The previous eight-pending scheduler and one-second settling observation exhaust the 15-second fanout window. Keeping the same gate, response speed and deadline, the corrected scheduler completes all five room measurements.

During a controlled mutation quiet window, at most one foreground snapshot may be pending (queued or active). Previously the scheduler could keep eight ahead of background profile writes in the FIFO. Reads still continue; there is no priority bypass, catch-up burst, raised cap or added connection. Ordinary scheduling returns to eight pending requests after the window. The shared gate retains its minimum 250 ms start gap, eight-active ceiling and every existing request cap. The observed request rate may fall during quiet windows; final statistics must report that actual rate rather than claim a continuous four requests/second.

After draining the initial pending requests, the harness waits at least 2.1 seconds to clear the deployed room invalidation throttle (two seconds in `cloud/supabase/migrations/20261008061921_realtime_invalidations.sql`), and also requires one second without room hint movement. The existing three-second settling limit and whole-window 15-second deadline remain unchanged. This accounts for throttling after completed fixture writes; it does not establish causal delivery for arbitrary late or duplicated hints. The existing inconclusive classification for unrelated room movement remains. A fresh heartbeat-margin check after settling ensures no fixture is already more than 55 seconds since its last heartbeat before controlled writes begin.

Public request samples now include queued time, actual admission time, queue wait, request timeout budget and remaining quiet-window budget. A timeout from the specifically clipped quiet-window AbortSignal records `fanout_quiet_deadline`; ordinary network errors remain safely classified without exposing provider messages. Admission after the quiet deadline records a zero-budget failure and performs no fetch. Normal calls retain their 15-second timeout. No cancellation implies rollback: the final profile write may have committed before its local timeout.

## Local evidence

All 36 focused tests passed, including the original bounds/cleanup/channel/final-result suites. Five new tests cover the saturated legacy failure, corrected full five-room completion with reads continuing and paced starts, heartbeat margin rejection, safe clipped-timeout telemetry, and expired admission/ordinary timeout behavior. The actual simulation demonstrates that a failed measurement exits mutation quiet mode, drains work and still admits cleanup. Existing late-callback/final-result and exact-fixture cleanup regressions continue to pass. The prepared-only invocation exits before credentials or networking.

The queue test also asserts each controlled write waits at most 500 ms for admission, all five measurements finish inside 15 seconds, no heartbeat deadline is exceeded, rate spacing remains at least 250 ms and cleanup remains separately admitted. These bounds describe the deterministic injected conditions, not a hosted latency guarantee.

## Smallest optional hosted proof proposal

Not implemented or authorized by this note. If a hosted confirmation is desired before another full soak, use five disposable identities, each the sole member/owner of one private curated room, five sockets and 15 channels. Reuse the fixture journal and cleanup guards. After initial presence, seed eight bounded snapshot requests, then execute one full five-room controlled fanout while the corrected scheduler continues reads. Record actual admission delays, budgets and hints, then verify each authorized room still contains its sole member and zero focus credit. Compare start/end release identity against whichever public release root freezes next.

Suggested upper bounds: three-minute work ceiling, one 15-second quiet window, 100 public starts, 10 Auth/admin starts, 60 cleanup starts, three-minute cleanup ceiling; existing 250 ms global spacing, eight-active ceiling and 2.5-second Auth-grant spacing. Cleanup all five sessions/accounts/Auth identities/rooms, verify absence, hand off ten exact throttle topics. No public rooms, email, artwork, storage, provider changes or full load. This only proves admission and five-room notification behavior at small scale; a later 100-user soak still requires separate authorization and the newly frozen release identity.
