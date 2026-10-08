# Frontend resource audit — October 8, 2026

Initial read-only source/build audit of `web/`, followed by an authorized public-only implementation described below. Read `AGENTS.md` and applied the Vercel React performance skill's conditional component loading guidance. Repository checkpoint at audit time: `058bfa52b54f423a4dc60bd2968bda300420a6b6`.

## Recommended next change: defer the public note engine

The public home screen eagerly downloads the full note editor before a note is opened. `web/ui/src/App.tsx:53` statically imports `NoteWorkspace`; `App.tsx:66` separately imports `StudyReference`. Both reach `RichNoteEditor`, which imports TipTap and ProseMirror. `StudyReference.tsx:9` additionally constructs its Markdown manager during module evaluation. These components only render when a note or reference is selected (`App.tsx:554`).

Changing only the note editor import is insufficient: the reference pane is a second eager path to the same dependencies.

### Measured bundle experiment

Used Node 22.17.1 and the installed Vite build with `VITE_NOOKS_PUBLIC_PREVIEW=1`, production mode, `build.write:false`. The candidate applied an in-memory Vite `transform` to replace the **two** static imports with `React.lazy` imports. It never wrote transformed product source or build output. This experiment measures chunking, not a complete working implementation: Suspense and recoverable loading UI were deliberately not implemented in the audit.

| Public JavaScript | Current minified bytes | Candidate minified bytes | Current gzip bytes | Candidate gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Entry | 1,410,268 | 862,697 | 426,034 | 252,405 |
| Shared editor, deferred | — | 523,897 | — | 165,866 |
| Note workspace, deferred | — | 20,332 | — | 7,003 |
| Reference pane, deferred | — | 2,975 | — | 1,146 |
| Supabase SDK, existing dynamic chunk | 228,238 | 228,238 | 60,005 | 60,005 |

The candidate removes **547,571 bytes / 38.8%** from the entry, or **173,629 gzip bytes / 40.8%**. All 37 TipTap/ProseMirror modules move out of the entry into the deferred shared editor chunk. Total code is approximately unchanged; users who open a note still need the editor. Gzip was computed with Node's `zlib.gzipSync`; this is an artifact size comparison, not measured CDN transfer, CPU, memory, LCP, or interaction latency. The full temporary build graph is `/tmp/nooks-resource-audit-ab.json` and is not required as a committed artifact.

## Bounded implementation and acceptance

Implement in **web only**. Leave `app/`, `cloud/`, and the Site checkout untouched. Native `cloud/server/index.mjs:77` embeds the entry script/CSS into the widget and rewrites trusted media assets; it does not package arbitrary dynamically imported JavaScript. Applying this split to native without a separate asset-loading design could break notes in the iframe.

1. Use module-scope stable lazy components for both public note surfaces. Keep a tight Suspense boundary around the note workspace and a separate boundary around the reference pane. The latter must not suspend an ongoing quiz/practice session. Show a short, accessible loading state with a way back to the library; preserve the surrounding room, timer, navigation, and audio.
2. Preserve the existing `active.id` key, owner recovery scope, autosave callbacks, and hidden-but-mounted note behavior. `NoteWorkspace` initializes its autosave queue and recovers scoped drafts on mount (`NoteWorkspace.tsx:42–85`); moving that logic into a fallback or remounting on every render would risk drafts. Keep the current navigation guard. No typing is possible before the editor mounts; leaving while its first download is pending should simply abandon that pending view.
3. Handle a failed chunk download locally, with a real in-document retry and a way back. **Plain `React.lazy` caches a rejected import.** The current outer `WorkspaceErrorBoundary` remounts the same component on “Reopen nook”, so it cannot by itself retry the cached lazy rejection. Do not require a page reload to recover a network error while other workspace changes are pending. A resettable lazy component/resource belongs at the note boundary, with failures caught before the global workspace boundary.
4. Run the mandatory public TypeScript/production build and targeted note/reference/autosave/recovery tests after implementation. Verify built browser behavior: first note open; blank-note autofocus; typing/autosave; return to library and reopen; reload recovery; reference alongside a running practice session; account-scope isolation; and chunk failure followed by successful retry. Confirm via build graph that neither TipTap nor ProseMirror remains in the entry. Use actual browser evidence before claiming any runtime speed improvement.

Do not add other modal splits or general memoization in the same change. The quantified note split is already large and has clear boundaries.

## Other inspected resource paths

- `world/nookAnimation.ts` selects a single string from the 50-film manifest. It does not fetch all films. `RainyLibraryBackdrop.tsx:32` renders one video with `preload="none"`; the playback controller assigns the selected source only when enabled, visible, and motion is allowed. Its dispose path clears the source and listeners are removed on scene changes. No 50-video request fan-out was found in source.
- Discovery cards and personalization room thumbnails use `loading="lazy"`. This is code evidence, not a measured request count or guarantee about the browser's lazy-loading distance.
- `world/recordedAmbience.ts` imports asset URLs, not embedded audio bytes. Only allowlisted selected recordings are fetched, with a timeout and size bounds. `AmbientMixer.tsx:71–137` releases inactive players after 5.2 seconds and tears down decoded sources. Existing fixes should remain in place; this audit found no justification for another audio-engine rewrite.
- `account/client.ts:155–200` removes prior realtime channels on reconnect/stop, cancels retry timers, and unregisters listeners. No concrete subscription leak was found in this inspected path. This does not substitute for heap profiling or long-duration browser measurement.

No production-browser interaction, continuous media playback, subjective listening, mobile profiling, memory measurement, or load-time measurement was performed by this audit.

## Public-only implementation followup

Implemented `DeferredStudyViews.tsx` and `DeferredStudySurface.tsx` in `web/ui/src/study/`; App now imports those two thin public wrappers. Native/development snapshots and Site checkout were not edited. The lazy note and reference boundaries are separate, preserving the parent `active.id` key, owner scope, and hidden mounted behavior. Only tagged import failures show the local retry; editor render failures still propagate to the existing workspace recovery boundary. Retry creates a fresh React lazy type without reloading the room.

Independent review caught two pre-release issues and the implementation addresses both:

- A nonempty manual note must be protected before its downloaded editor mounts. The eager wrapper records scoped recovery and registers the existing dirty-navigation guard in a layout effect. Existing recovered writing wins over incoming library data. The loading/error Back action asks for confirmation if needed; ownership transfers to the editor's existing dirty callback after mount. Failed browser storage remains visibly warned, including repeated mounts with an in-memory recovery entry.
- Vite remembers failed stylesheet preload attempts, so a fresh lazy type alone can leave a retried editor unstyled. Note workspace, note appearance, and reference styles remain eager. Only JavaScript is deferred.

Focused verification: **47 tests passed**, covering real React server-rendered async lazy rejection and successful fresh retry, current component props, fallback navigation, render-error propagation, scoped pre-mount draft protection/reload recovery, reference rendering/safety, rich Markdown behavior, autosave, note dismissal, and existing workspace recovery. After the durability followup, the four protection tests passed again. Test log: `/tmp/nooks-deferred-study-tests-final.log`. These tests do not replace actual browser verification of ESM network retries; root is performing that with a local one-failure chunk proxy.

The first TypeScript plus public build passed (`/tmp/nooks-deferred-study-build-final.log`), but actual Chrome fault testing rejected that implementation: after one injected HTTP 503 on `NoteWorkspace-2gOYbzpw.js`, “Try again” made no second network request. Chrome retained the failed ESM module URL even after a fresh React lazy type. This candidate was **not accepted for deployment**. The browser did show the expected unsaved-note navigation confirmation; its dismissal was blocked by browser automation, so no cancel-dismiss success is claimed.

### Replacement: one retryable compiled study module

`scripts/study-split-plugin.mjs` emits the strict-signature `DeferredStudyContent` chunk and exposes its trusted hashed URL through a virtual module. `studyContentLoader.ts` shares pending/successful imports between note and reference views; after a failure it clears that promise and adds a fresh `nooks_retry` query to the same allowlisted compiled URL. There is no source rewriting, eval, blob module, or page reload. User data cannot select the code URL: only the same-origin compiled study path is accepted, without incoming credentials, query, or fragment.

The build fails unless both exports exist, the entire deferred chunk has no further dynamic imports or deferred CSS, every static dependency is already in the entry's loaded static closure, the editor is not itself eager, and React is not bundled again in the deferred module. This makes one query-busted URL cover the whole deferred failure surface. CSS remains loaded by the initial document.

Replacement TypeScript/build and this graph gate passed (`/tmp/nooks-retry-study-build.log`). Four loader tests and two graph-gate tests joined the eight boundary/protection tests; **14 focused checks passed** (`/tmp/nooks-retry-study-tests.log`). Concurrent note/reference requests deduplicate, rejection causes a new URL, repeated failures increment it, success stays cached, unknown URL shapes are rejected, and invalid dependency/React/CSS graph shapes block release.

The replacement emits:

| JavaScript | Minified bytes | Gzip bytes | Load timing |
| --- | ---: | ---: | --- |
| `index-DcI4F0F4.js` | 516,086 | 160,995 | Initial entry |
| `NoteAppearance-BITgdhqM.js` | 352,623 | 95,428 | Initial static dependency/modulepreload |
| **Aggregate initial static graph** | **868,709** | **256,423** | **38.4% raw / 39.8% gzip below original** |
| `study-content-CAoZffAd.js` | 543,864 | 172,176 | First note or reference, then cached |
| `index-BlI9WeLm.js` | 228,238 | 60,005 | Existing dynamic Supabase SDK |

The deferred study module imports only `NoteAppearance-BITgdhqM.js`, which is already loaded by the entry. Two initial stylesheets are linked in the document and neither is deferred. Aggregate initial JavaScript, rather than the smaller entry file alone, is the relevant comparison to the original 1,410,268 / 426,034 bytes. These remain artifact sizes, not measured end-user performance. Actual Chrome 503 → new request → successful note opening, plus note/reference acceptance, is still required before publishing this replacement.
