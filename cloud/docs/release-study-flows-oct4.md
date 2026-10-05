# Study flow hardening — October 4, 2026

Scope: runtime UI and focused regression tests in the primary `notable-ai` checkout. The existing design and styles were preserved. No paid generation calls, account mutations, user-data deletion, deployment, or cloud-source edits were performed by this agent.

## Fixed

- **Failed practice checkpoints survived only inside their original component.** Pending positions and answers now remain in an account-scoped tab recovery store before a request is sent. Reopening the same saved artifact waits for outstanding writes, permission-checks the saved item, and recovers the latest pending answers. Invalid or stale-revision checkpoint shapes cannot open a broken player. Successful acknowledgements remove only the exact snapshot that was submitted, preserving newer answers.
- **Completed practice results were lost on reload.** Results now retain the original session ID and raw answer/rating/match evidence in tab storage and retry from the originating account. Only a response with the matching confirmed session and artifact removes the pending event. Concurrent flushes share one submission; server-side deduplication remains authoritative.
- **Account switches could cross asynchronous boundaries.** Browser tool transport checks the originating account before sending and after parsing the response body. Result retry loops check their mounted owner before every queued send and after every response. An account change leaves the old owner's recovery intact instead of sending the next result through a different account.
- **Native recovery lacked a trusted storage scope.** The backend agent added a proof-bound `recoveryScope` in private widget metadata. The UI installs it only from its authenticated `workspace_get` response, before rendering study content. Initial load, Retry after a failed first load, and explicit session navigation refresh all use the same verified loader. Notes, checkpoints, results, and study-set editor drafts then use that account scope. Unverified native/demo context remains memory-only for practice/editor recovery and does not write private content under a guessed browser account.
- **Study-set edits could be dropped by navigation or repeated submissions.** The editor now protects dirty navigation and browser unload, requires an explicit discard for Cancel, and immediately guards duplicate saves. Drafts recover in the originating tab/account. Native chat navigation waits until the editor closes. A revision conflict keeps the original saved set and offers an explicit **Save as new set** action using a stable new ID on retry.
- **Plan replacement requests omitted the loaded workspace revision.** All plan writes now send `expectedRevision`. A conflict reloads the latest workspace, retains the form, and requires an explicit retry; it never silently resubmits a stale whole-plan array. Browser and native errors preserve structured conflict metadata.
- **Unconfirmed artifact saves could be displayed as successful.** The app now requires the requested saved ID and a confirmed revision before closing the editor or reporting a successful save.
- **Browser generation could become enabled through a capability flag.** The unused direct `/api/generate` UI callback was removed. Existing native ChatGPT generation, explicit browser handoff, and manual creation remain; server generation routes were not altered.

Recovery storage handles prototype-looking artifact IDs safely, retains prior work on quota failure, and refuses more than 2 MiB or 500 pending entries without silently evicting another unfinished item. These limits produce a visible keep-open warning. Storage is tab-scoped; it is not advertised as a cross-device backup.

## Verification

- Initial full UI baseline: **181 passed**.
- Final full UI run after recovery retry, adaptive polling, and copy-resolution changes: **210 passed, 0 failed**. Output: `/tmp/nooks-study-flows-ui-tests-oct4.txt`.
- Last editor/navigation protection and copy-resolution checks: **4 passed**, including stale revision, failed copy retry, stable copy ID, preservation of the original revision, and duplicate submit protection.
- TypeScript passed after the final follow-up changes.
- The release judge independently ran **40 focused account/bridge/recovery/plan checks** and reviewed the account-response race, acknowledgement race, prototype names, quota limits, and verified native scope flow.
- Existing note queue tests passed for typing during a save, revision conflicts, empty saved notes, recovery after account changes, and unconfirmed save responses. Existing quiz/flashcard scoring, source selection, complete material reading, and same-tab navigation tests remain in the full passing run.

These tests exercise real extracted runtime functions/hooks and controlled transport/storage failures. They are not a claim of native host browser verification.

## Remaining evidence boundary

The root agent must exercise native iframe `sessionStorage` retention across reload, including a deliberately failed note/checkpoint/result save, using the newly deployed private account scope. Source tests prove isolation and recovery behavior when storage is available; they do not prove the actual host allows or retains that storage. Browser restrictions or exhausted storage leave visible warnings and in-memory work, so refresh durability cannot be called verified until that host check passes.

The native ChatGPT generate → save → present loop, current host schema, actual question/exam interactions, and deployed two-account isolation are root/backend verification responsibilities. No mocked callback is counted as a completed native generation or database save.

An initial load failure keeps saved study content from becoming editable until the full workspace is verified. Retry installs its recovery scope and restores pending work without reopening the view. Repeated workspace refreshes preserve the active queue; a different verified account cannot rebind it. A direct retry control remains available even if the error banner is dismissed.

## Follow-up polling review

The native fallback session channel already stopped network requests while hidden and avoided overlapping reads. It previously polled every 2.5 seconds indefinitely while visible. After three unchanged reads it now polls every 5 seconds, reducing steady idle session polling from about 22–24 to 11–12 requests per minute. Registration renewal remains every five minutes. Navigation and foreground wake reset the faster cadence; a foreground wake checks immediately. Direct app-tool presentation remains immediate and does not wait for polling. The fallback detection interval is at most 5 seconds plus up to 250 ms jitter and network latency; error backoff and Retry-After intentionally take precedence.

Simulated ten-minute idle runs made at most 126 session calls including renewals. Fourteen controller checks passed, covering idle cadence, fallback delivery, hidden silence, wake, stale replies, expiry, rate limits, and direct presentation. Six recovery-loader tests cover initial Retry, pending queue retention, rejected account rebinding, incomplete/unmounted responses, verification before pending-result retries, missing native account scope, and the actual session-controller → loader path when chat navigation reconnects after the first load failed. A native Supabase workspace remains noneditable until its private recovery scope is valid. The final 20 recovery/controller checks and TypeScript passed after that fail-closed assertion.
