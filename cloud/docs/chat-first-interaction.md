# Chat-first Nooks interactions

Nooks uses native ChatGPT for teaching, reasoning, planning, and generation. The MCP server validates, stores, retrieves, and renders study work. No separate model API is required for this native flow.

## Student flow

| Student request | Native conversation | Nooks action |
| --- | --- | --- |
| Make flashcards from this | Use selected material or current chat context; choose a sensible initial deck size | Save a new artifact, then present its confirmed ID in the existing app’s card player |
| Quiz me on these notes | Generate questions grounded in the selected note | Save and open the quiz player |
| Rewrite this paragraph | Read the current note revision and requested edit | Update the note with revision checking and open the note |
| Add these tasks to my plan | Read the current plan and merge new tasks | Save with the workspace revision; retry a conflict after rereading |
| Pause my timer | Read the actual active focus session | Update its state and open the focus panel |
| What have I unlocked? | Read verified focus progress and rewards | Explain current progress and open the collection |
| Show my library | Select the named destination | Navigate the existing tab to Library |

No extra generation form, mandatory title, or redundant save confirmation is needed after a clear creation request. During teaching, offer one useful next step when relevant; an upload alone is not permission to create a library of unwanted material.

## Context and persistence

- Current selected editor text takes priority over its older saved version. Large saved sources are read with artifact_get pagination.
- The model sees selected operational data, not the entire private workspace. Full UI data travels in tool-result metadata.
- Current-nook state, timer IDs, earned rewards, and the current plan have dedicated read tools.
- Approved continuity summaries and saved material can be retrieved in later sessions. Nooks cannot automatically read all ChatGPT conversations or uploads.
- Direct note edits use revision checks. Unrequested AI improvements use a proposed revision that the student can review.
- A pending UI navigation waits for dirty-note autosave; a failed save retains the editor and draft.

## Runtime boundaries

Card flips, quiz input, text editing, timer display, and audio controls stay direct in the interface. Server rules still handle storage, permissions, scoring, timing verification, and community membership. ChatGPT supplies AI computation; Supabase and hosting still supply application infrastructure.

Host approvals and initial app connection/display remain controlled by ChatGPT/Codex. Spotify or audio may need a playback gesture. Background image generation needs an exposed host capability and a supported image handoff. Conversational proactivity does not imply unattended background ChatGPT runs.

The private native plugin and public Vercel website are separate entry points; the website does not automatically inherit ChatGPT compute or the native user's account. Its production database connection remains a separate setup task.

## Verification

The hosted update adds eight explicit workspace destinations, read-only plan/status tools, plan revision checking, and partial appearance updates that preserve unrelated settings. The integration tests cover stale state, account isolation, invalid requests, model-safe output, and UI autosave/navigation sequencing.

Live saved-artifact creation, readback, automatic player opening, and a card flip were exercised using a three-card Getting started with Nooks deck. The final deployed unsaved-card preview also opened without the earlier checkpoint error. Live panel navigation requires the host's MCP tool catalog to refresh: this conversation retained its pre-update schema and stripped the new view argument. Local routing tests are not a substitute for that remaining host check.

Official integration references: https://developers.openai.com/plugins/build/chatgpt-ui and https://developers.openai.com/plugins/build/app-quickstart.


## One mounted workspace (October 3 update)

`workspace_render` is only the initial opener. Repeated render calls create separate host app tabs. The mounted app advertises `nooks_present` and `nooks_view_state` using the documented app-provided-tools protocol. `nooks_present` changes the existing React workspace and animates the committed destination; it never calls a UI opener.

When the host cannot call app-provided tools, the app registers a unique owner-scoped session. Model context includes that routing identifier even when no material is selected. `workspace_navigate` queues an allowlisted view or saved artifact ID for that exact session; a read-only, visibility-aware poll consumes it. Commands contain IDs only, sessions expire after 30 minutes, and the backend never falls back to another tab. Navigation queue acceptance is not proof that the UI displayed it.

An explicit alongside request may include `alongsideArtifactId` for a saved reference note while a quiz/cards/exam occupies the primary panel. Reference content is rendered through allowlisted rich-text nodes, read-only, with a close control; narrow layouts stack it below practice. Dirty notes remain mounted until their autosave completes. Local transitions honor reduced motion and the app’s motion preference; autosave revisions do not restart animation.

No new database, migration, AI service, paid feature, or sharing change is required.
