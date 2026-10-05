# Notable UI reference and study experience research

Research date: October 1, 2026. Original repository: Blackbox-Technologies/Notable, locally inspected at `/private/tmp/notable-macos-reference-2ae1b4d`. This is source-code analysis of the Mac Catalyst interface, not a claim that the old native application was built or visually rendered. The README is only “Notable / Transform your homework”; feature evidence comes from the SwiftUI views, routing, asset color definitions, and document models.

## Product interpretation

Notable is a durable study space for ChatGPT: the conversation supplies tutoring and content generation; Notable supplies structured material, beautiful study modes, retrieval, progress, focus, and continuity. The student should move from understanding to practice without leaving their conversation. Avoid reproducing the old app's second chat composer. “Ask ChatGPT” should carry the current note, question, selection, and learning state into the existing ChatGPT conversation.

## Original visual identity

- `MainPage.swift`: expanded sidebar width 350, collapsed width 50; profile avatar and identity; Home, View, Ask, Search, Settings. Selection has a pale cyan rounded background; sidebar has a thin cyan right edge. Independent navigation paths retain each tab's history.
- `HomePage.swift`: SansitaOne 40px Notable title; Scada for body text and most controls. Bold display headings contrast with quiet gray metadata. Create menu sits at top right.
- Original light palette from asset definitions: Cyan `#70F0D9`, TextCyan `#59CEB9`, Background approximately `#F5F6FA`, Primary black, CardBG white. Dark variants reverse primary and card surfaces. Type colors: notes green, scanned notes purple, audio notes red, quizzes blue, flashcards orange, unknown gray.
- `DocumentListCard.swift`: portrait covers 180×260, five recently accessed documents per shelf, horizontal browsing, title/date/type chip, “View all”. Library grid covers 170×250, list covers 50×75. Cards use rounded corners and prominent shadows.
- `ContinueStudyingCard.swift`: a larger most-recent document with cover, title, description, type, date. Resume is a first-class home activity.
- `NotebookPage.swift`: wide photographic cover fading through a gradient into the document; large editable title; Original Text button; rendered Markdown below.
- `FlashCardSetPage.swift`: centered large card, 0.4s flip animation, star affordance, directional transitions, progress fraction and circular navigation buttons. Finish state has circular completion visualization.
- `QuizPage.swift`: large rounded question surfaces, quiet question number, horizontal question navigator, full-width choice rows. Selected answer uses a mint tint. Results show a circular score, correct count, and per-question review.
- `ImagePickerPage.swift`: searchable categorized cover gallery and explicit selection. The visual personalization is functional rather than decorative.

## Active original features and routes

| Area | Functionality observed | Main sources |
| --- | --- | --- |
| App shell | Launch/loading, cached-account lookup, sign-in or main view, five navigation areas, collapse sidebar | ContentView, LaunchScreenView, MainPage |
| Home | Resume latest note/quiz (deck resume renderer exists but resolver omits decks), recent Notes and Learn shelves, empty state, create menu, tutorial | HomePage, ContinueStudyingCard, DocumentListCard |
| Library | Note/Quiz/Flashcard segmented filter, sort by creation date/title, grid/list switch, item count, open/edit cover/share note/delete menus | ViewPage, ViewCardsList, ViewItemsList, DocumentCard, DocumentRow, ViewEditButton |
| Search | All document types; match title, description, source text, type, formatted date; recent search list; navigate to result | SearchPage, DocumentRow |
| Notes | Markdown rendering, editable title, original text popover/editor, create quiz/cards from a saved note, Chat with Note action, PDF export/share, save/edit metadata/cover | NotesPage, NotebookPage, MarkdownView, SaveNoteView, BuildSaveNoteView, Utils |
| Magic Notes | Start blank note; rendered preview alongside editable source; selected-text AI enhancement with optional instruction; insert enhanced content after selection; tutorial | MagicNotePage, MagicNoteMarkdown, SelectedTextView |
| PDF import | macCatalyst-specific create option, file choose/change, PDF preview, start/end page range, extracted text, continue into note generation | PDFImportPage, NoteImportNavigationView |
| Generation | Optional additional instructions; loading/progress/errors; streaming material; limits temporarily disable creation | LoadingPage, QuizLoadingPage, FlashCardLoadingPage |
| Quizzes | Prompt or source note/deck, number-of-questions slider 1–50, generate, editable title/questions/choices/correct answer, add/delete questions, save cover/description, start session | QuizSettingsPage, QuizLandingPage, QuizSavePage |
| Quiz sessions | Multiple choice selections, per-question navigation, submit, score %, correct count, correct/incorrect answer review, answer-choice expansion, prior attempts with date/score | QuizPage, QuizResultsPage, QuizLandingPage |
| Flashcards | Prompt or source note/quiz, number-of-cards slider 1–50, generate, editable title/term/definition, add/delete terms, show-all/collapse, save cover/description | FlashCardSettingsPage, FlashCardLandingPage, FlashCardSavePage |
| Card study | Flip term/definition, select which side appears first, previous/next, restart, shuffle, star, completion screen, replay all or starred cards | FlashCardSetPage |
| Tutoring | Streamed questions/answers, reset chat, context handed in from note action, six-message history limit; general document linking still marked coming soon | AskPage, AskManager, NotesPage |
| Account | Google sign-in, name/email/joined date, document counts, token statistics, sign out, terms/privacy/support, subscription tier/billing links | AuthSignInPage, AccountPage, DailyTokenCountView |
| Onboarding | Three-part tutorial for creation/navigation/AI disclaimer; recording/Magic Notes contextual tutorials | TutorialView, CustomNotesAlert, MagicNoteTutorialView |
| Recording (deferred now) | Microphone start/stop, pulsing animation, elapsed timer, waveform, transcript preview/editor, audio model choices, photos, handwritten/Magic Notes alongside audio, transcript→note | Recording folder, NoteRecordingNavigationView, TranscriptEditorView |

Important persistence fields in original models: stable ID, title, description, originalText, createdAt, lastAccessed, coverImage, documentType; note Markdown content; quiz sections with question/choices/answer and attempts; deck sections with term/definition. Preserve source links between derived material and its note, and persist session state rather than using array indexes as identity.

## Dormant or legacy code: do not mistake for shipped functionality

- `NotebookPage.swift` contains several hundred lines of commented section/bullet/keyword editors, expand/collapse all, images assigned to sections, image reordering/moving/zoom, section/bullet insertion/deletion/reordering. Active notes currently render Markdown through MagicNoteMarkdown instead.
- `NoteModel.swift` still defines old section-related structures, but its `sections` and `magicNote` document fields are commented out. `MagicNoteModel.swift` is a legacy section model; the active Magic Note editor uses NoteContent Markdown.
- `BuildNotePage.swift` duplicates earlier note and generation controls; it is absent from the current Xcode project references. `NotesPage.swift` is the routed current note page. `BuildSaveNoteView.swift` remains actively referenced for newly built note save.
- `View/Other/Ananth Notes/` contains earlier recording/display experiments, not the routed recording path; duplicate RecordingView and old content type reveal its legacy status.
- Scanner sheet and scanner constructor in HomePage are commented out. Scan styling and tutorial references survive but do not prove a currently reachable scan UI.
- DailyQuoteCard is explicitly excluded on macCatalyst, included on iOS. Do not treat it as a visible Mac home panel.
- MonthlyLimitPage is effectively a placeholder; active limit handling uses PremiumPage sheets.
- Flashcard stars are created false when entering a session and are session-local; no durable mastery, review schedule, plant system, points, game system, planner, Canvas integration, or collaboration UI exists in this repository.
- Quiz settings declare `answersPerQuestion`, but the visible settings surface only changes question count. Original QuizPage is multiple-choice, not a full multi-format timed exam.
- AskPage says linking to a document source is coming soon even though the note action can already provide context. General source picker is not implemented.
- Paid upgrade sheets and Stripe checkout links are the old standalone app's behavior. They must not be copied into a ChatGPT plugin's digital upsell flow without checking current plugin commerce policy.

## Primary study-product sources and lessons

### Quizlet

[Official Flashcards guide](https://help.quizlet.com/hc/en-us/articles/360030988091-Studying-with-Flashcards) describes flipping, arrow navigation, shuffle, term/definition orientation, and know/still-learning sorting. [Official Practice Tests guide](https://help.quizlet.com/hc/en-us/articles/25946589648013-Studying-with-Practice-Tests) describes source-based tests, adjustable question types/count and time limit, plus score review. [Official ChatGPT app guide](https://help.quizlet.com/hc/en-us/articles/44716146144909-Create-flashcard-sets-directly-in-ChatGPT) documents conversation→cards and card flipping directly in ChatGPT; further editing, study modes, mastery, and sharing hand off to Quizlet. Recommendation: Notable should retain those deeper activities in the ChatGPT workspace and clearly distinguish recognition practice from scored assessment. Add keyboard support and a persistent review queue.

### RemNote

[Official product page](https://www.remnote.com/) connects notes, PDF source material, flashcards, quizzes, summaries, and per-topic mastery. It presents an exam-date-driven daily schedule and cards that stay connected to notes. Recommendations: keep source provenance visible, let users turn one source into several practice modes, use one compact “Today's study plan”, and show mastery by topic rather than only total points. Official editor and exam-scheduler image references are [editor](https://www.remnote.com/assets/homepage/images/homepage-editor-sample.webp) and [scheduler](https://www.remnote.com/assets/onboarding/v2/paywall/exam-scheduler.webp); these are reference links, not assets licensed for reuse.

### Forest

[Official product page](https://www.forestapp.cc/) makes elapsed focus effort visible as growing trees, with a persistent forest and focus statistics. It also describes group focus and session goals. Recommendation: a central quiet plant illustration, duration presets, a single start/pause control, and a garden of completed sessions. Notable in a browser iframe cannot honestly promise OS-level app blocking. Use gentle pause/recovery instead of implying browsing elsewhere is detectable or killing a student's plant. Official visual reference: [focus timer](https://www.forestapp.cc/assets/app-DFgTQXtu.webp).

### Study Together

[Official site](https://www.studytogether.com/) describes atmospheric rooms, personal timers/goals, group rooms, study statistics, rewards, and mindfulness breaks. It now directs new users to StudyStream. Recommendation: rooms with a shared goal and timer plus personal task, opted-in presence, and a clear session ending. Group counts/presence must be real server state or marked demo; do not fake live social proof.

## Recommended Notable design direction

1. **Identity:** retain mint as the brand thread; use warm paper `#F7F7F2`, dark ink `#263F37`, muted sage surface `#EAF0E6`, white cards, subtle border `#DDE5DD`, muted text `#718077`, and restrained peach/lavender accents. Mint remains an accent rather than flooding the whole canvas. This palette is an interpretation, not the original app's exact colors.
2. **Typography:** editorial serif for major greetings/document headings paired with a crisp system sans for controls. The original SansitaOne expresses warmth but can become visually loud when used for every screen. Keep reading text 16px+ with 1.6 line height and 65–75ch measure.
3. **Desktop layout:** 224px soft sidebar, central study canvas, optional 280px right rail for session/plant/next action. No unrelated analytics wall. Collapse into tabs and stacked cards below 900px. Full focus/quiz/card sessions hide peripheral panels.
4. **Home:** greeting; tiny continuity line; one large “Continue where you left off” card; Today plan; recent materials; current plant. Show one primary action for the student's next useful step.
5. **Library:** course/subject collections, text search, material-type filters, grid/list, useful cover/metadata, editable title/cover, clear saved status. Seed examples must be labeled sample materials.
6. **Notes:** cover, topic/title, source chip, readable sections, key concepts and callouts, edit toggle, action menu “Make cards / Quiz me / Practice exam / Ask ChatGPT”. Save drafts and warn on irreversible delete. Text enhancement sends selected content and instructions to ChatGPT rather than secretly calling Notable-funded AI.
7. **Cards:** one card, progress strip, reveal, keyboard hints, star, know/still-learning or four confidence grades, shuffle; end with completion/next-review. A clickable card needs role/button semantics and focus support.
8. **Quiz vs exam:** practice mode can show feedback after each answer; exam mode withholds correctness until submit, has timer/flagging and review. Explain wrong answers and allow retry missed topics. Do not award full mastery merely for flipping cards.
9. **Games:** match terms/definitions, rapid-recall streak round, word/definition sorting. Use short rounds, real accuracy feedback, and reward meaningful learning rather than arbitrary clicking.
10. **Focus and garden:** visible duration, start/pause/reset, focus/break phases, task attachment, elapsed-state restoration across views/reload, plant growth proportional to earned focused time, completed plants in garden. Give optional ambient sound controls; never autoplay.
11. **Points:** small celebratory moments for completing reviews, quizzes, tasks and focus sessions; idempotent reward events; history of why points were earned; no repeated reward for restarting the same completed session. Streaks should encourage recovery.
12. **Continuity:** save course/source IDs, last opened material, current card/question, answers, review state and next date, pending task, timer deadlines, reward events. Current conversation context and durable study history are distinct; never imply automatic access to every past ChatGPT chat.
13. **Empty/loading/error states:** show exact next action, preserve user input, label sample/demo behavior, and distinguish local draft vs account-synced save. No permanent disabled “coming soon” controls masquerading as working features.
14. **Integration:** ChatGPT provides conversation and generation; Notable provides stateful UI and storage. Real OAuth/backend/Canvas/group rooms require configured services and explicit status. Lecture recording deferred per user request.

## Build acceptance checks

- Every visible primary button either performs its labeled action or shows honest configuration status.
- Material can be created/edited/deleted; filters and search work; source-based generation carries context.
- Card navigation never exceeds array bounds; flip resets correctly; starred/weak-card replay works; state survives reload.
- Quiz selection remains stable on previous/next; submit counts unanswered consistently; exam timer cannot duplicate submission; results and retry are coherent.
- Focus timer uses a deadline, not only interval decrements; pause/resume and route changes preserve state; no duplicate plants/points.
- Game cards do not double-score; completion has replay and return path; keyboard and reduced-motion behavior work.
- Narrow viewport has no horizontal overflow; dialogs focus/close correctly; all interactive controls have visible focus and accessible names.
- Real external integrations are differentiated from sample data. No secret material from the original app initialization is included in code, docs, or tool output.

## Implementation traps to improve in the new UI

- ContinueStudyingCard defines a flashcard renderer, but getRecentDocument only resolves notes and quizzes. New resume behavior should support every material type by stable ID.
- Original note export is a SwiftUI image rendered as one PDF page, with no genuine multi-page pagination. New print/export should paginate readable HTML and avoid unreadable long single pages.
- Most-recent shelves sort by lastAccessed; the general library defaults to created date. New UI should offer explicit recently studied sorting.
- Original search's empty query chooses three shuffled documents, and recent searches are displayed without a clear replay handler. Use meaningful recent materials and clickable query history.
- Full-text note extraction interpolates the NoteContent object instead of explicitly accessing its .content string; don't port that serialization into ChatGPT context tools.
- Several create controls check only an error string rather than validating blank prompts. Validation should explain what's missing before generating.
- Original note enhancement can reject selections ending at the final character because of a >= bound check; selections should support end-of-document text.
- Original flashcard progress is session-local and stars reset on entry. Durable progress is central to the reboot.
- Original UI uses fixed large widths and negative padding in several panels; rebuild responsive layouts instead of transcribing those measurements.

## Per-file UI inventory

All 68 files beneath `Notable/View` were inventoried for view declarations, controls, routing, and current/legacy status; principal screens and stateful handlers were read in detail. The following list makes scope auditable. The additional Custom, ContentView, LaunchScreenView, Utils, document models, and Xcode source references were inspected as supporting evidence.

| File within Notable/View | Declared UI components | Classification |
| --- | --- | --- |
| `Auth/AuthSignInPage.swift` | AuthSignInPage, AuthSignInAnimation | Routed screen / supporting component |
| `Components/DailyTokenCountView.swift` | DailyTokenCountView, DisplaySubscriptionTypeView | Routed screen / supporting component |
| `Components/DocDownloadButton.swift` | DocDownloadButton | Routed screen / supporting component |
| `Components/DocumentCard.swift` | DocumentCard, DocumentCardNote, DocumentCardQuiz, DocumentCardFlashcard | Routed screen / supporting component |
| `Components/DocumentRow.swift` | DocumentRow, DocumentRowNote, DocumentRowQuiz, DocumentRowFlashcard | Routed screen / supporting component |
| `Components/LoadingImageView.swift` | LoadingImageView | Routed screen / supporting component |
| `Components/MarkdownView.swift` | MarkdownView | Routed screen / supporting component |
| `Components/ViewEditButton.swift` | ViewEditButton | Routed screen / supporting component |
| `FlashCards/FlashCardLandingPage.swift` | FlashCardLandingPage, TermsView, FlashcardTerm | Routed screen / supporting component |
| `FlashCards/FlashCardLoadingPage.swift` | FlashCardLoadingPage | Routed screen / supporting component |
| `FlashCards/FlashCardNavigationView.swift` | FlashCardNavigationView | Routed screen / supporting component |
| `FlashCards/FlashCardSavePage.swift` | FlashCardSavePage | Routed screen / supporting component |
| `FlashCards/FlashCardSetPage.swift` | FlashCardSetPage, FlashcardView | Routed screen / supporting component |
| `FlashCards/FlashCardSettingsPage.swift` | FlashCardSettingsPage, FlashCardSettingsSliderView | Routed screen / supporting component |
| `Import/NoteImportNavigationView.swift` | NoteImportNavigationView | Routed screen / supporting component |
| `Import/PDFImportPage.swift` | PDFImportPage, currentPageView | Routed screen / supporting component |
| `Main Toolbar/AccountPages/AccountPage.swift` | AccountPage, SignOutButton, SubscriptionBoxView, AccountPageSection, AccountPageText | Routed screen / supporting component |
| `Main Toolbar/AskPages/AskManager.swift` | CustomChatMessage | Routed screen / supporting component |
| `Main Toolbar/AskPages/AskPage.swift` | AskPage, UserMessageView, BotMessageView | Routed screen / supporting component |
| `Main Toolbar/HomePages/CircularMetricsView.swift` | CircularMetricsView, ArcShape | Routed screen / supporting component |
| `Main Toolbar/HomePages/ContinueStudyingCard.swift` | ContinueStudyingCard, ContinueStudyingNoteView, ContinueStudyingQuizView, ContinueStudyingFlashcardView | Routed screen / supporting component |
| `Main Toolbar/HomePages/DailyQuoteCard.swift` | DailyQuoteCard | iOS-only on Home; explicitly hidden on macCatalyst |
| `Main Toolbar/HomePages/DocumentListCard.swift` | DocumentListCard, EmptyDocumentCard | Routed screen / supporting component |
| `Main Toolbar/HomePages/HomePage.swift` | HomePage, HomeTopBar, CreateCardView, CreateListView | Routed screen / supporting component |
| `Main Toolbar/MainPage.swift` | MainPage | Routed screen / supporting component |
| `Main Toolbar/SearchPages/SearchPage.swift` | SearchPage, ListItem | Routed screen / supporting component |
| `Main Toolbar/ViewPages/ViewCardsList.swift` | ViewCardsList | Routed screen / supporting component |
| `Main Toolbar/ViewPages/ViewItemsList.swift` | ViewItemsList | Routed screen / supporting component |
| `Main Toolbar/ViewPages/ViewObservedList.swift` | ViewListItem | List data model; observed-object approach commented at use sites |
| `Main Toolbar/ViewPages/ViewPage.swift` | ViewPage | Routed screen / supporting component |
| `Notes/BuildNotePage.swift` | BuildNotesPage, GenButtonView | Legacy/unrouted; BuildNotePage absent Xcode source references |
| `Notes/BuildSaveNoteView.swift` | BuildSaveNoteView | Routed screen / supporting component |
| `Notes/FancyNotesView.swift` | FancyNotesView | Legacy/unrouted; BuildNotePage absent Xcode source references |
| `Notes/LoadingPage.swift` | LoadingPage | Routed screen / supporting component |
| `Notes/MagicNotes/MagicNoteMarkdown.swift` | MagicNoteMarkdown, MagicSectionRow | Routed screen / supporting component |
| `Notes/MagicNotes/MagicNotePage.swift` | MagicNotePage | Routed screen / supporting component |
| `Notes/MagicNotes/MagicNoteTutorialView.swift` | MagicNoteTutorialView, PageThreeView, PageTwoView, PageOneView | Routed screen / supporting component |
| `Notes/MagicNotes/SelectedTextView.swift` | SelectedTextView | Routed screen / supporting component |
| `Notes/NoteRecordingNavigationView.swift` | NoteRecordingNavigationView | Recording flow; deferred by user request |
| `Notes/NotebookPage.swift` | NotebookPage | Routed screen / supporting component |
| `Notes/NotesPage.swift` | NotesPage, LoadNoteCover, GenButtonView | Routed screen / supporting component |
| `Notes/Recording/AddPhotosButton.swift` | AddPhotosButton | Recording flow; deferred by user request |
| `Notes/Recording/AudioWaveformView.swift` | AudioWaveformView | Recording flow; deferred by user request |
| `Notes/Recording/CreateNoteRecordingButton.swift` | CreateNoteRecordingButton | Recording flow; deferred by user request |
| `Notes/Recording/ElapsedTimerView.swift` | ElapsedTimerView | Recording flow; deferred by user request |
| `Notes/Recording/MicrophoneView.swift` | MicrophoneView | Recording flow; deferred by user request |
| `Notes/Recording/RecordingMicPanel.swift` | RecordingMicPanel | Recording flow; deferred by user request |
| `Notes/Recording/RecordingView.swift` | RecordingView | Recording flow; deferred by user request |
| `Notes/Recording/TranscriptView.swift` | TranscriptView | Recording flow; deferred by user request |
| `Notes/Recording/WhisperModelTypeView.swift` | WhisperModelTypeView | Recording flow; deferred by user request |
| `Notes/SaveNoteView.swift` | SaveNoteView | Routed screen / supporting component |
| `Notes/TranscriptEditorView.swift` | TranscriptEditorView | Recording flow; deferred by user request |
| `Other/Ananth Notes/NoteDisplayView.swift` | NoteDisplayView | Legacy/unrouted; BuildNotePage absent Xcode source references |
| `Other/Ananth Notes/RecordingView.swift` | RecordingView | Legacy/unrouted; BuildNotePage absent Xcode source references |
| `Other/ImagePages/ImageObservableURL.swift` | Data / image helper | Routed screen / supporting component |
| `Other/ImagePages/ImagePickerPage.swift` | ImagePickerPage | Routed screen / supporting component |
| `Other/ImagePages/SwiftImagePicker.swift` | ImagePicker | Routed screen / supporting component |
| `Other/ModelTypeDescriptionView.swift` | ModelTypeDescriptionView | Routed screen / supporting component |
| `Other/MonthlyLimitPage.swift` | MonthlyLimitPage | Placeholder; actual limit UI uses PremiumPage |
| `Other/PremiumPage.swift` | PremiumPage, PremiumBullet | Old standalone billing UI; do not port to plugin |
| `Other/TutorialView.swift` | TutorialView, PageThreeView, PageTwoView, PageOneView | Routed screen / supporting component |
| `Quiz/QuizLandingPage.swift` | QuizLandingPage, QuizAttemptsView, QuestionsView, ExpandableQuestion | Routed screen / supporting component |
| `Quiz/QuizLoadingPage.swift` | QuizLoadingPage | Routed screen / supporting component |
| `Quiz/QuizNavigationView.swift` | QuizNavigationView | Routed screen / supporting component |
| `Quiz/QuizPage.swift` | QuizPage, QuestionView, AnswerChoiceView | Routed screen / supporting component |
| `Quiz/QuizResultsPage.swift` | QuizResultsView, correctAnswerView, ResultsAnswerChoiceView | Routed screen / supporting component |
| `Quiz/QuizSavePage.swift` | QuizSavePage | Routed screen / supporting component |
| `Quiz/QuizSettingsPage.swift` | QuizSettingsPage, QuizSettingsSliderView | Routed screen / supporting component |
