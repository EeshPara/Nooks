# Nooks focus timer: research and product pattern

Researched 2 October 2026. Scope: timer UX and its connection to study work, room progress, and community. These recommendations are proposals, not shipped features. Competitor descriptions below come from their own product pages, guides, or publisher listings; marketing performance claims are not treated as evidence of learning outcomes.

## Recommendation

Make a focus session the connective tissue of Nooks. A student opens a note or practice set, presses **Focus for 25 min**, and keeps working in that material. The timer quietly retains the current task, course, material, and nook. Completion creates one useful history entry and updates the nook collection. It should never require visiting a separate timer destination before studying.

The minimum useful loop is **choose work → start → study → save progress → take a break → resume the same work**. Keep setup optional, bring prior context forward, and reveal preferences only when requested.

## What the established apps do

| App | Observed timer pattern | Useful lesson for Nooks |
| --- | --- | --- |
| Forest | Offers countdown and stopwatch modes. The student chooses focus duration and a tree. Focus history becomes a visible collection; analytics support time ranges and tags. Optional Deep Focus blocks distracting apps; its enforcement depends on platform permissions. [Official product page](https://forestapp.cc/) | Make time visibly accumulate in the current nook. Keep subject/material attribution lightweight. Browser tab visibility cannot support the same app-blocking promise. |
| Focus To-Do | Puts the timer next to tasks. Tasks support dates, reminders, subtasks, recurrence, and notes; reports connect elapsed work with completion and project allocation. [Official product page](https://www.focustodo.cn/?lang=en_US) | Starting from a task should carry the task into the session automatically; students should not type a subject again in the timer. |
| Flow | Emphasizes an unobtrusive interval timer with recurring breaks, reminders, and session statistics. Session names, custom cycles, and calendar/export tools are additional controls. [Features](https://www.flow.app/features), [publisher listing](https://apps.apple.com/us/app/flow-focus-pomodoro-timer/id1423210932) | Keep the everyday surface small: remaining time, current work, pause. Put duration and cycle options behind one small menu. |
| Session | Uses an intention that stays visible across timer surfaces. Supports contextual session notes, flexible durations, partial sessions, and an overflow phase when the planned duration ends. Its guide describes a 25/5 cycle with a 20-minute long break; later changelog entries describe long-break scheduling by accumulated focus duration. [Guide](https://stayinsession.com/learn/getting-started-with-session-pomodoro-app), [changelog](https://stayinsession.com/changelog) | Remember the study intention and let the student finish a thought. Completion should offer a useful next step without erasing short but real work. |
| Study Bunny | Provides countdown, stopwatch, and an explicit break mode. Subject tags categorize time; ending early retains earned time. Its pause screen and break timer are distinct, and its FAQ advocates self-accountability because students may need other apps to study. [Tutorial](https://www.superbyte.site/tutorial), [FAQ](https://www.superbyte.site/faq) | Keep **Pause** and **Take a break** distinct. Going to a textbook, calculator, or browser tab should not be treated as proof of distraction. Do not copy pause penalties into Nooks. |

The fetched pages do not establish an exact current default focus/break duration for every competitor. Nooks should choose its own documented defaults rather than claim universal defaults.

## Lean Nooks interface

### At rest

One timer surface, reused on the nook page and in a compact header row:

- Main action: **Focus · 25 min**. One click starts with the current material if one is open.
- Optional context underneath: **Cell energy essentials · Biology**. Selecting it opens a small picker of current material, today’s tasks, and recent courses.
- Clicking **25 min** opens 15, 25, 50, and Custom. Retain the last choice; initial default 25.
- Do not require an intention form. Blank context is a valid general-focus session.
- When a student starts from a task, note, deck, or quiz, prefill the relationship. Do not mark a task complete merely because its timer ended.

### During focus

The compact strip shows **18:42 · Cell energy essentials · Pause**. Clicking its label returns to the material; clicking its time reveals controls. The full timer is optional. Its reserved layout must not cover the ChatGPT composer or document toolbar.

The current nook’s next reward receives one quiet progress treatment. Live local elapsed time may animate the preview; earned credit becomes authoritative after the save succeeds. Show **Saving progress…** when necessary. One credited session must not create a second award after refresh or retry.

**Pause** freezes credited time and exposes **Resume** plus **Finish session**. A small context menu contains reset/cancel. Cancelling a nearly completed session should not be the nearest large button to Pause.

### At the planned end

Use a small completion sheet anchored to the timer, not a blocking full-screen dialog:

**25 min saved · Cell energy essentials**

**Take a 5 min break** is primary. **Continue studying** is secondary. Add a compact optional outcome: Done / Keep working. A task is marked done only through that explicit choice. A note, quiz attempt, or deck review already has its own saved output; link those objects instead of requiring reflection text.

Recommended defaults: 25-minute focus, 5-minute break, 15-minute long break after four completed focus intervals. These are Nooks defaults, adjustable in preferences. Auto-start next focus is off by default. Break time earns no focus credit and is shown separately in session history.

The safest first implementation saves the planned interval then offers a new interval using the same context. A later explicit overflow mode can track additional time, but must change backend limits coherently; it must not silently count unlimited unattended time.

### During and after breaks

Use a calmer timer phase, a short optional chime, and **Resume Cell energy essentials**. Keep the previous work visible or one click away. Suggest standing up or drinking water rather than serving another quiz during a restorative break. Do not auto-pause or promise to control Spotify: the current integration uses Spotify’s own embedded controls.

A soft completion chime is optional. Respect muted audio and reduced-motion settings. Do not request browser notification permission on first load; offer it when someone enables timer alerts.

## Integration with the rest of Nooks

### Study and AI

- **From a note:** Focus opens no additional setup; the note remains editable with autosave. Selected-text Explain or Make cards stays available during focus.
- **From flashcards:** review outcomes attach to the running session. Finishing a set offers Review missed cards without stopping the timer.
- **From a quiz:** the completed attempt attaches to the session. Offer targeted practice from missed concepts when the student chooses, not on a timer interrupt.
- **From chat:** an explicit “help me study this for 25 minutes” action can propose an intention and attach user-selected material. It cannot silently start tracking from generic conversation.
- **At completion:** summarize observed work (e.g. 25 focused minutes, 12 cards reviewed), not inferred mastery or attention. No points for spending more model tokens or repeatedly generating content.
- **Next visit:** a Resume card restores the last material and optional next task. Context retrieval uses saved artifact IDs and a compact session summary; do not claim access to the full native ChatGPT transcript.

### Community

Session presence can say **Focusing**, **On a break**, or **Available**, with elapsed focus and public collection progress. Do not broadcast private note titles, prompt contents, or course names by default. A co-study session needs a shared schedule and optional join action, not a mandatory synchronized clock for everyone already in the public nook.

The timer’s room attribution must be clear when moving between nooks. Finish or keep the active session assigned to its original nook; never award the same elapsed interval to two nooks. A future move action may split credited intervals explicitly. Social feedback belongs at transitions rather than as repeated join animations while writing.

### Collections and goals

Study outcomes and minutes are complementary: elapsed time funds the nook collection; correct/retried answers inform study progress. One should not replace the other. Keep the next unlock visible and its conditions predictable, with the reveal itself as the surprise. Do not reward leaving the timer unattended, spending tokens, or foregoing healthy breaks.

## Data model and state boundary

Extend the existing focus-session record with optional `taskId`, `courseId`, `topicId`, `artifactId`, `studySessionId`, `intention`, and `cycleId`. Treat these as references to user-owned objects and validate access server-side. The session already records the starting nook/room; preserve that attribution.

The focus lifecycle should be authoritative and idempotent: ready → focusing → paused → focusing → saving → completed. Breaks form a distinct phase with their own start/end times and never enter reward calculations. Store wall-clock timestamps and accumulated pause intervals; recompute displayed remaining time on visibility/resume instead of trusting interval callbacks. Only one active focus session per user, with an explicit policy for a second device or tab.

A saved completion connects: session → its work references → immutable credited seconds → reward ledger → community summary. Retried completion returns the prior result. A failed save retains the session locally and shows an honest retry state; it must not show a permanent unlock before confirmation. AI-generated summaries are optional annotations, not the source of credited time or quiz scores.

## Gaps found in current Nooks code

- The home `RoomTimer` and Focus page expose different controls and context. Centralize the controller while allowing compact and full presentations.
- The default subject is hard-coded to Biology in `App.tsx`; starting from a different note does not automatically bind that note or course.
- Today’s intentions are independent checkboxes, not session context. A task should provide a direct Start focus action.
- Breaks currently use `sessionStorage` and separate cosmetic state (5/15 minutes). Focus completion does not advance a coherent focus/break cycle.
- Focus credit is already capped at the target duration; pause time is excluded, and completed sessions are idempotent. Preserve these protections when adding optional continuation.
- The home reset action cancels the current session. End-session semantics should be easier to understand than a prominent reset symbol.
- Completion currently saves time and shows a toast or reward celebration. Add the useful break/resume transition and links back to the actual work.

## Ship order

1. One shared focus controller; auto-attach current material; contextual Start focus action; hard-coded Biology removal.
2. Reliable completion → break → resume flow, compact timer everywhere, preserved state across navigation/reload.
3. Session history that links time to notes, decks, quiz attempts, and tasks; concise completion summary.
4. Presence phases and co-study scheduling after backend membership and authorization are working.
5. Optional stopwatch/overflow, customized cycles, and richer analytics once basic transitions are dependable.
