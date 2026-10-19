# Independent deferred-study review — October 8, 2026

**PASS for the scoped public deferred-editor release.** Source, targeted checks, actual Chrome failed-download recovery, note save/reopen/reload and deployed asset/authenticated-probe evidence now pass within the recorded scope. Product quality and production-readiness grades remain unchanged. The prior candidate was correctly rejected and never deployed.

I reviewed the public-only Vite plugin, emitted module graph, runtime loader, note/reference wrappers, recovery helper, boundary and tests. I made no application edits, deployment, browser operation or database mutation.

## Actual browser defect and its replacement

The first implementation replaced a rejected React.lazy resource but reused the same dynamic-import URL. Root's local fault proxy returned HTTP 503 once for `NoteWorkspace-2gOYbzpw.js`; clicking Try again left the error visible and proxy counters at **`{injected:1,editorRequests:1}`**. Chrome cached the failed native module URL. This disproved the initial generic-loader/SSR inference, and I revoked acceptance. The earlier failing record remains in `deferred-study-browser-qa.md`.

The replacement emits one strict-signature `DeferredStudyContent` chunk, exporting NoteWorkspace and StudyReference. A build-generated virtual module supplies its trusted hashed URL. The shared runtime loader deduplicates concurrent note/reference loads and retains a successful import. After failure it clears the shared promise and increments a `nooks_retry` query, causing a fresh module URL to be fetched. Saved/user data cannot choose code: the loader accepts only the same-origin compiled `/assets/study-content-HASH.js` namespace without incoming query, hash or credentials; development permits only the known source module. No source rewriting, eval, blob module or full-page reload is used.

The plugin's mandatory build gate checks both exports, rejects eager editor inclusion, deferred CSS, additional dynamic imports, a static dependency outside the initially loaded module graph, and React/react-dom code inside the deferred chunk. This makes the one fresh URL cover the complete deferred failure surface while keeping React canonical.

I inspected the actual final output:

- `study-content-CAoZffAd.js` imports only `NoteAppearance-BITgdhqM.js` and exports both required components.
- The HTML loads `index-DcI4F0F4.js` and preloads the same shared `NoteAppearance-BITgdhqM.js`; that shared file belongs to the entry's static graph.
- Both stylesheets are linked by the initial HTML. No stylesheet is deferred behind the retry path.
- Native/development application source remains untouched by this split; unrelated documentation updates are separate.

Root reports the same actual Chrome fault proxy now injects exactly one 503, then **Try again renders the note title/content/Saved state without a page reload**, with counters **`{injected:1,editorRequests:2}`**. That directly closes the original no-second-request defect for the built replacement. This browser observation is root's evidence, not my own browser operation. The inspected final `deferred-study-browser-qa.md` also records successful existing-note editing, Saved state, Library/reopen and full reload preserving exact text. A separate cold-load run passed nonempty new-draft input through one injected 503, retry, Saved, reload and reopening the new eleven-word material with exact content preserved.

## Other findings corrected during review

1. **Protect supplied unsaved material before the editor mounts.** CreateMaterial can hand nonempty pasted source to a newly active note before the deferred editor exists. Initially its dirty/recovery hooks had not mounted and fallback Back could clear the active note. The eager wrapper now retains scoped initial/recovered writing and registers dirty state in a layout effect. The pending dirty Back path confirms before leaving; actual editor autosave takes ownership after mount. Existing recovery wins over stale library baseline. The first-candidate browser exercise showed the expected discard confirmation, but automation could not dismiss that dialog, so no cancellation acceptance is claimed.
2. **Avoid the failed stylesheet preload cache.** The initial Vite helper cached a failed note CSS dependency. All note workspace/appearance/reference styles are now eager; the replacement graph gate prevents deferred CSS from returning.
3. **Do not mistake in-memory recovery for durable storage.** An intermediate helper treated any existing recovery entry as successfully stored, hiding warnings after failed sessionStorage writes. The final helper reattempts retention of the exact existing draft/baseline. Repeated blocked-storage protection keeps the warning and never replaces recovered writing with stale incoming content.

## Independent targeted checks

I independently ran **14 tests, all passing**, with Node 22:

```sh
node --test tests/study-split-plugin.test.mjs ui/src/study/studyContentLoader.test.mjs ui/src/study/DeferredStudySurface.test.mjs ui/src/study/deferredNoteProtection.test.mjs
```

These cover shared concurrent imports, cached success, fresh URLs after repeated failures including synchronous import errors, rejection of unsafe URL shapes, the emitted-graph invariants, stable resolved component identity, pending escape actions, loader rejection/fresh lazy resource, ordinary render-error propagation, initial unsaved-note protection/reload recovery, recovered-draft precedence/account isolation and repeated blocked storage. SSR/helper tests remain distinct from the actual Chrome failure injection.

Source review confirms the existing parent active-note key and account workspace key remain in place; normal rerenders keep the same resolved editor type, and hidden notes stay mounted. The pending wrapper hands dirty-state ownership to the editor without using callback identity as a remount key. Ordinary editor render errors still propagate to workspace recovery. Reference suspense remains local to the reference pane, preserving the sibling practice view.

## Size claim and acceptance limits

Use the **aggregate initial static graph**, not the entry alone: 516,086-byte entry plus 352,623-byte shared dependency equals **868,709 bytes / 256,423 gzip bytes** in the implementation agent's Node-gzip build measurement. Against the original 1,410,268 / 426,034, that is **38.4% raw / 39.8% gzip reduction**. The 543,864-byte study chunk is loaded on first note/reference use. I inspected the filenames/import relationship; the like-for-like gzip comparison comes from the implementation audit. These are artifact sizes, not measured CPU, memory, LCP or physical-device speed.

The public release `nooks-study-space-9z41r5dtu-eeshpara-1663s-projects.vercel.app` is now on the existing alias. The inspected expanded asset report passes **66/66** resources at 09:01:55 UTC, including every emitted JS/CSS file, fifty films and ten audio recordings. Root reports actual public DOM loading the expected entry/shared preload, opening a prior QA note, editing its title, Saved, reload/resume preserving the exact title, and no application console errors (only extension diagnostics). That production browser observation is parent-reported; the local fault/recovery sequence is also recorded in the inspected browser report.

The inspected `operations/authenticated-probe-live-2026-10-08T09-01-55.339Z.json` passes configuration HTTP 200 in 110 ms and authenticated workspace HTTP 200 in 420 ms at 09:02:03 UTC. Its matching fixture report records session/account/Auth cleanup success, zero accounts and absent Auth identity. Root separately reports no orphan fixture throttle topic. This is a point-in-time authenticated check, not ongoing scheduled monitoring.

Remaining limits: no independent physical-device speed measurement, no new actual host-controlled reference-pane/practice acceptance, and no claim that every browser/network failure was tested. One old disposable localhost tab still has the first-candidate discard confirmation; browser cleanup was blocked by the tool security policy and no workaround was used. That tool limitation does not affect the production release. Keep hashed assets available for already-open deployments. This approval covers the public-only change and does not authorize transferring it to native widget packaging or establish general public-launch/sensory/production readiness.
