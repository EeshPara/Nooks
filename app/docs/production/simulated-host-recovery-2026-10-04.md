# Simulated native-host recovery checks — October 4, 2026

These are browser tests of the actual built widget inside a **local simulated MCP Apps host**, with a temporary JSON store and two synthetic verified identities. No hosted data, credentials or native user session was used. The harness is `scripts/native-host-harness.mjs` with its adjacent HTML controls; start with Node 22 after `npm run build`. It binds only loopback, rejects foreign origins, creates disposable fixtures, and removes them on SIGTERM/SIGINT. Production tooling does not expose its fault controls.

## Observed results

- Deployed baseline widget: simulated checkpoint save failures left the selected answer visible. Replacing the iframe, then opening the same quiz, recovered the same answer, elapsed time and option order. Restoring the connection and pressing Retry persisted it. Switching to the other synthetic account with identical artifact IDs started an unanswered quiz; the other owner's recovered choice did not appear.
- Final reviewed native build `index-CaaZPUhP.js`: injected cached account A workspace revision999 and note through the legacy initial-result channel while the fresh workspace call authenticated account B. Only account B's two items appeared in Library. The stale note was not opened.
- Final build: sandboxed the iframe without allow-same-origin, blocking browser storage. Simulated failed note saves, wrote a distinct account-B draft, then supplied malformed decoration data through the host result channel to cause a real React render exception. The app showed a generic recovery screen, with no exception details or private sentinel.
- Pressing Reopen nook kept the same document and recovered the exact unsaved note. Re-enabling saves and using the note's Retry persisted the text in the synthetic server; the UI showed Saved. The storage-unavailable warning remained accurate.

Screenshots: [recovered note](simulated-note-recovery-oct4.png), [account-isolated library](simulated-account-isolation-oct4.png).

## Limits

The host bridge, iframe sandbox and errors are simulated. This does not prove actual ChatGPT/Codex persistence across native tab close/reopen, actual host identity transitions, two real users, managed database behavior, or production load. In-memory fallback protects a caught render failure within one document; closing/reloading that document while storage is blocked can still lose unsaved work, which is why the interface warns users to keep it open or download writing. The real native-host failed-save/reload gate remains open.
