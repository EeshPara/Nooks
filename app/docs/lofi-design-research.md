# Notable immersive study room

The revised direction is a room first: full-bleed original environmental art, quiet floating tools, and a centered study conversation. The space is the setting for learning; it should remain visible between interactions.

## Primary references and concrete patterns

- [LifeAt’s official gallery](https://lifeat.io/explore) groups spaces by atmosphere, including window, cafe, library, nature, lofi, and study-with-me categories. Individual scenes credit their creators. **Use:** a small image-led room picker with recognizable scenery, names, and a selected indicator. Do not replace backgrounds with hue-filtered versions of one picture.
- [LifeAt virtual spaces](https://www.lifeat.com/feature/virtual-spaces) describes choosing an environment, adjusting soundscapes, and using its media widget. Its [Focus Mode guide](https://lifeat.crisp.help/en-us/article/how-to-set-up-focus-mode-6l3poj/) describes a collapsible toolbar at the left. **Use:** a slim icon rail, optional floating timer/tasks/ambience controls, and a Hide tools action that lets the room breathe. Audio starts only after an explicit user action and needs a visible mute/volume control.
- [Spirit City’s developer-published Steam page](https://store.steampowered.com/app/2113850/Spirit_City_Lofi_Sessions/) combines customizable rooms and avatars, collected/pettable companions, soundscapes, and practical timer/to-do/habit/journal tools. Progress unlocks cosmetics. **Use:** let a companion occupy one believable corner, with a small acknowledgment when petted. Link rewards to actual practice/focus effort; keep study content usable before cosmetics are earned. Its music licensing applies to its own catalog, not Notable.
- [Virtual Cottage’s developer page](https://dui.itch.io/virtual-cottage) emphasizes simplicity, limited audio controls, and lighting tied to the computer clock. **Use:** a focus state with fewer choices and a stable scene. Avoid turning the room into an animated toy during a timed session. Do not claim our web widget runs lighting or audio after it closes.
- [Notion’s creator-published study planner](https://www.notion.com/templates/study-planner-vanilla-girl-aesthetic) combines a schedule, tasks, assignment tracking, study duration, timer, and notes hub. [Student Dashboard V.1](https://www.notion.com/templates/student-dashboard-v-1) adds courses, exam/assignment dates, and reading/notes. **Use:** organization remains actionable beneath atmosphere: one clear next task, resume the last deck, and exam-date context. These listings establish capabilities and aesthetic examples, not their popularity on StudyTok.

## Composition rules

1. **Wallpaper fills the viewport.** No illustrated room inside a rounded dashboard card. Use cover positioning with an intentional focal point; maintain recognizable lamp/window/plant details at narrow widths.
2. **Reveal the room.** Keep the tool rail narrow and show at most the conversation, timer, and one optional task panel initially. Library, detailed statistics, and customization open on demand.
3. **Readable glass, restrained transparency.** Use a dark translucent panel with enough opacity plus subtle blur and a fine luminous border. Paragraph text should not sit directly over a busy picture. Use stronger opaque surfaces for quizzes, flashcards, editors, and long reading.
4. **Chat remains central.** The main entry invites a topic, source text, or study goal. In embedded mode, use the host ChatGPT conversation for generation and explanation; never imply an isolated local preview has a connected AI tutor.
5. **Ambient movement is optional.** Small rain/light particles can be CSS enhancements, but the original scene stays beautiful without animation. Respect reduced motion. No continuous camera movement or flashing stars.
6. **A room is a personal preset.** Keep scene choice, space name, accent, companion, and tool arrangement together. Sharing copies explicit appearance settings; private notes and ChatGPT context remain private unless separately selected for publication.

## Original assets delivered

All three rooms were generated with the built-in imagegen tool, inspected, and copied into the project. No competitor scene or copyrighted character was reused. They are real distinct compositions, not filtered variants.

| File | Scene | Dimensions | Approximate bytes |
| --- | --- | --- | --- |
| `ui/public/images/lofi-rainy-library.webp` | Blue-hour attic library, rain-streaked city window, amber desk lamp, plants/books, tiny sleeping ginger cat | 1672 × 941 | 0.21 MB |
| `ui/public/images/lofi-midnight-train.webp` | Warm moonlit carriage, countryside window, small desk/plant, lilac night sky | 1672 × 941 | 0.17 MB |
| `ui/public/images/lofi-sakura-garden.webp` | Sun-dappled cottage study, cherry blossoms, garden pond/bridge, tranquil afternoon | 1672 × 941 | 0.32 MB |

The current save/share API retains its existing theme IDs. `botanical` and `moonlight` select the library with different control palettes; `sunrise` and `lavender` select the garden with different palettes; `sky` selects the train. The picker states “Three rooms · five moods” so the extra palette choices do not imply extra artwork. `ROOM_SCENES` and `getRoomImage(space)` centralize this mapping.

Generated companion: `ui/public/images/study-cat.webp`, an original textured cream/slate sleeping cat holding a closed mint book, verified RGBA transparency. It is retained as a dormant source illustration; the user deferred active room creatures.

## Prompt record

Each room prompt requested one original wide 16:9 handpainted anime-inspired environment, richly detailed natural soft paint, calm left/middle areas for later controls, and no UI, logos, typography, recognizable character, or people. Scene-specific details are recorded in the table above. The cat prompt requested a compact, readable, sophisticated storybook illustration with actual transparency. The outputs lean toward detailed cinematic environment art rather than flat cel shading.

Assets remain at their original generated resolution and were not transformed or recompressed. They exceed the suggested 2 MB target slightly; optimizing delivery can follow if image conversion is explicitly requested. Load the selected room immediately; defer other full-resolution rooms until the picker needs them.

Original generated PNGs are archived in `assets/originals/images`; table paths and sizes now describe the smaller runtime WebP copies. See `assets/image-encoding-manifest.json` for exact hashes and dimensions.
