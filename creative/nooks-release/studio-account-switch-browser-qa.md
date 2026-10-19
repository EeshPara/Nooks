# Studio account-change guard — mounted browser acceptance

October 8, 2026. Root operated Chrome through CUA at `http://127.0.0.1:5194/`. The isolated fixture imports the actual Studio component and the current App account-change handler under React StrictMode. Account transitions and tools are simulated in memory. No real account, email, authentication configuration or hosted data was used. This is mounted UI evidence, not live sign-in acceptance.

The initial source candidate blocked hidden text edits but missed an untitled appearance-only change. Independent review caught that before acceptance; the final dirty check compares the full draft payload with its stable pristine baseline.

Observed cases:

- An untouched draft permits a simulated account change.
- Choosing Watercolor without entering a title, closing Studio, and attempting an account change reopens Studio with the chosen style intact. The transition stays blocked; the save/discard guidance is visible.
- Discard opens an explicit confirmation. Keep editing retains the changes and restores focus to Discard unsaved changes. Confirmed discard resets the new form and permits the next account attempt.
- A simulated save failure leaves `QA guarded draft` on screen, reports the failure and retains the account guard. Save remains available for retry.
- A held save can be hidden. An account attempt while that save is pending reopens Studio, retains the title and disables discard/save controls. The account attempt remains blocked.
- After the held save resolves, the next account attempt succeeds and exactly one in-memory saved record exists.
- Editing the saved `QA pending guard` title, then explicitly discarding the edit, retains its original Version 1 record. The new blank form focuses Nook name. Reopening the saved record restores the exact original title; a clean account attempt is allowed.

The browser rejected an intermediate candidate: after the busy Studio reopened under StrictMode, Close did nothing. StudioSurface installed its dismiss ref during render, but effect cleanup cleared it and development effect replay did not reinstall it. The narrow correction installs the ref in effect setup and clears only its own handle. The final mounted held-save → close → blocked account attempt → reopen → close → resolve-save → allowed transition sequence passed. The failed candidate is not counted as accepted evidence.

The browser also found focus falling to the page after canceling or confirming the new discard flow. The final candidate restores Discard focus on cancellation and Nook name focus after confirmed discard, guarded by the current owner, opening, topmost dialog and current focus. Both were observed in the DOM and accessibility tree.

Hot reload intentionally reset the isolated in-memory fixture between fixes. Final busy-save and saved-record preservation checks ran after the last lifecycle correction with source frozen. A transient browser command timeout occurred before dispatch; fresh state showed no action had occurred, and the subsequent direct action succeeded. It is not reported as a product defect.

Limits: real email/code delivery, signed-in logout, cross-tab automatic account changes, owner-session expiry, actual artwork import/cancellation and native iframe behavior were not exercised here. Source tests cover additional ownership/cancellation conditions. Existing public onboarding remains blocked by the separate SMTP dependency.
