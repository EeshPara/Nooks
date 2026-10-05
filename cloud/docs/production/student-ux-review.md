# Student UX review — Nooks

Reviewed 2026-10-01 as an independent task walkthrough. Test surface: isolated `http://127.0.0.1:8791`, fresh Chromium contexts, desktop 1440×980 and touch/mobile 390×844. Source reviewed: App, NoteWorkspace, CreateMaterial, StudyLibrary, ChatAnchor, NookCreator, and relevant layout styles. No applicable AGENTS.md was found in the repository or ancestor paths checked.

The student’s primary jobs are: start writing, turn existing notes into useful practice, find and resume work, and focus. The illustrated environment supports those jobs when it stays in the background. Further visual polish is lower priority than retaining context and making creation actions visible.

This is a qualitative review, not a user study or accessibility certification. The build changed during the review. Findings below distinguish observed behavior from subsequent source fixes. Screenshots are in `/tmp/nooks-student-review/`; they record intermediate builds and are not all evidence of the final build. The user’s ports 5173/8787 and saved browser data were not used.

## Highest-impact findings

### 1. Preserve the student’s place when opening work — P1

**Observed:** Library → IA Biology 12553 → IA Respiration → “The little engines of life” → the note’s “Library” button returned to **All materials**. The selected topic was lost. Opening the same note from the home desk and pressing “Library” returned to **My nook**, contrary to the label.

**Cost:** A student reading several notes in one topic must repeatedly choose the same course and topic. The back control also teaches two meanings for “Library.” Search and library view state live inside the unmounted library component, so the same continuity concern applies to search results and saved-session browsing.

**Recommendation:** Keep selected course/topic, search, material filter, and library view outside the transient library component. Make the note’s Library control actually open the library and restore the previous relevant view. Where a student has no previous library location, open the note’s existing course/topic or All materials consistently.

**Status: Resolved and browser-verified in the merged build.** Before opening the note and after returning, the library retained course “IA Biology 12553,” topic “IA Respiration,” search text “engines,” and its one matching result. Opening the desk note from My nook and using its Library button returned to the library with Library selected in the main navigation. Evidence: `verified-library-return.png`.

### 2. Put note-to-practice actions where mobile students can see them — P1

**Observed:** At 390×844, the note’s title and first paragraphs fill the visible reading area. Flashcards/Quiz/Summary sit after the entire note body, outside the initial view. A student looking at the note sees “Style this note” and Download before they see the core study actions. The note is inside a constrained scrolling area, so the actions become harder to discover as the note grows.

**Cost:** The desktop conversion is one click; mobile first requires discovering where to scroll and reading past the content to reach the action. The cosmetic action receives earlier placement than practice.

**Recommendation:** On narrow screens, place a compact “Turn into” row before the note body, or pin a small contextual action bar. Preserve one-click cards/quiz requests. Keep style/download secondary. Include an exam path alongside the new Summary action; the updated note rail removed the earlier Practice exam action.

**Evidence:** `mobile-note.png`.

**Status: Mobile placement resolved and browser-verified in the merged build.** At 390×844, Flashcards, Quiz, and Summary appear at y=250, before the note paper begins at y=309; all three targets are 112×41px. Evidence: `verified-mobile-actions.png`. The earlier request for a contextual exam choice remains separate from this resolved placement issue.

### 3. Creation must acknowledge successful delivery truthfully — P1

**Observed in source:** CreateMaterial awaited `onAsk` and then displayed “Sent to your ChatGPT conversation.” App’s `onAsk` resolved after a failed/unavailable `requestChatGPT` call and merely showed a different notification. That allowed the composer and toast to contradict each other, and allowed success language when no request was delivered.

**Recommendation:** Have failure remain a failure across the callback boundary; preserve the prompt and show a retryable error. Only close the composer or show Sent after the host confirms delivery. In the standalone demo, clearly explain that AI generation runs in ChatGPT.

**Status:** Root reported the source now throws on delivery failure so the composer retains the draft and shows an error. Final browser verification pending. This review did not test native ChatGPT delivery.

## Creation improvements already observed

The initial build made “blank note” impossible as a direct job: + → Make it myself → Save required both a title and body, producing “Give your study set a title” and “Add a little content to your note.” It also presented title, subject, goal, and source simultaneously before asking for anything.

The updated build materially improves that flow:

- A prominent desktop **New** button replaces dependence on the unlabeled chat plus or small home link.
- The cream composer presents one main request field, four format choices, and optional disclosures for source and metadata.
- **Blank note** opens a note with the body already focused. This was browser-verified. Entering body text and a title reached **Saved** without a separate save action. Navigating to Library, reopening “UX review test — retrieval,” and reading its title/body confirmed the saved content persisted.
- Practice creation now passes quiz intent from its entry point in source. The updated composer was observed from Practice; final pressed-state confirmation is still pending.
- The textarea receives focus when the composer opens; the initial version focused Close first.

The compact composer fits within a 390×844 viewport without horizontal overflow. Its Close icon was observed at the viewport’s top-right rather than the card’s header because the class name overlapped the nook creator’s close-button styles. The merged build resolves this: at 390×844 the dialog starts at y=179, its header spans y=180–238, and the 36×36px Close button sits at y=196–232 within that header. Clicking it dismissed the dialog. Before/after evidence: `mobile-create.png` and `verified-mobile-create.png`.

## Task cost ledger

Counts are intentional button/tap actions starting from My nook unless otherwise stated. Typing is counted separately. A click that only requests AI work is not counted as successful artifact generation. Optional cosmetic choices are excluded.

| Job | Observed/updated path | Clicks or decisions | Assessment |
| --- | --- | --- | --- |
| Start a blank note | New → Blank note → type | **2 clicks + typing** in the updated build | Good. Body focus is correct; no naming form should block writing. |
| Existing note → cards | Open recent note → Flashcards | **2 clicks**, or **1** from an open note | Good desktop path. Local preview shows a labeled sample, not a saved card set. Mobile discoverability needs the action moved upward. |
| Existing note → quiz | Open recent note → Quiz | **2 clicks**, or **1** from an open note | Good direct path. Native creation/save remains untested. |
| Existing note → exam | Initial build: Open note → Practice exam | Initially **2 clicks** | Updated rail has Summary in this position. Restore a contextual exam choice without requiring the student to re-paste the note. |
| Quick quiz from a topic | New → Quiz → enter topic → Create with ChatGPT | **3 clicks + one text entry**, two meaningful decisions: format and topic | Reasonable. Title/subject should remain optional. From Practice, defaulting to Quiz saves the format-selection click. |
| Return to a saved topic | Library → Course → Topic | **3 clicks** to the topic, **4** to open a note | Acceptable first visit; unreasonable to repeat after every note. Preserve location. |
| Continue a saved study session | Library → Saved sessions → Continue | **3 clicks** if the desired session is already visible | Useful but less discoverable than the home desk. A small recent-session entry would help after core navigation is stable. Native context handoff is untested. |
| Search and open material | Library → search field → type → result | **3 clicks + typing**; keyboard route is Cmd/Ctrl+K → type → result | The desktop shortcut correctly opens Library and focuses search. Two visible search boxes create avoidable ambiguity about scope. |
| Move material | Library → Move → Course → Topic → Move here | **5 actions** with course/topic already created; native select mechanics vary | Clear explicit Move control. Keep this occasional organization step out of creation’s mandatory path. |
| Start focus | Begin session on home | **1 click** with sensible defaults | Strong. Subject and duration refinement remain optional in the Focus view. |
| Inspect nook rewards | View collection | **1 click** | Saved time and minutes remaining are explicit. Keep rewards secondary to the timer. Unlock thresholds were not re-tested in this review. |
| New private nook | Current observed studio: Explore nooks → Create a nook → enter name → Save draft | **3 clicks + name** with defaults, inferred to saved draft; save was not exercised | The new single-screen studio defaults to private and clearly says publishing needs the connected backend. Inviting people remains unverified. |

## Remaining simplifications, in priority order

1. **Use one search model — P2.** Library shows a global “Find in your library” field and a local “Search your work” field. Global search clears scope; local search filters the current scope. That distinction is not explained. Prefer one visible library search, with a scope label/chip when filtering a course. Keep Cmd/Ctrl+K as an entry point to that same field.
2. **Keep New recognizable on mobile — P2.** The updated mobile header hides the word New, leaving a 33px plus. It is better positioned than the old chat plus, but still asks the student to infer meaning. A short New label or explicit title/tooltip plus a larger touch target would improve it. The composer’s Blank note should remain available without first choosing a writing method.
3. **Keep preview boundaries prominent — improved during review.** The old creator deferred the publishing/invite limitation until its people step. The current browser opened a new single-screen Nook studio: private visibility is the default, draft privacy is explained beside the controls, and “Publishing needs the connected community backend” is visible before saving. This is the right direction. Draft save, publish, and invite actions were not exercised in that studio.
4. **Make “save for next time” available at the end of actual work — P2.** The reviewed library places it behind Saved sessions. A small action at the end of a practice result or note session could open the existing reviewed-summary dialog. Avoid another dashboard card or an automatic, unreviewed summary.
5. **Reduce secondary controls in the mobile note header — P3.** Location, history, back, style, and download consume substantial space before the note begins. A compact header plus a More menu for history/style/download can make room for the practice actions and reading. Do not hide course context or the save status.

## Accessibility and motion checks

- **Passed:** no horizontal page overflow at 390×844 on home, note, library, and creation. This is a layout check, not a zoom certification.
- **Passed:** reduced-motion preference hid the weather layer; computed glow animation duration was 0s. The new composer uses reduced-motion handling and the note heading jump checks the preference in source.
- **Passed:** desktop Cmd/Ctrl+K opens Library and focuses its search field. The shortcut is visibly advertised only after leaving home; discovery on home could improve.
- **Passed:** note body has a keyboard-entry path using Enter/Space; title and body have accessible names. A blank note put focus directly in Note content.
- **Concern:** mobile About is 19×19px. New is 33px. Some text controls are small enough to be difficult on touch. Increase hit areas independently of the visual icon size. This report does not claim a complete WCAG target-size assessment.
- **Concern:** several control labels use very small type over a detailed image. The cream note and composer are significantly easier to read. Preserve solid or sufficiently opaque surfaces for instructions and primary actions; no contrast-ratio audit was performed.
- **Concern:** nested note scrolling and the composer/bottom navigation reduce the effective mobile reading area. Verify visible focus and action reachability with keyboard and 200% zoom in the final pass.

## Persistence and product-truth boundaries

A new note’s body focus, transition to Saved, and correct title/body after navigating away and reopening were observed. The dedicated autosave agent is handling conflict behavior; this review did not run a controlled two-client stale-revision test and does not claim one passed. No existing study note was edited by this review. The isolated demo received a review note named “UX review test — retrieval” and a short focus-control exercise.

No JavaScript page errors were captured during the completed desktop library/note/practice/focus traversal. Some automation runs stopped on changed button labels or screenshot timeouts while the build changed; those tool failures were not counted as product defects.

Local chat replies are deterministic samples and explicitly labeled. Clicking a note’s practice action verified the request path and sample response, not native ChatGPT artifact creation. Supabase project connection, real presence, private invites, real image generation/upload, and native host delivery were not tested. Screenshots and source review must not be used as evidence that those production integrations are complete.

## Final-pass checklist

- [x] Back from an open note returns to Library and preserves course/topic/search (merged build browser-verified).
- [x] Mobile Flashcards, Quiz, and Summary appear before a long note (merged build browser-verified).
- [x] Added a direct Exam action alongside Flashcards, Quiz, and Summary (source/build verified; native generation still requires host testing).
- [x] New → Blank note → type → navigate → reopen retains the saved title and body (observed during review).
- [x] Practice → Create practice starts on Quiz (integration audit browser-verified).
- [x] Failed/unavailable ChatGPT send leaves the prompt intact and never says Sent (integration audit browser-verified).
- [x] Composer Close remains inside the mobile card header and dismisses the dialog (merged build browser-verified at 390×844). Desktop placement was not rechecked in this final pass.
- [x] Header New is available across all main views; Cmd/Ctrl+K opens Library search. New has no advertised keyboard shortcut.

### Merged-build verification

The final scoped pass rechecked only the requested library continuity, home-note Library return, mobile study-action placement, and mobile composer Close. All four passed. No JavaScript page errors occurred during the desktop traversal. This pass does not expand the native ChatGPT, invite, conflict, or accessibility coverage described above.
