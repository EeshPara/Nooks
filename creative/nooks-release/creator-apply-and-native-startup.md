# Studio apply and delayed native initialization

October 8, 2026. Narrow source fixes, selectively ported to web/app/cloud. Native host screenshot resolution is not established by these changes.

## Studio saved artwork apply

The real stored-draft → preview → Studio → App → engine chain carried the private `_storedBackground` reference inside `space_customize`. The strict engine correctly rejected this extra property with `INVALID_INPUT` and committed no workspace update. Both legacy and generation-qualified stored artwork references reproduced the failure in an in-memory fixture using the real SupabaseStore, NookCreator and StudyEngine.

Studio now constructs the public appearance fields explicitly: name, tagline, theme, room, accent, companion, layout, decorations and optional hydrated backgroundImage. It preserves the pixels and leaves backend input validation strict. The actual extracted Studio preview and App apply callback regression proves successful apply and re-read for both reference formats without uploading a duplicate artwork object. A gallery case clears an existing custom image; a missing-artwork case refuses apply without a workspace commit. These are local contract tests, not authenticated browser upload proof.

## Late native host acknowledgment

Previously the 4-second `ui/initialize` timeout removed its pending request ID. A valid later host reply could no longer initialize the bridge; subsequent explicit tool retries failed until reload. A fake-parent bridge reproduction confirmed this before the fix.

The original caller still fails after 4 seconds. The bridge retains only that initialization ID for a further bounded 30 seconds, allowing one valid matching parent reply to establish the connection for a later explicit retry. No tool operation is automatically replayed. Direct-parent source, pinned origin and matching-ID checks remain in force; teardown and grace expiry invalidate the late acknowledgment. Normal and late initialization share the same object-shape validation.

Tests cover recovery through a later explicit read, no replay of a previously failed write or a completed legacy fallback, wrong source/origin/ID, malformed/error responses, duplicate acknowledgments, grace expiry and teardown.

## Verification and limits

Each target passes 39 focused tests across bridge app-tools, Studio apply/publication, account guard and save focus, plus TypeScript. The selective Studio port touches only appearance construction and its use; unrelated app/cloud/publication differences remain intact. No App, backend schema or authentication behavior is changed by these two fixes.

The isolated local harness at `http://127.0.0.1:5196/` loads the exact final cloud `dist/client/widget.html` as iframe srcdoc and displays its SHA256 and byte length. The parent offers immediate, 6-second-delay and absent initialization replies, mounted view-state inspection and teardown. Only simulated in-memory workspace/session/list responses are provided; unsupported mutations fail. This exercises the actual bundled app with a simulated host, not ChatGPT's real resource delivery, CSP, account identity or tool transport. Root owns browser acceptance and final build evidence.

The native resource protocol fields match the current [official app quickstart](https://developers.openai.com/plugins/build/app-quickstart) and [reference](https://developers.openai.com/plugins/reference). No documented host resource-size limit was found. Root's separate serialized-resource budget/font packaging change is an independent bounded packaging measure; HTTP 200 resource logs and local harness success alone cannot prove the user's native screenshot is resolved.
