# The 50-nook background collection

Generated October 7, 2026 with built-in image generation from the approved 50-concept research list. This is the background-art phase only; the planned 20 themed prizes per nook have not been generated or implemented.

- `prompts.json`: exact base prompts and approved concept metadata. Research source IDs refer to the original October 6 research report.
- `generated.json`: generation output provenance, final asset paths, sizes and hashes; also records the two signature-removal edits.
- `scenes.json`: ordered catalog metadata.
- Finished full backgrounds: `../../web/ui/public/images/nooks-50/`.
- Lightweight catalog thumbnails: the `thumbs/` subdirectory.

Each full background is a separate 1672 × 941 WebP. Thumbnails are 480 pixels wide. The 50 backgrounds total approximately 14.25 MB; the application loads individual selected backgrounds and lazy-loads catalog thumbnails.

The active discovery catalog contains exactly these 50 scenes. Matching existing IDs keep their progress. The 16 retired IDs are still supported when reopening saved nooks, drafts and favorites, but do not appear in the public discovery list. Old media files remain for those saved references.

Existing collections are preserved. Newly introduced IDs use the existing four-item starter collection, with separate progress per nook, pending the dedicated reward-design phase. No new collectible artwork was generated. Each scene has an explicit selection from the existing curated Spotify sources.

The previous Rainy Library animation depicts a different composition and is deliberately not played over the new background. These new backgrounds are still images. Existing portal transitions remain in place.

Integration target: Sam's designer branch, `web/ui` and its matching `web/server` validation. `app/` and `cloud/` remain independent snapshots. A Git push does not deploy either the public site or native plugin.

## Verification

After merging Sam's October 7 updates, `npm run designer:check` and all 61 web tests pass. The targeted background, thumbnail, legacy lookup, soundtrack and motion checks also pass. Engine checks save and reopen every new scene and verify isolated progress for new and retired nook IDs.

Browser inspection at `http://127.0.0.1:5189/` confirms 50 catalog entries, four Hogwarts search results, successful portal entry into Gryffindor and Stardew, and selected-background persistence after refresh. The existing paused focus session remained associated with its original nook. `catalog-preview.png` captures the integrated gallery. The local preview is left on the new Rainy Library with the catalog open.
