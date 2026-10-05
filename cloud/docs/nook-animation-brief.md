# Nook companion animation brief

Companions are currently disabled in the product. The artwork below is saved as a starting point for a future animation pass; it is not a finished scene-integrated character system.

## Saved artwork

- `ui/public/images/nook-companion-atlas.webp`: original transparent painted atlas, 1774 × 887 pixels, four columns × two rows. Top row: bunny, fox, capybara, red panda. Bottom row: owl, turtle, bear, ghost.
- `ui/public/images/study-cat-sprites.webp`: transparent cat sheet, 1774 × 887 pixels. Top row: four right-facing walk poses. Bottom row: idle, eating, happy, sleeping.
- `ui/public/images/study-cat.webp` and `sleeping-dog.png`: original static companions.
- `ui/src/world/CompanionCatalog.tsx`: saved artwork catalog and picker components. Do not mount these until the animation treatment is approved.

The eight-character atlas contains one illustration per character, not animation cycles. CSS bobbing or translating those illustrations does not establish a believable walk on a painted background.

## Scene integration requirements

For each room, mark actual support surfaces in the source image: desk top, window sill, cushion, floor, or shelf. Store image dimensions and normalized surface segments or polygons. Identify an unobstructed starting point and a walkable route. Characters must stay on these surfaces; viewport-relative random positions are unsuitable.

Project source-image coordinates with the exact background cover transform, including crop, positioning, and any background zoom. The original library, garden, and train assets are 1672 × 941 pixels. The current backdrop has a 1.015 scale transform that must be included or removed when synchronizing characters. Mobile crops can remove a surface entirely; hide the character if no valid surface remains visible. Custom uploaded rooms have no approved geometry and should not receive characters automatically.

Match the scene's perspective, lighting direction, contact point, and apparent scale. Add a contact shadow that follows the support plane. Character feet must remain grounded through the entire walk cycle. Maintain separate foreground occlusion masks where a book, table edge, chair, or plant should appear in front of the character. Room UI remains above the scene; companion controls must not cover writing or study controls.

## Animation deliverables

Create per-character idle, walk, turn, eat, happy, and sleep animations at a consistent scale and baseline. Supply direction variants appropriate to each route; avoid simply mirroring asymmetrical characters or props where it looks wrong. Record frame counts, timing, alpha bounds, contact-foot coordinates, and which support surfaces each animation fits. An animator may prefer skeletal animation or a larger frame sequence over the current four-pose cat cycle.

Dragging should snap to an approved support surface. Calling a companion should choose a reachable point on the same surface, rather than teleporting across depth planes. Reduced motion keeps characters seated, with explicit actions changing pose or location without automatic roaming.

## Acceptance review

Review every character in every supported room at desktop, laptop, portrait phone, and landscape phone sizes. Check foot contact during all frames, crop behavior, shadow alignment, perspective, occlusion, sprite clipping, and UI overlap. Approve each scene-character combination individually. Keep companions disabled until those reviews pass.
