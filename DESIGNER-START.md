# Designing Nooks with prompts

You describe what you want. The coding agent handles setup, code, checks and the preview.

**Say this in the chat:**

> Set up Nooks designer mode from https://github.com/EeshPara/Nooks. Read DESIGNER-START.md, open the live local preview for me, and handle the technical work. I will describe UI changes in plain English.

Then use ordinary requests such as “Make the timer smaller,” “Make this popup brighter,” or “Try this layout.” Screenshots and sketches are welcome. There is no database or API-key setup to do for design work.

## Instructions for the coding agent

### First session on this computer

1. Read this guide, `AGENTS.md` and `START-HERE.md`. Use the current computer's workspace and its available tools, not the old Mac's absolute paths in historical chat messages.
2. If needed, clone the **private** repository `https://github.com/EeshPara/Nooks`. Reuse an existing clean clone. Never discard local edits while pulling updates.
3. If the private repository cannot be accessed, report the exact access blocker. Let the user sign into the owner-authorized GitHub account or obtain a repository invitation; do not change visibility or share credentials. Same ChatGPT login alone does not grant GitHub access.
4. Find Node 22.12+ and npm. Prefer the Codex bundled workspace runtime when available. Handle environment/runtime setup yourself; do not send the designer a terminal troubleshooting checklist. Normal interactive sign-in, if required, is the user's step.
5. From the repository root, run `npm run designer`. It installs the locked dependencies when needed, starts the **published web UI** in its existing device mode and uses the stable local address `http://127.0.0.1:5188/`. If that port already hosts this Nooks preview, reuse it. If another app owns the port, handle the conflict without killing unrelated processes. Keep the chosen origin stable because browser-local work belongs to that origin. Keep this process running while designing.
6. Open that exact URL with the app/browser tools. Verify the welcome screen, note editing, study/practice, timers, collection, Spotify panel, intro replay and background assets. Do not reset existing browser data to get a clean screenshot; use a separate development origin if necessary.
7. Give a brief “Ready—describe the first change” update. The designer should not need to decide folders, ports, package managers, deployment projects, or tool names.

### During UI work

- **Use `web/ui/src/` and `web/ui/public/` as the design work surface.** It starts from the actual published website UI. Do not bounce the designer among the three snapshots.
- Reuse the existing components, behavior and data contracts. Prefer presentation changes. Keep notes autosaving, outside-tap/X/Escape dismissal, same-tab navigation, draggable widgets, focus credit rules, keyboard behavior and motion preferences.
- Keep the visible preview open and let hot reload show changes. Inspect the result at desktop and a smaller viewport when layout changes.
- After a meaningful change, run `npm run designer:check` from the root and affected behavior tests. Fix regressions yourself. Summarize the visual change rather than internal implementation details.
- Commit and push the design work to the same private GitHub repository so both computers can pull it. Preserve any unrelated changes. Do not overwrite a colleague's unpushed work.
- When asked to update the shared website/plugin, carry the reviewed UI-only changes into the matching `app/ui` and `cloud/ui` files, preserving host-specific differences. Follow the existing Vercel/Sites deployment paths in START-HERE.md. Do not bulk-copy pending app backend changes or create replacement services.
- The remote backend and native plugin remain the existing services. UI design never requires changing production credentials, database schema, billing, or public/private sharing. Handle any genuinely required integration work separately with appropriate tests.

### What the preview can honestly do

The preview uses the existing study engine with browser-local storage: notes, supplied flashcards/quizzes, practice, goals, timers, collections, illustrated nooks, sound/Spotify-link controls, and the intro. Those are interactive controls, not a flat screenshot.

ChatGPT generation, native tool calls and real multi-user hosted community require the native ChatGPT/plugin environment. Do not replace them with fabricated “AI generated” results or call sample profiles live users. Use the existing plugin for integration acceptance. The standalone preview does not borrow the ChatGPT subscription or synchronize its local notes to another browser.

Existing production-readiness gaps are documented in START-HERE.md. Keep them explicit; a UI edit is not evidence that all backend launch gates have passed.

## Setup verification

October 5, 2026: first-run dependency installation succeeded; `npm run designer:check` passed TypeScript and the public production build. The dedicated preview loaded at port 5188, served the Rainy Library video, and a manually edited note autosaved and remained in the Library after a page refresh. The screenshot `designer-preview.png` shows the working entry screen. This verifies this setup locally; private GitHub access and the runtime on the second computer still need the normal first-session check.
