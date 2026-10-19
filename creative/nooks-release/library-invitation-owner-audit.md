# Shared-library invitation lifecycle — separate source concern

Read-only finding, October 8, 2026. No fixture, browser experiment or implementation.

`App.tsx` renders `LibraryInvitation` beside, rather than inside, the owner-keyed `WorkspaceApp`. `LibraryInvitation` renders `SharedLibraryRoom` without an owner/share key. In `organization/LibrarySharing.tsx`, the room keeps data/selected/draft state in ordinary useState; its owner/share change effect clears that state only after a render. The render uses `data.share.title` even when signed out, and uses the prior data/materials whenever the current account is signed in.

Consequently an Alice→Bob signed-in transition can render Bob's account status with Alice's previously loaded sharing data before the clearing effect runs. This is a source-level stale-render window, not proof of a visually observed production leak. Normal tool transport already rejects requests that cross an account change, including changes during JSON parsing; that does not clear data already installed before the switch.

There is also a concrete same-owner stale-request sequence: while an initial request for shared room A is pending, change the URL hash to room B. Cleanup sets the reusable `live.current` false, but the next effect immediately sets the same ref true. A later A response can then call setData after B has become current. The heading/material list can describe A while refresh/save/comment closures use B's shareId. Server authorization still applies; no bypass or unintended write has been demonstrated. Existing browser transport owner-race tests do not exercise share-target changes within one owner.

Smallest separate correction to assess: owner-and-target keyed room content (keep the invitation URL controller separate), plus a per-effect closure/request generation and immediate render owner/target gating where retained state is necessary. Preserve explicit unsaved shared edits before deliberate target changes rather than simply remounting and dropping them. Add deferred A→B success/error tests and a mounted owner-change render test. This is outside the current Studio account guard patch.
