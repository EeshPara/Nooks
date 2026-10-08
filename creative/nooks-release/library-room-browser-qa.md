# Shared-library lifecycle — mounted browser acceptance

October 8, 2026. Root used Chrome through CUA at `http://127.0.0.1:5195/`. The isolated fixture mounts the actual LibraryInvitation and SharedLibraryRoom components under StrictMode, substitutes simulated account/tool imports through its local Vite configuration, and adds explicitly labeled QA controls. No real account, invitation, email or hosted data was used. This verifies mounted component behavior, not public authentication or backend sharing authorization.

The fixture initially rendered blank because its own controls lacked a React import. Browser console evidence identified that setup error; the import was corrected before product testing. No product defect was inferred from it.

Accepted frozen-source journeys:

- Hold invitation A's initial reads, open B, then release A: B's heading and materials remain. Repeating with rejected A reads leaves B intact without a stale error.
- Change the simulated account from qa-alice to qa-bob: the heading and material list belong to Bob. Expire that session: the heading becomes Shared files, private materials disappear, and the sign-in message appears.
- Create an unsaved note in A, enter a title/body, and open B: the URL returns to A, exact edits remain, and guidance explains saving/canceling before reopening the other invitation.
- Fail a save: the error appears and title/body remain editable. Retry with a held save, then open B: the current room and pending work remain. Release the save: the new material appears with the exact title/body. Opening B then succeeds.
- Enter a comment on note one: material switching, editing, adding/copying material and refreshing are disabled. Opening A keeps the current B invitation and comment intact. Closing waits while the unfinished comment remains.
- Send the comment with its request held: the comment and selection stay fixed. Release it: the previously requested close completes. Reopen B and note one: the comment is present. Select note two: the comment does not appear there.
- Start another held comment as Bob, switch to Alice, then release Bob's response: Alice's heading/materials remain; Bob's pending text is absent from Alice's view.

The last case establishes rejection of a late response in the mounted fixture. It does not imply that an already-authorized server write can be rolled back after an account change. Automatic account changes also do not gain a new cross-account draft recovery mechanism here.

The deliberate invitation guard retains the existing URL until work can safely be left; the user reopens the other invitation afterward. Ordinary source/type tests cover additional picker, refresh, save and effect-cleanup paths. No real email/code journey, native iframe, shared-room server mutation, physical-device performance or broad sharing sign-off is claimed.
