# Code-level UI review

Snapshot: October 1, 2026. Source inspection only; parent is running browser QA. Findings refer to `ui/src/App.tsx` and the current backend/StudyView snapshots. Agents are changing these files concurrently, so mark fixed issues rather than assuming this list remains current.

## Immediate fixes

| Priority | Finding / trigger | Recommended fix | Owner |
| --- | --- | --- | --- |
| P1 | `update()` only sets returned workspace; `workspace_render` can return `{artifact, unsaved:true}`. Anonymous generated material is neither in library nor opened. | Hydrate host toolOutput and notable workspace events; open returned artifact as unsaved draft. Do not claim Saved when unauthenticated. | Root + bridge |
| P1 | Note changes only prompt on NoteWorkspace's own Back. Sidebar, search, home brand and floating focus button unmount the note without a prompt. | Central navigation guard for dirty note, or durable local draft + restored edits. | Root |
| P1 | Focus timer initializes to 25 minutes even when persisted focusSessions includes running/paused session. Reload can create a timing contradiction. | Restore active session, subject, target, paused/running state, remaining/deadline from server contract. | Root + backend |
| P1 | Failed focus completion sets remaining to zero and running false; generic Retry reloads workspace instead of invoking focus_complete. A later Resume can restart a zero-second session. | Pending completion state with dedicated Retry save button; keep idempotent session ID. Disable resume for elapsed session. | Root |
| P1 | Engine artifact color normalizes semantic mint/peach/lavender/sky to `#8ba788`, while CSS class names use `tone-${artifact.color}`. Saved material loses styled type cover. | Shared semantic enum or CSS variable/style mapping from hex. | Root + backend |
| P1 | StudyView completion states claim fixed +XP but engine caps/uses different formula and yields 0 for repeat activity same day. | Return progress_record result and render actual awarded XP; otherwise say Practice saved without fixed award. | Study + backend |
| P2 | Every manually created multiple-choice question sets `correctIndex:0`, and displayed options currently retain order. All answers are A. | Shuffle display choices once per session with stable original-index mapping, or randomize and remap correctIndex on creation. | Study |
| P2 | New note→quiz/deck/exam request references saved artifact ID even when visible edits are unsaved. Generated material can reflect old source. | Save first or send current draft content explicitly; show source version. | Root |
| P2 | `saveArtifact` returns a throwing promise; favorite onClick ignores rejection. Error is shown but produces unhandled rejection. | Catch async click failures or return settled status; block repetitive toggles while saving. | Root |
| P2 | Task toggle sends full tasks from render snapshot, without disabling buttons during write. Quick toggles can race and overwrite each other. | Optimistic updater with serialization, per-task update tool, or pending disable. | Root + backend |

## Coherence and accessibility

- `changePage` keeps previous subject filter, despite resetting query/type; global Library/search may silently exclude other subjects. Reset subject for general Library navigation; subject buttons explicitly set it afterward.
- Search matches note content, title/subject/description only. Include cards front/back, questions prompts/options, and source if “Search your library” promises all material.
- Resume is derived only from most recent completed progress, then the first deck fallback. Opening a note/session without finishing does not make it resumable. Persist last opened ID and partial session, including study queue/answers.
- Empty Library's action is Clear filters even when truly empty, leaving user with the same empty page. If workspace has zero artifacts offer Create study material; filtered-empty offers Clear filters.
- Home button says Plant a 25-minute session but only opens the Focus page and may retain a previously selected 50-minute duration. Prefer “Open focus garden” or set duration deliberately when starting new session.
- Parent Modal focuses/traps controls and restores focus, which is good. But global Ctrl/Cmd+K listener can focus background search while a dialog is active. Trap should ignore search shortcut or route search within dialog; use inert background if possible.
- Escape/backdrop can discard a substantial unsaved create draft and can dismiss during a pending save. Preserve the draft, and prevent/review dismissal while write is pending.
- Sidebar navigation lacks aria-current, type filters lack aria-pressed, favorites lack aria-pressed, task rows lack checkbox state semantics, card menus lack aria-expanded. Add these states so assistive tech understands selection.
- Modal focus trap query includes disabled textarea/select, and only handles first/last boundaries, not focus that escaped programmatically. Filter every candidate for disabled/hidden, then ensure focus remains inside.
- Artifact More options menus have no outside/Escape closure, focus management or menu state. At minimum aria-expanded + Escape/outside close; focus trigger on dismissal.
- Root storage reads/writes directly to localStorage during render/effect; host iframe storage may be unavailable. Wrap storage access in try/catch and use in-memory defaults.
- Root default `updatedAt.localeCompare` assumes date fields always valid strings. Tool validation currently guarantees saved artifacts, but host input/drafts require normalization to avoid a whole-workspace crash.

## Feature scope to disclose or implement

- Requested quiz/card editing is absent root App, but study agent is adding editors. Include title, question/term body, correct answer, add/delete entries; preserve IDs and give Save/Cancel.
- Original title/description/cover editing: new note title is editable, but description, subject and cover customization are not exposed after creation. Add a details editor if time permits.
- Original PDF import and PDF share/export are not in root App; current download is Markdown. User said all active features excluding lecture recording. Distinguish supported text import/Markdown export from PDF import/export rather than silently claiming feature parity.
- Source view currently reports a metadata string, not original source text. Preserve originalText/source content separately from generated note where supplied by ChatGPT.
- Study plan currently supports manual tasks and optional due date, not an exam-date schedule or linkage to material. A simple material-linked task is a useful next step; AI schedule can delegate to ChatGPT.
- Group study and Canvas integrations require real configured backend integrations. No fake people, room counts or connected statuses. Clearly call these setup-dependent if not implemented.
- Plants are static generic icons keyed by index; progression/rarity/customization is not implemented. A concrete seed→sprout→plant stage can reflect timer completion with no paid UI.
- Dashboard displays totals and XP but not per-topic mastery, due reviews, streak or attempt history. Backend supports review scheduling; expose one clear next review and truthful practice history.

## Strengths already present

Manual note/cards/quiz creation; structured validation errors; distinct practice/exam routing; reusable modal with initial focus/Escape; labels on search, sorting and theme controls; local theme/compact preferences; responsive-navigation hooks; Markdown-safe React text rendering (no raw HTML); human copy; visible integration status; note unsaved label; requestChatGPT bridge rather than a second paid AI chat loop.
