# Nook room art and design provenance

## Room collection

Nook now includes **31 selectable original rooms and two unlockable secret rooms**, each served as its own WebP in `ui/public/images`. The original generated PNGs are preserved unchanged in `assets/originals/images`. These are original generated illustrations, not screenshots, licensed music, copied creator artwork, or visual effects applied to one picture. The catalog is maintained in `ui/src/personalization/types.ts`; its IDs are also accepted by the backend so a chosen room survives save, reload, and sharing.

The collection deliberately includes several visual treatments: finely painted cinematic environments, ink-and-cel anime scenes, storybook illustration, watercolor, pixel art, and dreamlike settings. Style badges describe the inspected final pictures rather than promising every environment is anime merely because a prompt used that word. The original 30-room set contains 17 painted cinematic rooms, three anime rooms, four illustrated rooms, two watercolor rooms, one pixel room, and three dreamlike rooms. The added Mosslight dungeon and its two secret annexes extend the fantasy room direction. Photoreal is available as a custom generation style, not claimed for an existing preset.

| Room ID | Setting | Category | Final style |
| --- | --- | --- | --- |
| rainy-library | Rainy attic library | Cozy | Painted |
| midnight-train | Moonlit countryside train | Elsewhere | Painted |
| sakura-garden | Cherry-blossom cottage study | Nature | Painted |
| seaside-studio | Airy morning studio by the ocean | Nature | Painted |
| alpine-cabin | Snowy timber cabin and fireplace | Cozy | Painted |
| autumn-bookshop | Rainy bookshop with russet leaves | Cozy | Painted |
| moonlit-observatory | Glass-domed scholarly observatory | Elsewhere | Painted |
| sunlit-greenhouse | Bright garden greenhouse | Nature | Painted |
| neon-tokyo | Warm rooftop study above a rainy city | City | Painted |
| paris-attic | Paris at dawn | City | Painted |
| kyoto-teahouse | Tatami, tea, and bamboo rain | Nature | Painted |
| brooklyn-loft | Sunday in Brooklyn | City | Painted |
| cloud-bedroom | Soft pink room above the clouds | Cozy | Painted |
| oxford-library | Oak shelves and Gothic rainy windows | Cozy | Painted |
| lighthouse-study | Lighthouse lookout over the sea | Elsewhere | Illustrated |
| tropical-veranda | Sheltered veranda in monsoon rain | Nature | Painted |
| mossy-watermill | Timber reading room above a forest stream | Nature | Illustrated |
| aurora-cabin | Nordic cabin beneath northern lights | Nature | Dreamlike |
| autumn-camper | Camper overlooking an autumn lake | Elsewhere | Anime |
| ricefield-porch | Japanese rural veranda in late summer | Nature | Anime |
| lakeside-boathouse | Quiet lakeside boathouse | Nature | Watercolor |
| castle-study | Candlelit tower study | Elsewhere | Illustrated |
| desert-casita | Adobe textures and sunset mesas | Nature | Painted |
| underwater-study | Amber-lit study beneath blue ocean depths | Elsewhere | Dreamlike |
| floating-airship | Brass-windowed cabin above the clouds | Elsewhere | Dreamlike |
| moon-base | Lunar study with an Earth view | Elsewhere | Painted |
| woodland-treehouse | Hand-drawn retreat among tree canopies | Nature | Illustrated |
| lavender-cottage | Provence-inspired fields in soft pigment washes | Cozy | Watercolor |
| canal-apartment | Cel-shaded Amsterdam-inspired canal apartment | City | Anime |
| night-campus | Crisp pixel-art Gothic library | Cozy | Pixel |
| mosslight-dungeon | Crystal pools and candlelit stone | Elsewhere | Illustrated |
| moonstone-annex | A hidden moonlit academy study | Unlockable | Painted fantasy |
| crystal-vault | A quiet crystal-lit underground study | Unlockable | Painted fantasy |

The image path for each row is `/images/lofi-<room-id>.webp`. All images are 1672 × 941 pixels except `seaside-studio`, which is 1672 × 940. No companion support surfaces or image-relative animal animation geometry are asserted: the user explicitly deferred room creatures until proper animation is ready.

## Research and interpretation

[LifeAt's space gallery](https://www.lifeat.com/explore) informed the place-first collection and the separation between an immersive environment and quiet focus controls. [LifeAt virtual spaces](https://www.lifeat.com/feature/virtual-spaces) provided a primary reference for background spaces and optional audio; no third-party scene or audio was copied.

The developer-published [Spirit City: Lofi Sessions page](https://store.steampowered.com/app/2113850/Spirit_City_Lofi_Sessions/) supports the idea of an atmospheric study room with tasks, timers, and gentle progression. [Virtual Cottage](https://dui.itch.io/virtual-cottage) is a primary reference for a restrained cozy setting. These sources are product references, not evidence that a specific aesthetic improves exam performance.

Creator listings on Notion's official marketplace show several distinct student workspace aesthetics: [vanilla study planner](https://www.notion.com/templates/study-planner-vanilla-girl-aesthetic), [student dashboard](https://www.notion.com/templates/student-dashboard-v-1), and [pink coquette student dashboard](https://www.notion.com/en-gb/templates/aesthetic-pink-coquette-student-dashboard). They informed variety and gentle personalization, not claims about the popularity of a trend.

The second room batch has additional source notes about earthen architecture, kelp forests, lunar imagery, and Amsterdam architecture in `docs/nook-rooms-batch-two.md`. Those environments remain invented scenes; the underwater room, airship, and lunar interior are imaginative illustrations rather than engineering representations.

## Prompt records

Full scene prompts and asset metadata are retained rather than relying on short display captions:

- `docs/nook-original-room-prompts.json`: full generation instructions for the original rainy library, midnight train, and sakura garden.
- `docs/nook-room-prompts.json`: exact combined art direction and scene prompts for seaside studio, alpine cabin, autumn bookshop, moonlit observatory, sunlit greenhouse, and neon Tokyo.
- `docs/nook-root-room-prompts.json`: exact full requests for all 13 rooms generated by the lead agent.
- `docs/nook-root-rooms.json`: final 13-room catalog with scene briefs, inspected style labels, dimensions, moods, and file paths.
- `docs/nook-root-room-prompts.json`: exact full generation requests for the 13-room batch.
- `docs/nook-hidden-room-prompts.json`: exact requests for the dungeon and two unlockable study rooms.
- `docs/nook-rooms-batch-two-prompts.json`: exact final prompts for the remaining eight rooms, including the four replacements that deliberately use illustrated, watercolor, anime, and pixel styles.
- `docs/nook-rooms-batch-two.json`: final dimensions, style metadata, and explicit limits of the reference-based artistic interpretations.
- `docs/lofi-design-research.md`: original three-room direction and primary product references.

The original three backgrounds were requested as individual, original, full-bleed 16:9 room illustrations with believable perspective, detailed natural soft paint, quiet central areas for later floating study controls, rich peripheral scenery, and no interface, typography, logos, watermarks, people, or existing characters. The rainy library intentionally includes one tiny sleeping ginger cat baked into the background painting; no interactive room companion is implied. The train uses lilac-blue moonlit countryside and warm brass lamps. The sakura cottage uses dappled afternoon light, cherry blossoms, linen, books, and a pond beyond the window.

The six additional painted environments share a restrained paper texture, warm timber and linen, original architecture, calm central composition, and no humans or animals. The exact full common art direction is embedded in every entry of `docs/nook-room-prompts.json`. Styles introduced later use materially different visual treatments, not recolors or CSS filters of another asset.

## Selection and custom generation

The 31-room picker uses substantial 16:9 previews, category filters (All, Cozy, Nature, City, Elsewhere), selected-state buttons, lazy-loaded image assets, and an announced visible room count. There are three columns on desktop and two on narrow screens. The artwork is decorative within each named button, so its empty alternate text avoids repeating the room title for screen readers.

**Generate a room** opens a generator in the same customization panel. It offers Anime, Illustrated, Watercolor, Pixel, Dreamlike, and Photoreal styles. Its prompt explicitly requests ChatGPT's built-in image generation, makes no separate model API request, and says not to pretend the picture was automatically applied. Native ChatGPT receives the request through the existing conversation handoff; the standalone preview offers a copyable prompt and clearly describes its limitation.

The current supported completion flow is: generate in the ChatGPT conversation, download the finished picture, upload it in Room artwork, inspect the room preview, then Save room. Uploads accept capped PNG/JPG/WebP raster files and are resized/compressed before saving. The original file is not modified. Custom room artwork has no inferred weather or companion geometry.

Legacy spaces without a room ID keep their earlier theme-based scene fallback. Choosing a preset clears an uploaded background; uploading custom artwork does not destroy the previous preset choice. Removing an upload returns to the selected preset. No student note or quiz content is included in this room asset documentation.

## Dormant illustration assets

`study-cat.png`, `study-cat-sprites.png`, and the newer companion atlas are retained for future animation work but are not offered as active room creatures. `study-object-sprites.png` contains eight transparent miniature painted objects for study navigation and achievements. Original Notable brand provenance remains documented in `docs/brand-assets.md`; the current Nook rebrand is separate from those archival brand files.

## Runtime image encoding

All 47 original image assets are preserved with verified SHA-256 hashes in `assets/originals/images`. Exact prompt records are also archived unchanged in `assets/originals/prompts`. Runtime WebP copies preserve the original dimensions, composition, and alpha-channel bytes; no room was resized, cropped, repainted, or recolored. Color compression is lossy, so decoded RGB values are not claimed to be byte-identical.

The 33 room backgrounds use quality 82 and method 6. Transparent artwork uses quality 90; seven remaining alpha assets use the faster method 4 search to avoid prolonged packaging, with exact alpha verified after decoding. The total image directory is **12.054 MB**, down from **103.798 MB** (88.4% smaller); the 40 main room, reward, navigation, and brand assets total **10.807 MB**. The remaining seven files are dormant illustration assets. PNG duplicates were removed from public only after archive checksums and WebP decoding succeeded.

`assets/image-encoding-manifest.json` records every original/runtime path, source and output hash, file size, dimensions, alpha check, and encoding setting. Room regression tests read actual WebP RIFF dimensions rather than trusting this manifest; the parser follows the [official WebP container specification](https://developers.google.com/speed/webp/docs/riff_container). The reward atlas paths are explicit in `RewardDrawing.tsx` so the native widget package can include them.
