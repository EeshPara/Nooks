# Studio appearance apply: cancellation and stale room state

Local actual-source reproduction confirmed three reachable problems before the fix:

- Open a study editor with unsaved work, open Explore → Make a Nook without closing that editor, then choose Use this look. If the navigation guard is refused, App's callback returned normally without `space_customize`. Studio nevertheless displayed “Your study backdrop is saved.” The private draft may have saved, but the active appearance did not.
- Select a community, open Studio and apply a personal look. The selected community remained active and its title took precedence over the new personal name, even for a different scene. With the same gallery room, the future focus-start condition could still select that community.
- Enter an earned secret room, then apply a personal draft using the same base room. The base `currentRoomId` did not change, so the room-change effect never cleared the secret. Its image/title continued masking the saved appearance. The same problem applied to the earned-track overlay.

A pure Node reproduction evaluated the actual extracted App callback, Studio preview function and scene-image/name expressions with injected UI state. Navigation refusal made zero appearance calls yet produced the success notice; same-room success left the secret image/title; another-room success still showed the old community name. This is source-level reproducibility, not a claimed mounted-browser observation.

## Minimal selective change

Applied only the relevant lines in web, cloud and app; their other source differences remain intact.

- `NookStudioProps.onPreview` returns a boolean, synchronously or asynchronously.
- App checks that the presentation is current before navigation. Refusal/staleness returns false. A save failure still rejects through the existing error path.
- Only after `space_customize` resolves and the presentation remains current, App calls `live.select(undefined)`, clears secret room and earned track, resets the local active-draft selection, and returns home. This deselects the community without leaving membership or changing publication.
- Studio displays success only for a true outcome while the same presentation remains current. A save whose response arrives after close/account change does not navigate the newer view or claim success there. The underlying saved appearance may already have committed; no rollback is implied.
- Existing running focus identity/session is deliberately unchanged. This fix does not finish/cancel a timer or reattribute prior time.

The frontend agent's separate `draftAppearance` sanitization remains in place. No backend endpoint, schema, identity, provider or deployment was changed here.

## Verification

Seven actual-source callback regressions in each source target passed (21/21): refused navigation, initial staleness, save failure, deferred successful save ordering, presentation change while save is pending, post-callback staleness, and same-room image/title/future-selection cleanup while preserving running focus/membership. The callback tests execute the real source rather than a rewritten stand-in. TypeScript `--noEmit` checks passed separately in web, cloud and app. Frontend agent/root owns mounted browser acceptance and deployment.

## Integration check and separate reload caveat

The existing real creator/Storage/Studio/App/engine test fixture needed the newly referenced `live.select`, `setSecretRoom` and `setEarnedTrack` dependencies. All three copies now track those states and require the appearance save to finish before they change. Existing image reference, no-reupload, reopen and missing-image rejection assertions remain; additional assertions verify selection/overlay cleanup and preserved membership/running focus. Those nine affected tests pass across the three targets.

Independent review also found a distinct full-reload precedence risk when a community focus session is still running. `useLiveNooks` initializes selection from the unfinished focus session's nook ID before remembered selection. Thus after a personal-look apply clears the current UI selection, a full reload can reselect the old focus community and `sceneName` can again prefer its title. Recovering the original focus binding is intentional; using that recovered binding as the current personal scene title is a remaining UI coupling. This patch does not claim to fix that reload case, and no timer completion/re-attribution behavior was added. Root explicitly kept it outside this narrow transition patch for a separate selection-versus-focus recovery design.
