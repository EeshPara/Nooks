# Nooks: material, context, and creation

Research checked October 2, 2026. This covers seven representative products, not every study app. Product behaviors below are supported by their official documentation; the Nooks design that follows is a recommendation, not a claim that competitors use this internal architecture. It extends the existing [organization and continuity design](production/organization-context.md).

## Decision

**Bring material once. Study it any way. Keep it together.**

The student should never have to understand a context system to get a useful result. A note, a PDF, a selection, a saved quiz, and a piece of a conversation should all offer the same actions: **Notes, Flashcards, Quiz, Ask**. Games should reuse practice content rather than create a second content library.

Keep the current **Library → optional Course → optional Topic** model. Do not add another required notebook/study-set/folder layer. Recent work remains useful without filing anything. A nook changes atmosphere, people, and rewards; it must not change the academic material selected for study.

## What the strongest patterns actually look like

| Product | Documented organization and creation | Pattern to take into Nooks |
| --- | --- | --- |
| NotebookLM / Gemini Notebook | Sources belong to notebooks; the user can select a subset for chat. Updating/deleting a source does not automatically alter previously generated studio outputs. Saved chat responses can become notes with their citations; chat history remains private. Google's help now labels the product Gemini Notebook. [Sources](https://support.google.com/gemininotebook/answer/16215270?hl=en), [chat](https://support.google.com/gemininotebook/answer/16179559?hl=en). | Make source selection visible. Keep outputs stable and offer refresh when their inputs change. Let useful explanations become durable material. |
| Quizlet | Folders group several kinds of study content. Uploading or pasting material can produce an editable study guide and flashcards. A flashcard set powers different study modes and games. Practice Tests can use uploaded notes or sets. [Folders](https://help.quizlet.com/hc/en-ca/articles/360030986151-Organizing-study-content-with-folders), [guides](https://help.quizlet.com/hc/en-ca/articles/18312306436365-Studying-with-Study-Guides), [modes](https://help.quizlet.com/hc/en-au/articles/360030841732-Studying-on-Quizlet). | Reuse one collection across practice modes. Generate from existing work without another upload. |
| RemNote | A reader pairs source files with editable notes. Highlights can produce cards; generated cards link back to source passages. One PDF can be linked to several documents. Its tutor can answer about the PDF and link to pages. Guided learning can also start from the student's own document. [Reader](https://help.remnote.com/en/articles/6690975-learning-from-pdfs-and-files-with-the-remnote-reader), [guided learning](https://help.remnote.com/en/articles/15724936-guided-learn-mode). | Selection → action should be immediate. Link existing sources instead of copying them. AI output must remain editable, with its origins accessible. |
| Knowt | Files, notes, and card sets can move into folders. Blank notes open for typing and autosave. Uploaded material can create notes or cards, then lead to tutor chat, tests, or games. Knowt Play accepts existing notes, cards, and assessments. [Folders](https://help.knowt.com/en/articles/10714495-how-can-i-move-items-into-folders), [notes](https://help.knowt.com/en/articles/10716252-how-do-i-create-and-edit-notes), [imports](https://help.knowt.com/en/articles/10305785-how-do-i-use-the-ai-summarizers), [games](https://help.knowt.com/en/articles/12010990-getting-started-with-knowt-play). | Keep manual writing direct. Let any existing material launch the next study activity. Avoid making users find a separate generator for each file type. |
| StudyFetch | Course material becomes a study set with notes, cards, quizzes, and tutor help. Its official tutorial places tutor chat throughout material and practice views. Its flashcard tools support several question formats from the same material. [Product](https://www.studyfetch.com/), [tutor tutorial](https://www.studyfetch.com/docs/docs/6a617efc609b2cff6eb182a1), [flashcards](https://www.studyfetch.com/fa/features/flashcards). | Keep contextual help available while studying; preserve selection when changing activity. Do not copy its full feature inventory into navigation. |
| Turbo AI | Its student product describes editable notes from uploads, folders, flashcards, and quizzes scoped to topics or chapters. [Student workflow](https://www.turbo.ai/for-students). | The document is a durable starting point, with follow-on study tools nearby. Treat its marketing performance claims as unverified; they are not needed for this design. |
| Anki | Notes store reusable fields; templates produce cards. Decks are broad study groupings, while tags allow flexible classification. Updating imported notes in place can preserve card scheduling. [Notes/cards](https://docs.ankiweb.net/getting-started.html), [organization](https://docs.ankiweb.net/editing.html), [updates](https://docs.ankiweb.net/importing/text-files.html). | Stable item IDs and learning history must survive ordinary edits. A new game or view should not duplicate cards or reset progress. |

Notion is a useful adjacent reference: pages, subpages, and a customizable home make a workspace personal. Nooks should borrow that sense of ownership without asking a student to design a database before studying. [Notion personal wiki](https://www.notion.com/help/guides/personal-wiki).

There is already a direct ChatGPT competitor: Quizlet's own instructions describe turning the conversation into a set and flipping cards in ChatGPT, with further editing and modes on Quizlet. Nooks needs a coherent in-place writing/practice/continuity experience and its social nook layer as differentiation. [Quizlet in ChatGPT](https://help.quizlet.com/hc/en-us/articles/44716146144909-Create-flashcard-sets-directly-in-ChatGPT).

## The simplest user journey

### 1. One Create entry, many inputs

A persistent **+ Create** opens one compact composer:

```text
What are you studying?
[Type a topic, paste material, or give an instruction…]

[Add material]  [Choose from library]
Using: Cell respiration · Lecture 4.pdf     Change

Notes   Flashcards   Quiz   More
                                        Create flashcards →
```

The text box accepts intent and pasted material; attachments and saved items appear as removable chips. Selecting an output changes the action label. Title, course, card count, difficulty, and formatting are optional, progressively disclosed controls. There is no mandatory naming/filing wizard. **Write a note** still opens the document immediately.

On the document in the user's screenshot, show **Add material** and **Choose from library** in the empty state. Once text exists, direct **Flashcards** and **Quiz** actions use it. They must not remain disabled merely because the note is untitled or waiting for autosave.

### 2. Use what is already in front of the student

| Starting point | Default input | Action budget |
| --- | --- | --- |
| Writing in a note | Current editor draft | Flashcards or Quiz: one click, then the result. |
| Highlighted passage | Only that passage, with a link to its note | Select → Make cards/Quiz/Explain. |
| Library | Explicitly selected items | Multi-select → Create → result. |
| PDF or uploaded source | Current source, optionally selected pages | Choose output; no re-upload. |
| Existing flashcards | The current set | Quiz/Match/Sprint immediately; AI enrichment only when needed. |
| Conversation | The specific response/excerpt the user selected or intentionally supplied through the host | Save as note/Make cards/Quiz; no full-history import. |
| New topic, no material | The user's topic request | Generate with a clear “From your topic” label, not a false source citation. |

Creation is **additive** by default: making cards from a note leaves the note intact. The new item inherits its explicitly selected course/topic and links back to its inputs. Auto-name it, let the student rename inline, and open it immediately. Do not force another Save to Library step.

### 3. A visible “Using” control, shared everywhere

The editor, creation composer, and tutor use the same source picker and scope representation. A quiet **Using: This note** control expands to a searchable checklist of materials, with selected items at the top. Explain scope through concrete names, not the word “context.”

Default precedence: an explicit selection, then the current item, then explicitly attached materials. A new session may resume a previously confirmed topic scope. Never silently include the whole library or every source in a course. Changing a nook must preserve scope. Changing the studied topic replaces scope; it must not accumulate old material.

### 4. Find everything in one Library

Open to **Continue studying** and **Recent**, with course/topic navigation available. Notes, cards, quizzes, and sources live in one list; type chips filter it. An item page can show **Made from** and **Created from this** so a student can move between a lecture, their note, cards, and quiz without searching again. Search spans titles and content the student can access.

No forced folder hierarchy, duplicate “AI notes” section, or separate games library. An unfiled item stays easy to find. Bulk move is available later without changing IDs or breaking source links.

## Data and context design

The current repository already has course/topic IDs, artifact revisions, note autosave, reviewed session summaries, bounded `context_get`, and selected-item retrieval contracts. Preserve them. The following is the missing link between those pieces, not a second organization system.

| Entity / extension | Required behavior |
| --- | --- |
| Source | Stable ID, owner, source type, title, import status, stored content or authorized reference, current revision. A copied upload and a live external reference are different source types. |
| Source revision | Immutable content/extraction snapshot, hash, page/slide/time markers, extraction quality/status. New imports or edits create a new revision. |
| Artifact | Existing note/card/quiz/exam with stable ID and revision. Add explicit input links rather than relying on the current free-text `source` field. |
| Input link | Target artifact + exact source/artifact ID and revision + optional selected passage/range. Multiple outputs may reference one source without duplicating it. |
| Generation request | Operation ID, requested output, explicit input refs/snapshots, instruction, destination, state, resulting artifact IDs. Retry is idempotent and cannot make duplicate sets. |
| Practice item and attempt | Stable card/question ID, content revision, user response, timing, rating. Games consume those IDs. Cosmetic edits preserve history; material answer changes can flag a review, with past attempts retained. |
| Study session bookmark | Existing reviewed summary + selected item IDs + unresolved topics + next action. This is continuity, not a hidden transcript dump. |

For a dirty note: flush its autosave and use the returned saved revision, or explicitly snapshot the current draft if persistence is unavailable. Never generate from stale saved text while presenting it as the current note. Never block typing while generation runs.

When a source changes, show **Source updated · Review changes** on derived artifacts. Keep the student's edited content intact. Refresh proposes an update or makes a new version; it does not silently overwrite edits or reset learning history. Deleting a source does not silently cascade-delete every derivative; mark the source unavailable and explain the choice to remove linked material separately. Account erasure is a distinct complete deletion flow.

For grounded creation, store evidence references at the smallest useful unit: a note section, card, or quiz question. **Show source** opens the exact page/passage when available. If an answer extends beyond selected material, mark the addition as general explanation. Failed extraction should show a recoverable error, not fabricate a plausible note. A topic-only generation must not invent citations.

For future sessions, retrieve selected scope in this order: compact reviewed session bookmark → material metadata/revisions → relevant excerpts → larger source reads only as needed. Keep short identifiers in the UI and expose titles to the student. Preserve permissions at every step. Notes and imported content are reference data, never instructions with authority over the app or model.

## ChatGPT-native and standalone are different execution paths

Inside ChatGPT, the host can generate content and invoke Nooks tools with specific material or output. Nooks stores the resulting artifacts and supplies requested saved material later. Its embedded UI must not claim to possess the full host conversation or automatically reorganize ChatGPT's sidebar. OpenAI's guidelines prohibit requesting full chat history/prior-turn arrays or reconstructing the complete log; they allow operation on intentionally supplied snippets/resources. [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

For continuity, use an explicit **Save for next time** study bookmark, or a user-selected response saved as a note. A later ChatGPT session retrieves that chosen course/topic or bookmark. Access to a person's ChatGPT account is not a general conversation-history or token-usage API.

The standalone Vercel preview cannot inherit ChatGPT's paid model usage. Real standalone generation needs an authenticated server-side AI provider, quotas, and billing/abuse controls. Until that exists, show an honest handoff to ChatGPT or a clearly labeled demo. Do not make an apparently working Generate button return unrelated canned output.

## Implementation order

1. **Immediate UX:** shared creation composer, explicit material chips, current-draft generation, empty-note Add material, one-click transformations, additive save, shared search picker. Correct source/scope mistakes before adding more modes.
2. **Reliable material handling:** typed source descriptors, source IDs/revisions, provenance links, import states, file limits, retry/idempotency, canceled-job recovery. Initially support pasted text, saved notes/cards/quizzes, and explicit excerpts; add parsers per tested format instead of promising “any file.”
3. **Continuity:** integrate the existing context and session contracts end-to-end; verify host behavior. Add lineage navigation and source-update review. Account sync must preserve the same model used by the browser preview.
4. **Practice coherence:** shared card/question IDs and attempts, games over the same material, missed-item review, later spaced repetition. Nook rewards observe authorized study events, not model token consumption or private note bodies.

## Acceptance checks

- A first-time student can paste material and get cards without naming a course or note.
- Flashcards made immediately after typing include the last unsaved sentence.
- Selecting one paragraph excludes the rest unless the user expands the selection.
- Three selected Library items can produce one quiz; removing one chip removes it from generation.
- Changing output type preserves typed text, attachments, selected scope, and draft.
- Empty/failed import states explain what is needed and retain the student's input.
- Generated notes open in the same editable/autosaving editor as handwritten notes.
- Changing nooks leaves open documents, selected materials, and learning history intact.
- A source update flags dependent work without overwriting human edits.
- Quiz/game results refer to the actual items studied; switching modes does not duplicate history.
- A second user cannot resolve source IDs, snippets, generation jobs, or artifacts from the first user.
- Public nook presence never includes note bodies, source titles, chats, or private study goals.
- New ChatGPT sessions can resume a selected bookmark without importing old chat logs.

Validate the design with five students doing three tasks: paste lecture notes and make cards; turn a selected passage into a quiz; return tomorrow and resume the same topic. Measure completion, wrong-source errors, time to first useful material, and whether they can predict where the result will be saved. “Idiot proof” should mean obvious defaults and recoverable actions, not more onboarding text.
