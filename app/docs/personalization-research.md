# Notable: a personal study desk inside ChatGPT

Research checked against official product and developer pages. This is design guidance, not evidence that a particular aesthetic is popular on TikTok. No third-party popularity rankings or fictional social activity are used.

## Direction

**A study desk you settle into.** Keep Notable’s original soft mint, paper-like cards, generous spacing, and quiet typography. Put personal expression around the work: a desk name, coordinated color palette, carefully cropped cover, a small companion, and a shelf of plants earned through real focus. The actual note, exam, or deck stays visually dominant.

This should feel like one coherent product with different moods. Avoid a collage of pastel stickers, random fonts, emoji headings, or full-room scenery that competes with studying. A sleeping companion in a corner can create more identity than decoration on every card.

## What the references actually do

| Reference | Verified capability | Useful lesson for Notable |
| --- | --- | --- |
| [Notion personal templates](https://www.notion.com/templates/category/personal) and [personal dashboards](https://www.notion.com/templates/category/personal-dashboards) | A gallery of reusable personal dashboards and modular workflows. | Let students arrange a small set of useful widgets, then share a coherent desk preset. |
| [Notion page styling](https://www.notion.com/help/customize-and-style-your-content) | Page icons, covers, font choices, width, and content styling. | Name + icon + cover creates recognizable ownership without rebuilding navigation. |
| [Notion site customization](https://www.notion.com/en-gb/help/edit-and-customize-your-notion-sites) | Site theme, title/description, preview image, favicon, and navigation customization. | Give a public desk an intentional preview, rather than exposing the raw internal dashboard. |
| [LifeAt](https://lifeat.io/) | Virtual spaces, ambience, timer, tasks, notes, planning, and calendar tools. | A desk can combine atmosphere with practical, visible work. |
| [LifeAt official space gallery](https://lifeat.io/explore) | Categorized, credited spaces including libraries, cafes, rain, nature, and study rooms; curated selections. | Offer a small curated atmosphere gallery with creator attribution; make mood selection quick. |
| [LifeAt focus with others](https://lifeat.io/feature/focus-with-others) | Shared backgrounds, synchronized timers, public or invited rooms, and communication. | Actual coworking needs a shared timer and real presence service; a shared desk link alone should not imply a live room. |
| [Forest](https://www.forestapp.cc/) | Focus sessions grow trees and accumulate a visible forest. | Make the garden a record of attention, not an unrelated collectibles shop. |
| [Finch home page guide](https://help.finchcare.com/hc/en-us/articles/37780000231309-Exploring-the-Finch-Home-Page) | Goals, an evolving companion, quests, earned rewards, outfits/furniture, and friend interactions. | One named companion and small earned rituals can give continuity between sessions. |
| [Finch approach](https://help.finchcare.com/hc/en-us/articles/37935669335309-Our-Approach-to-Self-Care) | Gentle, flexible routines and customizable companion growth. | Use encouraging language and allow personal goals; do not punish students for missing a day. |
| [Virtual Cottage developer page](https://dui.itch.io/virtual-cottage) | A deliberately simple desktop focus app, ambient audio controls, and lighting that follows the computer’s time. | Atmosphere should reduce choices during focus. Do not attribute elaborate furniture editing to this app. |
| [StudyTogether](https://www.studytogether.com/) | Study rooms, goals, timers, ambience, and community features; site directs new users toward StudyStream. | A calm room is a social context, not a reason to add fake member counts or leaderboards. |

## Six concrete recommendations

1. **Name the space, then give it an intention.** Default “My study desk”; editable title and one short subtitle such as “Biology finals · one concept at a time.” Show the title on Home and the public preview. A compact “Customize desk” action opens a live preview, not a sprawling settings page.
2. **Four complete, curated themes.** Notable Mint, Warm Library, Lavender Evening, and Rainy Desk. Each changes coordinated surface, text, border, and accent tokens together. Allow a few compatible accent choices per theme; keep contrast and focus indicators fixed. No arbitrary low-contrast text colors.
3. **One companion, one earned garden.** Choose a sprout or a quiet companion; name it. It rests while studying, reacts gently when a session finishes, and appears on the focus page and one home widget. Garden plants belong to completed sessions with actual dates/minutes. Missed days do not kill a plant or reset earned progress.
4. **A modular desk with a strong default.** Default widgets: Continue studying, Today’s plan, Focus companion, and Review next. Optional: exam countdown, recent materials, garden shelf, weekly effort. Toggle and reorder in Customize with keyboard-accessible Move up/down controls. The desktop layout remains a clean two-column grid; the embedded narrow layout becomes one column.
5. **Personalize material where recognition matters.** Subject icon, coordinated subject color, and optional restrained cover on library cards. Let students choose a few curated covers, not endless decorative controls. A note’s reading view stays quiet and retains accessible body typography.
6. **Share the desk, deliberately.** A public preview can show title, theme, chosen widgets, and an optional garden summary. Materials require a separate explicit selection and preview. “Use this desk” copies appearance/layout into the recipient’s workspace; it does not link to the original owner’s private notes or ChatGPT conversation.

## Suggested theme system

These are proposed starting tokens, not copied product palettes. Verify contrast in the rendered app; muted text never inherits the accent.

| Theme | Background | Card | Main ink | Secondary ink | Border | Accent | Accent text |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Notable Mint | `#F5F8F6` | `#FFFFFF` | `#20352D` | `#53675E` | `#DEE8E2` | `#70F0D9` | `#163E35` |
| Warm Library | `#F7F3EB` | `#FFFCF7` | `#39322B` | `#706252` | `#E8DFD2` | `#E2C18D` | `#41301A` |
| Lavender Evening | `#F5F3F9` | `#FDFBFF` | `#343044` | `#696178` | `#E4DEEC` | `#CBBBF1` | `#3A2A59` |
| Rainy Desk | `#F1F5F8` | `#FBFDFF` | `#253744` | `#586F7F` | `#DAE4EB` | `#A9D5E6` | `#203E4B` |

Typography and layout remain stable across themes: one distinctive display style for the desk title, readable body/UI text, rounded but restrained cards, and consistent spacing. An optional cover is a short band or small illustration, not a full background behind text. Motion is subtle and respects reduced motion. Companion sound is off by default.

## Suggested customization model

Persist preferences per Notable workspace, not per generated artifact:

```ts
type DeskPreferences = {
  title: string;
  intention: string;
  theme: 'mint' | 'library' | 'lavender' | 'rain';
  accent: string; // validated palette token
  cover: string | null; // curated asset ID; separate uploads later
  companion: { kind: 'sprout' | 'sleepy-companion'; name: string };
  widgets: Array<{
    kind: 'resume' | 'tasks' | 'review' | 'focus' | 'countdown' | 'recent' | 'garden' | 'effort';
    enabled: boolean;
    order: number;
  }>;
};
```

Provide Restore default desk and Save changes. Preview changes locally; write only when saved. A generated ChatGPT artifact should not silently replace these preferences. With no account, store preferences in local widget state and clearly identify local persistence. After connecting, reconcile settings intentionally rather than losing the student’s desk.

## Public sharing: scope and behavior

[Notion permits duplicating public pages](https://www.notion.com/help/duplicate-public-pages), while its [publishing documentation](https://www.notion.com/en-gb/help/public-pages-and-web-publishing?nxtPslug=public-pages-and-web-publishing) explains inherited visibility and published metadata. The Notable design recommendation is an explicit share snapshot with a preview and revoke control so the owner can inspect exactly what becomes visible.

Default share scope: desk title, intention, theme, cover, widget arrangement, and optional chosen companion. Keep notes, questions/answers, private tasks, ChatGPT context, personal study history, account identity, and exact activity timestamps private. Sharing a material is a separate opt-in; snapshot its selected content so later private edits do not silently publish. Do not include executable HTML or arbitrary remote embeds in a shared preset.

A public page needs a real hosted URL, read-only access without an owner session, an opaque share ID, scope validation, revoke behavior, and clear owner-selected attribution. A downloaded JSON preset or local preview is useful, but must not be called a public profile. “Use this desk” imports validated appearance/layout only. Shared materials, if supported, create independent copies and should disclose that behavior.

## Build order and truthful limits

- **First:** workspace title/intention, curated themes, named companion, widget toggles/order, subject styling, local persistence, real profile save/load.
- **Second:** public desk preview and preset copying through a backend share record with an explicit preview/revoke flow. Selected material publishing can follow once permissions and snapshot semantics exist.
- **Later:** creator gallery moderation, custom image uploads, additional original companions, collaborative presence, synchronized timers, and shared study sessions.

ChatGPT embedding imposes practical boundaries: do not promise system-wide distraction blocking, persistent audio after the widget closes, OS clock lighting that runs while inactive, or automatic access to another student’s conversation. A countdown can use stored deadlines when reopened. A focus plant can reflect server-recorded effort. A coworking badge can appear only when presence is genuinely connected.

Use original or appropriately licensed imagery. LifeAt’s gallery includes credited scenes and fan-oriented categories; its visible artwork is reference material, not a reusable asset library. Notable’s own original soft mint and existing legitimate brand assets are the best starting point.
