# Hogwarts journey prototype — October 8, 2026

Local designer preview: http://127.0.0.1:5188/. Changes are confined to web/ui; no public or native deployment performed.

Explore groups the existing 50 scenes and legacy castle scene into 18 worlds. Every world is immediately available. Hogwarts offers four common rooms immediately, then admission letter (15 minutes), wand (30), Castle Tower (45), cloak (75), constellation book (105), and Moon Observatory (120). Saved focus across Hogwarts rooms counts toward the same progression. Other worlds retain open room selection; their chapter progressions are not implemented yet.

Items are projected milestones, not inventory grants or placement entitlements. Server-backed item ownership, authoritative room entitlement checks, reward presentation, final artwork and progression balance remain release work. Existing room focus or current-room access is preserved; the compact milestone strip still displays the focus threshold for these legacy room exceptions.

## Verification

- Designer TypeScript and production-preview build passed; existing bundle-size and dependency directive warnings remain.
- 54 focused tests passed across world catalogue, saved-draft listing, workspace navigation, collection dismissal, and Studio appearance transition. Source-extraction fixtures were updated for world-scoped navigation and shortened house labels.
- Browser: Explore Hogwarts shows four available houses and two locked room chapters. Entering Slytherin updates the workspace and journey widget. View your journey opens Hogwarts directly; All nooks restores focus to search. Searching Slytherin returns Hogwarts.
- Visual review at desktop and 390×844: cards and chapter content adapt to mobile; page width remains 390px. Temporary viewport override reset. Preview left open on the item-to-room journey.
- Independent source reviewer identified and verified fixes for favorites reopening the old detail and lost focus when returning from direct journey entry. No unintended inventory grants found. Prior production-readiness assessment is unchanged.

Screenshot: hogwarts-journey-prototype.jpg.
