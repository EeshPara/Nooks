# Deferred editor browser acceptance — October 8, 2026

## First candidate: rejected before deployment

Built entry `index-CVjk1kj5.js`; editor `NoteWorkspace-2gOYbzpw.js`. Local QA proxy at127.0.0.1:5191 forwards the device-only built preview at5190 and returns503/no-store for exactly the first editor module request. No production response or real account was changed.

1. A fresh disposable local profile completed onboarding. Library → New material → Paste material received the exact sentence `Recovery fixture: keep this exact sentence when the editor download fails.` → Write a note. The local fallback displayed **Note couldn’t load**, Try again and Back to library.
2. Back to library raised the expected **Leave without saving your note changes?** confirmation. Browser automation could not dismiss the JS dialog because its focus-emulation command timed out. Cancellation was therefore not verified; the tab remains a disposable QA tab, not user work. Other tabs remained controllable.
3. The proxy was restarted and a fresh tab opened an existing seeded note. It again displayed Note couldn’t load. Clicking **Try again** returned the same error. The local server counter remained `{injected:1,editorRequests:1}`. No second request reached the server.

This disproves the mocked-loader/SSR inference that replacing React.lazy is sufficient: Chrome retains the failed native module URL. The candidate was **not deployed**. The independent reviewer changed its acceptance to BLOCKED, and a narrowly bounded loader correction is being evaluated. Existing public/native releases remain intact.

## Replacement: actual browser recovery passed

The replacement emits `/assets/study-content-CAoZffAd.js`, with both note surfaces and all deferred editor dependencies in that one module. Its only static dependency is already part of the initial graph; styles remain eager. A build gate enforces these properties. On a failed import, the allowlisted loader adds its own retry query to request a fresh module URL. No eval, blob, runtime source rewriting or page reload is used.

- Restarted the one-shot local proxy and reloaded the disposable profile into the replacement build. Opening the existing seeded note produced Note couldn’t load. **Try again opened the complete editor in the same page**; title/content and Saved were visible. Counter changed to `{injected:1,editorRequests:2}`.
- Replaced the disposable seeded note content with `Recovered editor: typing and autosave still work.`. Saved appeared. Library showed the updated8-word note; reopening preserved it. A full reload followed by reopening also preserved the exact text.
- Restarted the proxy and reloaded again so the new module had not yet loaded. Library → New material → Paste material → Write a note received `New draft retry fixture: preserve every word of this pasted text.`. The intentional503 again produced Note couldn’t load. Retry restored that exact text, then Saved appeared. Counter again showed one injected failure and two module requests.
- Reloaded; Library now showed5 materials, including the11-word Untitled note. Opening it preserved the exact pasted sentence and showed Saved.

These checks prove actual Chrome retry, editor usability, existing-note saving and new-draft preservation for the controlled single failed-download scenario. They do not prove every browser/network failure, physical-device performance or a host-controlled reference pane alongside active practice. Source/targeted tests cover the separate reference boundary; native packaging is unchanged. The pending discard dialog from the first candidate remains a tool-control limitation, not evidence of a product data-loss defect.

## Published replacement acceptance

Guarded deployment succeeded at `https://nooks-study-space-9z41r5dtu-eeshpara-1663s-projects.vercel.app`, aliased to the existing public URL. The actual page used `/assets/index-DcI4F0F4.js` and the initial shared-module preload `/assets/NoteAppearance-BITgdhqM.js`. Aggregate initial JS is868,709bytes /256,423gzip bytes, about39.8% less gzip than the original426,034bytes. This is a build-size result, not a measured loading-time improvement.

Actual public browser acceptance opened the existing disposable note with its prior mobile QA sentence intact and Saved visible. Renaming it to `Public release acceptance note` autosaved; a full reload showed that exact title in Pick up where you left off. The Tokyo film remained playing/muted at readyState4. No application console errors were observed; unrelated extension logs were excluded.

The expanded public asset gate passed66/66 exact hashes and types, including50 films,10 audio files, all entry/static/deferred JS andCSS. A new one-fixture authenticated canary passed config200/110ms and workspace200/420ms; all account/Auth/session cleanup passed. Its guarded private-topic cleanup removed0 because no such topic remained. Native version36 is unchanged by this public-only split.

The first-candidate disposable tab’s confirmation remains outside automated control. An attempt to open Chrome’s internal page list for cleanup was denied by browser URL security policy; the attempt stopped, with no alternate workaround. That tab may need Cancel clicked manually when the user returns.
