# Nook paths: naming, progression, and safe rollout

Status: **design and backend contract, not activated**. Authored 2026-10-01. The accompanying `ui/src/world/nook-paths.json` deliberately sets `runtimeEnabled: false`. It is not imported by the running app. No active names, thresholds, IDs, earned items, or focus records were changed.

## Product decision

Keep the name **Nooks**. Use direct place names people can find again: Rainy Library, Night Train, Cherry Garden, Castle Tower, Moon Base. Let the illustration carry the mood. Avoid names that read like generated affirmations, excessive diminutives, unexplained fantasy lore, and descriptive subtitles competing with a study task. Internal `roomId` identifiers remain stable, but public copy says **nook**.

The current four-reward track gives a useful first evening of progress. It should remain intact. The next version gives each nook a different reason to return: growing one carefully drawn object, assembling a set, adding original music, choosing a new view, or opening a connected study spot. It must not be the same potted plant scaled up 31 times.

A usable note editor, flashcards, quizzes, accessibility options, background silence, and core focus tools are never progression rewards. All optional unlocks are cosmetic or atmospheric.

## Research, with limits

This is qualitative research from current primary product and creator pages. It is not a representative survey of students or a claim about all of StudyTok. No popularity or educational-effectiveness claim is inferred from a product listing.

- [LifeAt's shared-focus feature](https://lifeat.io/feature/focus-with-others) joins shared scenery with coordinated sessions. Nooks should make a small group feel present without adding an always-open chat panel.
- [Spirit City's developer listing](https://store.steampowered.com/app/2113850/Spirit_City_Lofi_Sessions/) combines decor, ambient sound, focus tools, and collection. The useful pattern is that earned objects belong to a coherent place. Nooks needs its own art and interactions; a roaming companion remains deferred.
- [Virtual Cottage 2's developer listing](https://store.steampowered.com/app/2943180/Virtual_Cottage_2/) describes personal decor, visits with friends, and restrained social communication. The design inference is to let people show the space they made while keeping studying central.
- [A creator's aesthetic study template on Notion](https://www.notion.com/templates/aesthetic-school-focused-study) pairs study organization with anime-influenced styling. [A separate light-academia planner](https://www.notion.com/templates/aesthetic-light-academia-school-planner-organizer) shows a different visual treatment of the same basic needs. This supports offering aesthetic variety, not making the UI itself ornate.
- [Forest's official site](https://forestapp.cc/) makes accumulated focus visible through a collection of trees. Its failure/loss mechanics are not adopted here: Nooks' plants and earned objects never die, disappear, or punish a group when someone takes a break.

The following tracks are original design proposals based on those patterns and the existing Nooks backgrounds. The particular names, objects, and thresholds are product decisions, not externally validated retention findings.

## Accounting and unlock rules

1. A threshold is **cumulative completed active focus time in this nook**, stored as integer seconds. Compare seconds on the server. Round up remaining minutes only for UI text.
2. Start captures `accountId`, canonical `nookId`, originating `roomId`, `pathVersion`, and target duration. Changing scenery, opening a child view, refreshing, or opening another device cannot transfer or duplicate credit.
3. Pauses and breaks add no eligible seconds or XP. Explicitly completed partial sessions retain their eligible time. Cancellation adds no new time. Keep the existing cap at the chosen session length and the current maximum of 180 minutes per session; do not silently rewrite historic accounting.
4. The metric means **server-recorded timer time**, not verified attention, token consumption, comprehension, or physical presence. Chat message count, clicks, model tokens, and lobby heartbeat are not reward evidence.
5. Completion is idempotent. One active session per account and a unique session credit record prevent repeated completion and overlapping devices from multiplying time.
6. Existing focus XP behavior stays unchanged. New path unlocks award zero extra XP; they do not inflate competition. There are no attendance requirements, expiring rewards, paid random drops, scarcity countdowns, or daily streak penalties.
7. On returning, show one short next goal, for example `12 min to the rooting jar`, with the exact total threshold in the path view. After completion, say `Path complete`; do not invent an endless meter.

## Display and surprise rules

- At most **three physical display objects** per nook. An authored composition or a single growing object occupies one slot. Its individually earned components remain in the collection; a placed assembly cannot duplicate its own source pieces beside itself.
- A later growth stage changes the drawing, not just CSS size. Keep earlier earned stages selectable. A plant does not decay and never requires a timed feeding visit.
- One chosen scene variant and one playing track at a time; neither consumes an object slot. All track playback requires an explicit Play action, with pause/mute/volume available. A soundtrack is original audio or licensed audio with recorded rights, never an assumed Spotify entitlement.
- An item's collection illustration is not automatically approved for the scene. Each background needs authored anchors, perspective, scale bounds, grounding shadow, occlusion masks, and desktop/mobile crop behavior. Until that work is approved, the item stays in the collection viewer instead of floating over the background.
- Existing cat, dog, fox, egg, and dragon rewards stay static figurines or illustrations. No roaming creature or generic floating sprite is activated by this plan.
- Optional surprises may hide the image/name, but always reveal reward category and exact time. `Reveal details` lets the user see the reward without spending or studying. Rewards are deterministic. This is a presentation choice, not a security promise that a client cannot inspect downloaded catalog data.
- Do not promise an unmade asset. New milestones remain `unreleased` until art/audio, accessibility, storage, and placement checks pass. Existing eligible time counts retroactively when a milestone is released.

## Complete curated catalog

All times below are **total focus time in the originating nook**, not additional continuous time. The first four milestones retain the exact existing IDs and 15/45/90/180-minute thresholds. Their labels below are proposed display aliases only. New milestones are proposals; the runtime catalog is unchanged. The JSON contains the exact immutable legacy reward IDs, new versioned IDs, per-step effects, asset references, next pointers, and disclosure rules.

### 1. Rainy Library

Stable ID: `rainy-library`. Current label: Rainy library.

**A shelf of editions** — Collect a coherent reading shelf; later open a second reading alcove rather than endlessly increasing object size.

Existing: 15m Folded Letter; 45m Stoneware Cup; 1h 30m Clasped Book; 3h Library Miniature.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Brass Bookend (item) | Adds one bookend to the reading shelf. |
| 10h | Reading Set (assembly) | Combines the book, letter and cup into one authored shelf vignette; individual pieces remain available. |
| 18h | Rain on Glass (soundtrack) | Adds an original rain-and-page-turn sound mix with independent rain volume. |
| 30h | Window Alcove (secret-space) | Opens a second reading position inside this library; focus still belongs to Rainy Library. |
| 50h | Oak Shelf (assembly) | Adds a complete multi-volume shelf treatment in one authored display slot. |

### 2. Night Train

Stable ID: `midnight-train`. Current label: Midnight train.

**A route with places to stop** — Fill a route card and choose earned views from the carriage; progress never depends on real departure times.

Existing: 15m Travel Letter; 45m Table Lantern; 1h 30m Boat Souvenir; 3h Star Token.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Route Card (item) | Adds a railway route card for the carriage table. |
| 9h | Mountain Pass (scene-variant) | Unlocks a mountainside view through the same carriage window. |
| 15h | Rail Rhythm (soundtrack) | Adds an original soft rail-joint rhythm with optional instrumental layer. |
| 25h | Coastal Line (scene-variant) | Unlocks a coastal window view; earlier routes remain selectable. |
| 45h | Observation Car (secret-space) | Opens the rear observation carriage as a child nook on this route. |

### 3. Cherry Garden

Stable ID: `sakura-garden`. Current label: Sakura garden.

**One bonsai, several seasons** — Grow one cherry bonsai through distinct drawn stages, then freely choose any earned season; it never withers.

Existing: 15m Seedling; 45m Flower Pot; 1h 30m Mushroom; 3h Cherry Bonsai.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 6h | Branching Bonsai (growth) | Replaces the selected bonsai drawing with a visibly branching stage, not a scaled-up seedling. |
| 12h | First Blossom (growth) | Unlocks a flowering version of the same bonsai. |
| 24h | Summer Canopy (growth) | Unlocks a green summer crown; flower stage remains selectable. |
| 36h | Autumn Leaves (growth) | Unlocks a copper-leaf variant with a few settled leaves on its tray. |
| 60h | Garden Veranda (secret-space) | Opens a covered garden study view where the bonsai occupies a matched table anchor. |

### 4. Seaside Studio

Stable ID: `seaside-studio`. Current label: Seaside morning.

**A shoreline specimen tray** — Build a small cabinet of coastal specimens and field sketches; each discovery has a place in a single tray.

Existing: 15m Scallop Shell; 45m Sailboat Model; 1h 30m Coral Study; 3h Pearl.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Sea Glass (item) | Adds three softly colored glass pieces as one tray object. |
| 11h | Shoreline Sketch (item) | Adds an illustrated tide-line field sketch on cream paper. |
| 19h | Specimen Tray (assembly) | Combines chosen shells, glass and pearl into one authored specimen tray. |
| 32h | Harbor Morning (soundtrack) | Adds an original soft harbor ambience without sudden gull cries. |
| 50h | Low Tide (scene-variant) | Unlocks a low-tide coastal view with the same desk perspective. |

### 5. Snow Cabin

Stable ID: `alpine-cabin`. Current label: Snowbound cabin.

**A blanket that takes shape** — Complete sections of one knitted blanket, with optional cabin objects; no temperature meter or maintenance.

Existing: 15m Enamel Cup; 45m Snow Globe; 1h 30m Cabin Lantern; 3h Fox Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Yarn Basket (item) | Adds wool and needles in a basket matched to the cabin style. |
| 10h | Blanket Border (growth) | Begins a folded blanket with a visible knitted edge. |
| 20h | Cable Pattern (growth) | Adds a cable-knit center to the same blanket object. |
| 35h | Hearth at Dusk (soundtrack) | Adds an original low crackle mix with no abrupt pops. |
| 55h | Finished Blanket (growth) | Unlocks the completed cabin blanket; any earlier stage remains available. |

### 6. Autumn Bookshop

Stable ID: `autumn-bookshop`. Current label: Autumn bookshop.

**A bookshop display** — Build an autumn display from individual finds into an illustrated storefront vignette.

Existing: 15m Bookmark Letter; 45m Cinnamon Pastry; 1h 30m Clasped Volume; 3h Bookshop Miniature.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Bookshop Stamp (item) | Adds a wooden bookshop stamp on the counter. |
| 10h | Display Crate (assembly) | Arranges selected earned books in one book-crate display. |
| 17h | Paper Book Bag (item) | Adds a folded paper bag with an original Nooks shop mark. |
| 30h | Bookshop Sign (scene-variant) | Unlocks a matched sign treatment above the painted doorway. |
| 48h | Upstairs Reading (secret-space) | Opens a quiet study nook above the bookshop, attached to this path. |

### 7. Hilltop Observatory

Stable ID: `moonlit-observatory`. Current label: Moonlit observatory.

**A constellation atlas** — Assemble a desk atlas, then reveal hand-drawn sky-chart panels; all are decorative, not live astronomical predictions.

Existing: 15m Desk Telescope; 45m Moon Model; 1h 30m Star Token; 3h Dark Crystal.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Sky Chart (item) | Adds a folded decorative sky chart. |
| 12h | Brass Compass (item) | Adds a drafting compass beside the chart. |
| 21h | Northern Atlas (assembly) | Combines the telescope and chart into an authored atlas display. |
| 35h | Constellation Canopy (scene-variant) | Unlocks a still constellation layer outside the dome, toggled by the user. |
| 55h | Upper Dome (secret-space) | Opens a higher observatory study view with the same earned atlas collection. |

### 8. Sunlit Greenhouse

Stable ID: `sunlit-greenhouse`. Current label: Sunlit greenhouse.

**A propagation bench** — Grow a family of plants from cuttings into a bench; later stages add distinct species rather than one enlarged sprite.

Existing: 15m First Cutting; 45m Flower Pot; 1h 30m Mushroom; 3h Potted Tree.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Rooting Jar (growth) | Shows the original cutting with drawn roots in a glass jar. |
| 10h | Fern Pot (growth) | Adds a fern stage as an alternative plant object. |
| 18h | Trailing Pothos (growth) | Adds a trailing plant that fits an authored greenhouse shelf anchor. |
| 30h | Propagation Tray (assembly) | Displays three unlocked cuttings in one composed tray, counting as one object. |
| 50h | Glasshouse Bench (secret-space) | Opens a second bench view with the propagation collection. |

### 9. Rooftop Tokyo

Stable ID: `neon-tokyo`. Current label: Tokyo after rain.

**A late-night listening desk** — Build a cassette listening station and unlock original nocturnal mixes; music stays optional.

Existing: 15m Window Lantern; 45m Headphones; 1h 30m Vinyl Record; 3h Camera.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Night Cassette (item) | Adds an illustrated cassette with original cover art. |
| 11h | Cassette Deck (assembly) | Combines the cassette and headphones into a desk player vignette. |
| 19h | Rooftop Static (soundtrack) | Adds an original low-noise instrumental mix, played only on request. |
| 32h | Rain Reflections (scene-variant) | Unlocks an alternate neon reflection treatment in the existing window view. |
| 50h | Rooftop Balcony (secret-space) | Opens a sheltered balcony desk overlooking the same neighborhood. |

### 10. Paris Attic

Stable ID: `paris-attic`. Current label: Paris at dawn.

**A sketch folio** — Collect architectural sketches into a folio, then change the desk view; the drawing is the reward, not a claim of user-created art.

Existing: 15m Croissant; 45m Rooftop Letter; 1h 30m Vinyl Record; 3h House Miniature.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Sketch Pencil (item) | Adds a graphite pencil and small sharpener as one object. |
| 10h | Rooftop Sketch (item) | Adds an original cream-paper drawing of the attic rooftops. |
| 18h | Sketch Folio (assembly) | Combines earned architectural sketches into a folio on the desk. |
| 29h | Attic Rain (soundtrack) | Adds an original rain-on-roof mix distinct from the existing vinyl preset. |
| 45h | Roof Terrace (secret-space) | Opens a small covered terrace study view beside the attic. |

### 11. Kyoto Teahouse

Stable ID: `kyoto-teahouse`. Current label: Kyoto teahouse.

**A tea service** — Collect complementary ceramic pieces and assemble one tea tray; plants remain optional legacy keepsakes.

Existing: 15m Tea Cup; 45m Potted Plant; 1h 30m Rain Flower; 3h Bonsai.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Tea Caddy (item) | Adds a ceramic tea caddy with a restrained glaze. |
| 11h | Small Teapot (item) | Adds a matching teapot. |
| 20h | Tea Tray (assembly) | Arranges the cup, caddy and teapot into one authored tray. |
| 33h | Bamboo Rain (soundtrack) | Adds an original covered-garden rain mix with a soft water layer. |
| 52h | Garden Table (secret-space) | Opens a sheltered garden table with placement anchors for the tea service. |

### 12. Brooklyn Loft

Stable ID: `brooklyn-loft`. Current label: Sunday in Brooklyn.

**A record collection** — Build a small playable record shelf with original music and visible sleeve art; there is no random drop or paid draw.

Existing: 15m Vinyl Record; 45m Headphones; 1h 30m Film Camera; 3h Dog Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Sunday Sleeve (item) | Adds original artwork for the first record sleeve. |
| 10h | Turntable (assembly) | Arranges the earned record and headphones around one illustrated player. |
| 18h | Sunday Side B (soundtrack) | Unlocks a second original instrumental track. |
| 30h | Record Rack (assembly) | Combines unlocked sleeves into a compact display with user-selected front cover. |
| 50h | Window Session (soundtrack) | Adds an original longer listening mix; all previously earned tracks remain playable. |

### 13. Cloud Bedroom

Stable ID: `cloud-bedroom`. Current label: Cloud nine.

**A suspended paper mobile** — Assemble a paper moon-and-star mobile one element at a time; the finished piece stays still during focus by default.

Existing: 15m Desk Letter; 45m Flower Pot; 1h 30m Paper Star; 3h Cat Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Paper Moon (item) | Adds a folded paper moon for the desk. |
| 10h | Mobile Frame (assembly) | Combines the moon and star on a small display stand. |
| 18h | Paper Cloud (growth) | Adds a drawn cloud piece to the same mobile. |
| 30h | Complete Mobile (growth) | Unlocks a finished hanging mobile at an authored anchor; its table stand remains available. |
| 48h | Window Seat (secret-space) | Opens a window-seat study nook with the same paper collection. |

### 14. Oak Library

Stable ID: `oxford-library`. Current label: The old reading nook.

**An archive cabinet** — Collect archive tools and build a cabinet with labeled drawers; study organization remains free and is never locked behind rewards.

Existing: 15m Clasped Book; 45m Reading Cup; 1h 30m Folded Cloak; 3h Library Key.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Index Cards (item) | Adds a tied stack of decorative index cards. |
| 11h | Archive Stamp (item) | Adds a brass date-stamp prop without altering note metadata. |
| 20h | Catalogue Drawer (assembly) | Combines cards, stamp and key into one archive drawer vignette. |
| 33h | Map Cabinet (assembly) | Unlocks a small cabinet display with a choice of earned decorative maps. |
| 54h | Upper Gallery (secret-space) | Opens a gallery study view above the library floor. |

### 15. Lighthouse Desk

Stable ID: `lighthouse-study`. Current label: Lighthouse lookout.

**A coastal navigation chart** — Build a chart station and reveal a second sea view; no navigation or weather predictions are implied.

Existing: 15m Boat Model; 45m Saltwater Shell; 1h 30m Keeper Lantern; 3h Pearl.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Coastal Chart (item) | Adds an original illustrated coastal chart. |
| 10h | Brass Divider (item) | Adds a navigation divider beside the chart. |
| 19h | Chart Station (assembly) | Combines chart, lantern and divider into one desk object. |
| 32h | Distant Harbor (soundtrack) | Adds an original ocean mix with optional very soft harbor texture. |
| 51h | Lantern Gallery (secret-space) | Opens a sheltered lighthouse gallery study view. |

### 16. Monsoon Veranda

Stable ID: `tropical-veranda`. Current label: Monsoon veranda.

**A rain-sound instrument set** — Collect still rain instruments and unlock original sound layers; weather never interrupts or expires a study session.

Existing: 15m Porch Plant; 45m Mushroom; 1h 30m Rain Flower; 3h Potted Tree.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Bamboo Chime (item) | Adds a still bamboo chime matched to a veranda anchor. |
| 11h | Rain Chain (item) | Adds a rain-chain ornament as a desk-scale reference object. |
| 20h | Rain Study (soundtrack) | Unlocks an original layered rain mix with separate leaf and roof channels. |
| 33h | Covered Porch (scene-variant) | Unlocks a slightly wider sheltered view, without moving the conversation surface. |
| 52h | Rain Instrument Tray (assembly) | Displays small bamboo and ceramic rain instruments in a single tray. |

### 17. Moss Watermill

Stable ID: `mossy-watermill`. Current label: The watermill.

**A terrarium ecosystem** — Build layers of a miniature terrarium; no watering chores, feeding requirements or decay.

Existing: 15m Sprout; 45m Mushroom; 1h 30m Cottage Model; 3h Potted Tree.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Glass Bowl (item) | Adds the empty terrarium bowl. |
| 11h | Moss Bed (growth) | Adds stones and drawn moss inside the bowl. |
| 20h | Stream Layer (growth) | Adds a still water channel and miniature millstone. |
| 33h | Fern Canopy (growth) | Adds ferns and a shaded miniature bridge within the same terrarium. |
| 54h | Mill Garden (secret-space) | Opens an outdoor sheltered desk by the watermill; the terrarium remains one display object. |

### 18. Aurora Cabin

Stable ID: `aurora-cabin`. Current label: Under the northern lights.

**A northern-sky study** — Collect a field kit, then choose earned sky palettes; no real-time aurora claim and no flashing sky effects.

Existing: 15m Arctic Snow Globe; 45m North Star; 1h 30m Aurora Crystal; 3h Fox Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Field Journal (item) | Adds a small northern-sky sketch journal. |
| 12h | Green Aurora (scene-variant) | Unlocks a painted green sky variant without adding movement. |
| 21h | Violet Aurora (scene-variant) | Unlocks a violet sky variant with equivalent text contrast. |
| 35h | Polar Night (soundtrack) | Adds an original quiet wind-and-pad mix. |
| 57h | Sky Shelter (secret-space) | Opens a covered observation nook outside the cabin. |

### 19. Autumn Camper

Stable ID: `autumn-camper`. Current label: The long way home.

**A travel journal** — Collect illustrated stops in a travel journal and choose the parked view; the user never has to keep a trip streak.

Existing: 15m Road Camera; 45m Camp Cup; 1h 30m Camp Lantern; 3h Boat Model.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Travel Journal (item) | Adds an illustrated notebook for collected route cards. |
| 10h | Forest Stop (scene-variant) | Unlocks a stationary forest campsite view from the same camper. |
| 18h | Lake Postcard (item) | Adds an original lake postcard to the journal collection. |
| 30h | Journal Spread (assembly) | Combines the camera and earned route cards into an open journal vignette. |
| 50h | Lakeside Stop (scene-variant) | Unlocks a parked lakeside view; all stops remain freely selectable. |

### 20. Ricefield Porch

Stable ID: `ricefield-porch`. Current label: Ricefield afternoon.

**A miniature rice terrace** — Grow a small illustrated rice terrace through planting, leaf and harvest stages; earned seasons remain selectable.

Existing: 15m Porch Plant; 45m Summer Flower; 1h 30m Tea Cup; 3h Bonsai.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Terrace Tray (item) | Adds a shallow ceramic tray modeled after the fields outside. |
| 12h | Rice Seedlings (growth) | Adds planted rows to the terrace model. |
| 22h | Green Terrace (growth) | Unlocks dense green rice leaves in the same model. |
| 36h | Golden Terrace (growth) | Unlocks a golden harvest-stage model, without a deadline or loss mechanic. |
| 58h | Fieldside Desk (secret-space) | Opens a shaded study view overlooking the fields. |

### 21. Lakeside Boathouse

Stable ID: `lakeside-boathouse`. Current label: Lakeside boathouse.

**A model boat workshop** — Assemble one model sailing boat from hull to rigging and stand; the existing boat ornament remains a separate earned object.

Existing: 15m Boat Ornament; 45m Shore Shell; 1h 30m Tea Cup; 3h Lake Pearl.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Boat Hull (growth) | Begins a new model boat with a timber hull on a stand. |
| 11h | Mast Set (growth) | Adds the mast and deck fittings. |
| 20h | Canvas Sails (growth) | Adds cream canvas sails in a still assembled state. |
| 33h | Rigging (growth) | Adds fine rigging and a nameplate with a user-selected short label. |
| 53h | Workshop Table (secret-space) | Opens a boathouse workbench with an authored anchor for the finished model. |

### 22. Castle Tower

Stable ID: `castle-study`. Current label: The candlelit tower.

**An apprentice desk** — Build a magic-study desk from tools and arranged sets; use original fantasy imagery and preserve the existing annex unlock.

Existing: 15m Practice Wand; 45m Potion Bottle; 1h 30m Spellbook; 3h Moonstone Key.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Potion Rack (assembly) | Arranges earned potion bottles on a single wooden rack. |
| 11h | Folded Cloak (item) | Adds an original embroidered cloak folded on a shelf, never a roaming character. |
| 20h | Brass Orrery (growth) | Adds a still miniature orrery with the first orbital ring. |
| 33h | Complete Orrery (growth) | Unlocks the completed still orrery; motion stays optional and requires scene approval. |
| 55h | Tower Workbench (secret-space) | Adds a workbench view inside the already earned Moonstone Annex. |

### 23. Desert Casita

Stable ID: `desert-casita`. Current label: Desert casita.

**A clay-tile studio** — Build a small set of geometric ceramic tiles, then a composed desk mosaic; no plant growth duplicate.

Existing: 15m Mesa Crystal; 45m Clay Pot; 1h 30m Desert Cup; 3h Fox Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Clay Tile (item) | Adds an unglazed geometric tile. |
| 10h | Ochre Glaze (growth) | Unlocks an ochre glazed version of the tile. |
| 18h | Pattern Pair (assembly) | Combines two complementary illustrated tiles in one display. |
| 30h | Mosaic Tray (assembly) | Arranges the earned tile patterns as one desk tray. |
| 50h | Courtyard Shade (secret-space) | Opens a shaded courtyard table that matches the casita palette. |

### 24. Reef Study

Stable ID: `underwater-study`. Current label: Underwater study.

**A coral colony** — Grow one designed reef miniature through distinct colony stages; sea life stays static until scene-specific animation exists.

Existing: 15m Coral Fragment; 45m Ocean Shell; 1h 30m Reef Pearl; 3h Egg Ornament.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 6h | Reef Base (growth) | Adds a rock base beneath the existing coral fragment. |
| 13h | Branching Coral (growth) | Unlocks a clearly drawn branching coral stage. |
| 24h | Fan Coral (growth) | Adds a contrasting fan coral to the same colony. |
| 40h | Coral Colony (growth) | Unlocks a composed reef miniature as one display object. |
| 60h | Reef Window (secret-space) | Opens a closer underwater study view with matching reef placement. |

### 25. Cloud Airship

Stable ID: `floating-airship`. Current label: Cloudbound airship.

**A navigation console** — Assemble a brass navigation console, then chart illustrated island routes; existing dragon art remains a figurine.

Existing: 15m Airship Model; 45m Telescope; 1h 30m Moon Token; 3h Dragon Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Brass Altimeter (item) | Adds a decorative altimeter with a fixed illustration, not live telemetry. |
| 11h | Route Wheel (item) | Adds an illustrated navigation wheel. |
| 20h | Navigation Console (assembly) | Combines the instruments into one authored console. |
| 33h | Island Route (scene-variant) | Unlocks a distant floating-island view outside the same study cabin. |
| 55h | Chart Cabin (secret-space) | Opens a second airship desk with a larger illustrated map surface. |

### 26. Moon Base

Stable ID: `moon-base`. Current label: Lunar observatory.

**A lunar research model** — Build a desk-scale research base from modules; decorative models never imply measurements or real mission participation.

Existing: 15m Moon Model; 45m Telescope; 1h 30m Orbit Token; 3h Sample Capsule.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Habitat Module (growth) | Begins a small lunar habitat model on a baseplate. |
| 12h | Solar Array (growth) | Adds a still solar array to the model. |
| 22h | Antenna (growth) | Adds a communications antenna as a third drawn module. |
| 36h | Research Base (assembly) | Combines the modules and sample capsule into one complete display. |
| 58h | Earthrise (scene-variant) | Unlocks an alternate window view with Earth above the horizon. |

### 27. Woodland Treehouse

Stable ID: `woodland-treehouse`. Current label: Woodland treehouse.

**A canopy field station** — Collect field tools and build a miniature treehouse platform; wildlife is illustrated on cards rather than animated over the screen.

Existing: 15m Canopy Sprout; 45m Mushroom; 1h 30m Treehouse Model; 3h Bonsai.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Field Binoculars (item) | Adds small illustrated binoculars. |
| 10h | Leaf Cards (item) | Adds an original set of labeled decorative leaf drawings. |
| 19h | Canopy Kit (assembly) | Combines binoculars, leaf cards and the model into a single display tray. |
| 32h | Rope Bridge (growth) | Adds a drawn rope bridge to the miniature treehouse model. |
| 52h | Upper Deck (secret-space) | Opens a sheltered upper platform study nook; no new creature movement. |

### 28. Lavender Cottage

Stable ID: `lavender-cottage`. Current label: Lavender cottage.

**A botanical press** — Collect pressed botanical illustrations into a book and frame; no generic size-only plant progression.

Existing: 15m Cottage Plant; 45m Lavender Pot; 1h 30m Mushroom; 3h Potted Tree.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Flower Press (item) | Adds a small wooden flower press. |
| 11h | Lavender Sheet (item) | Adds a drawn pressed lavender sheet on cream paper. |
| 20h | Botanical Book (assembly) | Combines earned specimens into one open botanical book. |
| 33h | Pressed Frame (assembly) | Unlocks a frame with a choice of earned specimen arrangements. |
| 53h | Garden Writing Desk (secret-space) | Opens a covered writing table beside the cottage garden. |

### 29. Canal Apartment

Stable ID: `canal-apartment`. Current label: Canal apartment.

**A canal-house model** — Build a small row of canal houses and choose a frontage; keep the current piano reward available.

Existing: 15m Canal Boat; 45m Headphones; 1h 30m Bakery Pastry; 3h House Model.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Canal Bridge (item) | Adds a small original bridge model. |
| 10h | Brick House (growth) | Adds a brick facade beside the existing house model. |
| 18h | Canal Row (assembly) | Combines houses, bridge and boat into one miniature canal display. |
| 30h | Window Colors (scene-variant) | Unlocks a restrained choice of illustrated window-light palettes. |
| 50h | Canal Balcony (secret-space) | Opens a covered balcony study nook over the canal. |

### 30. Night Campus

Stable ID: `night-campus`. Current label: Night campus.

**A pixel campus diorama** — Build a miniature pixel campus and open side study spots; new art must match the scene pixel grid, not reuse painted sprites.

Existing: 15m Library Book; 45m Campus Key; 1h 30m Arcade Token; 3h Pixel Star.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Pixel Lamp (item) | Adds a crisp pixel-art desk lamp matched to the scene grid. |
| 10h | Campus Kiosk (item) | Adds a small pixel campus kiosk model. |
| 18h | Campus Block (assembly) | Combines the kiosk and library facade into a pixel diorama. |
| 30h | Night Lab (secret-space) | Opens a pixel-art campus lab study nook on this same progression track. |
| 50h | Campus Courtyard (secret-space) | Opens a second pixel-art study spot in the campus courtyard. |

### 31. Mosslight Dungeon

Stable ID: `mosslight-dungeon`. Current label: Mosslight dungeon.

**A rune alcove** — Arrange rune stones into a fixed alcove, reveal mineral growth, and open quieter vault views; creatures stay carved figurines.

Existing: 15m Rune Stone; 45m Cavern Crystal; 1h 30m Stone Egg; 3h Dragon Figurine.

| Total focus | Proposed discovery | What changes |
| --- | --- | --- |
| 5h | Rune Plinth (assembly) | Places the earned rune and crystal on one carved stone plinth. |
| 12h | Moss Crystal (growth) | Adds a drawn mineral-and-moss stage around the plinth. |
| 22h | Rune Panel (assembly) | Unlocks a stone panel displaying a choice of earned original rune patterns. |
| 36h | Vault Resonance (soundtrack) | Adds an original very quiet cave-and-tone mix, with no jump sounds. |
| 58h | Lower Vault (secret-space) | Adds a desk view deeper inside the already earned Crystal Vault. |

## Asset plan

The checked-in catalog maps all 32 existing collectible illustrations to their actual cell in four WebP atlases: `reward-garden`, `reward-magic`, `reward-voyager`, and `reward-keepsakes`. Existing Moonstone Annex and Crystal Vault scenes, plus the two procedural listening presets, are recorded separately. Existing backgrounds and art are references for style, not evidence that the proposed new image already exists.

There are **155 new milestone asset packages**. A package may be one illustration, a stage, a complete composition, a background, or an audio asset with rights records. This is a production backlog, not a request to ship 155 rough placeholders. All new paths are marked `needed` with no fabricated file path. The catalog identifies the exact source background and existing atlas art for each package.

Start with six representative nooks: Cherry Garden (one evolving bonsai), Sunlit Greenhouse (multiple plant forms), Rooftop Tokyo (music), Night Train (view changes), Castle Tower (sets plus child nook), and Night Campus (pixel art). These exercise the difficult render and entitlement paths. Only then roll out the remaining tracks.

For every new visual package, keep the source, generation/edit prompt when applicable, rights provenance, final transparent or full-frame image, a thumbnail, and a content hash. Review small-screen legibility and scene integration. Pixel art needs a fixed pixel grid; painted atlases are not a valid substitute. No unreviewed animation is part of this plan.

## Backend contract

These are contract proposals for the backend agent; this document creates no tables or runtime endpoints.

| Entity | Essential fields and invariant |
| --- | --- |
| `nook_path_versions` | `pathId`, `version`, `status`, `catalogHash`, `effectiveAt`; released version content is immutable. |
| `nook_path_milestones` | `pathId`, `version`, immutable `rewardId`, `thresholdSeconds`, `kind`, `assetReleaseId`, `parentTrackId`; no client-defined eligibility expression. |
| `focus_credits` | `accountId`, `sessionId`, `nookId`, originating `roomId`, captured path version, credited seconds, server timestamps; unique `(accountId, sessionId)`. |
| `nook_progress` | `accountId`, `nookId`, aggregate seconds, revision; maintained transactionally from credits, never supplied by the browser. |
| `reward_grants` | `accountId`, `nookId`, immutable `rewardId`, awarded path version, granted time, source `focus` or `migration`; unique `(accountId, nookId, rewardId)`. |
| `nook_equipment` | `accountId`, `nookId`, slots 1–3, selected growth variants, selected scene and audio IDs, revision; all selected IDs must belong to released earned grants. |
| `asset_releases` | Hash, kind, immutable object key, license/provenance, approved scene anchors/crops, reduced-motion representation; readiness is server-owned. |

A background and a community instance are different concepts. Map the 31 current `roomId` tracks to canonical curated nook instances explicitly. Do not automatically credit a user's historical time to every creator nook that reuses a backdrop. Do not split existing `custom` time among future creator instances without records proving that allocation; retain its legacy aggregate as its own track.

### Proposed operations

- `nook_progress_get(nookId)` returns aggregate seconds, released path version, available/equipped rewards, next goal, remaining seconds, and revision. It does not return another member's raw focus ledger.
- `focus_complete(sessionId, requestId)` validates account ownership and the active session, commits eligible seconds and threshold grants atomically, and returns newly granted IDs. Retrying the same completion does not duplicate seconds, items, XP, or events.
- `nook_equipment_save(nookId, expectedRevision, slots, selectedStage, sceneVariant)` validates every grant, anchor, and the three-object limit in the same transaction. A stale revision returns a conflict with current equipment, preserving the user's draft.
- `nook_perk_use(nookId, rewardId)` resolves an earned released audio/child-view asset. A collection click cannot bypass membership or storage permissions. Child views retain their parent accounting track.
- `nook_path_release(pathId, version)` is an internal reviewed release action. It records an immutable hash and schedules idempotent catch-up grants. It is not a model-facing or creator-provided arbitrary code executor.

An unlock event is appended to an outbox in the same transaction as the award. Consumers use the event ID for idempotency. Events may update another open client, but direct API reads remain the source of truth. Realtime presence and client event broadcasts do not award focus. Private progress, equipment, and grants require account ownership; membership only authorizes intentionally shared profile totals. Public collections are explicit snapshots, never a query over private notes.

For thousands of users, insert incremental ledger/grant rows rather than rewriting an entire workspace for each second or reward. The clock renders locally between server state changes. Fetch only the selected nook's progress and paginate history. Public leaderboards use bounded aggregate reads. Do not send every reward asset or every focus event with each heartbeat.

## Migration without relocking

1. Store a snapshot/hash of the active v1 catalog. Before any threshold change, materialize grants for every reward already implied by each user's v1 seconds, unioned with every existing explicit grant and valid recorded placement. A reward shown as earned stays earned.
2. Preserve room IDs, reward IDs, progress seconds, completed sessions, practice counts, and saved placements. Display-name changes are aliases only. Keep the legacy `custom` track and both existing hidden-nook perks.
3. Add v2 alongside v1. The first four v2 rows keep their existing 900/2700/5400/10800-second thresholds. New IDs include `-v2-`. Keep unreleased steps out of the next-goal calculation.
4. At each asset release, compare historical eligible seconds and grant all crossed released milestones exactly once. Users do not need to replay old time. If a future threshold ever rises, earlier grants remain in force; do not derive ownership solely from the new threshold.
5. Pin active sessions to their originating track/version, then settle them once. Version changes cannot move, duplicate, or reduce the user's time.
6. Validate a copy of real-shaped data before rollout: zero progress, each exact boundary, above-last threshold, missing old metadata, valid placed legacy rewards, paused session, concurrent completion, two devices, and rollback. Count grants and totals before/after.
7. Roll out behind an explicit server release flag and a small cohort. Rollback hides v2 presentation but preserves grants, credits, versions, and placements. No destructive reset is a rollback strategy.

## Release checks

Catalog checks performed in this authoring pass: 31 curated IDs exactly match the existing catalog except its separately preserved `custom` entry; 124 current curated reward IDs/thresholds are preserved; the 4 custom rewards are retained; 155 new IDs are unique; all 279 curated milestones have monotonically increasing integer thresholds; each referenced existing background/atlas is present; every new asset is explicitly missing; active `room-rewards.json` hash is unchanged.

Checks still required before activation: real database migration and rollback, two-account permissions, concurrent completion, idempotent catch-up awards, membership revocation, three-object enforcement, signed asset delivery, mobile/desktop scene anchors, reduced motion, explicit audio controls, native ChatGPT rendering, and measured load at the intended launch traffic. None is claimed as complete by this document.
