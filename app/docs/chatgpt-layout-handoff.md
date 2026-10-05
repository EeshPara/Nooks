# Nooks inside ChatGPT — designer handoff

Nooks is an immersive study surface around the student's existing ChatGPT conversation. It supplies the scenery, welcome, timer, to-do list, collection, people pill, library, notes, cards, and quizzes. **ChatGPT supplies the conversation and its message box. Nooks must not render its own chat input or transcript.**

## One full-width layout

Use the original desktop arrangement: Pomodoro and to-do on the left, welcome and study actions in the middle, collection on the right. Keep the people pill near the nook name. Use the full available width. There is no empty right-hand column, “Space for chat” control, reserved-chat layout mode, or URL-driven composition variation. Arrange lets students move the six workspace widgets from these defaults, with autosave and reset; it never moves or simulates the host conversation.

The welcome offers Notes, Flashcards, Quiz, and Write a note. In a connected ChatGPT session, creation actions send an explicit contextual request to the native conversation. In the standalone website, they show an honest copy-and-open-ChatGPT handoff. The website has no replacement message box and must not imply a host connection.

The [public preview](https://nooks-study-space.vercel.app/) uses this same full-width composition. Legacy `layout` and `chat` query parameters do not change it. On smaller screens, stack the welcome first, then readable widgets; do not squeeze controls to preserve desktop columns.

## Host boundaries

OpenAI documents fullscreen apps with ChatGPT's composer overlaid, with responses available through the native conversation. ChatGPT controls that composer, chat sheet, streaming, position, and system close control. Nooks does not open, close, resize, or detect an expanded native panel. Do not draw a simulated ChatGPT panel or promise transparency. [OpenAI UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines#fullscreen)

Apply host-provided safe-area insets and modest bottom breathing room only in an actual embedded session. These are safe boundaries and a design allowance, not measurements of the native chat panel. The standalone website does not reserve an invisible host region. [MCP Apps host context](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiHostContext.html)

## Study and context

Keep the flow direct: ask ChatGPT → generate from chosen material → save → open the confirmed saved note, card set, or quiz → study. Students can also write directly in an autosaving note and turn that writing into Flashcards or Quiz without copying it into another form.

When the student says “this,” use their deliberate choice: selected passage first; otherwise the current draft or selected material snapshots; otherwise the selected saved item; otherwise relevant material in the current conversation. Current writing remains authoritative while saving. Incoming AI material must not silently replace unfinished edits; show a ready-to-open notice until the current work is safe. Nooks sends only selected editor context where supported and does not archive the ChatGPT transcript automatically. [OpenAI UI state and model context](https://developers.openai.com/plugins/build/chatgpt-ui)

The product consists of the Nooks UI, MCP tools validating study actions, and account-owned storage. Showing the UI does not itself connect an account or authorize private data access. [Plugin UI reference](https://developers.openai.com/plugins/reference), [Authentication](https://developers.openai.com/plugins/build/auth)

The public site and local host harness verify layout and supported message behavior; final acceptance still requires a connected ChatGPT session on desktop and mobile, including generation, saving, reopening, and editing.
