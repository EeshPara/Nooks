# All 50 Nooks: animated scene expansion

This directory now owns the final reviewed films for all 50 exact-art scenes. The first three reuse their existing eight-second Higgsfield source clips, corrected after independent review found compositing artifacts; their historical `nooks-animated-pilot` files remain untouched. The other 47 reuse the completed four-second source clips. All 50 final films have independent exact-SHA sampled-frame approval, full-decode metrics and identical artwork/video mappings across web/app/cloud and the Site-owned checkout. Final media total 44,023,830 bytes. This is not a claim of continuous playback or headphone listening review.

Higgsfield Seedance 1.5 Pro supplied silent 720p source clips. The expansion used 112.80 existing credits (191.67 before, 78.87 after), with 47 paid jobs, zero paid retries and zero purchases. No correction needed a new paid generation. Finished clips play at normal speed: seven seconds for the original three and 3.5 seconds for the other 47.

`specs.py` contains object-specific prompts and hand-placed motion regions based on visual inspection of the actual 50-artwork catalog. Coordinates use a 600×338 review plate. `scene-specs.json` exports current final regions with the correct four/eight-second source durations; immutable submitted specs and original prompts remain in ignored job metadata. Source artwork hashes bind each job to its still.

## Commands

Use Python with Pillow and NumPy, plus ffmpeg/ffprobe and an authenticated Higgsfield CLI. This session uses `/private/tmp/nooks-animation-venv/bin/python` for finishing.

- `python pipeline.py`: validate every spec and export a proposed JSON specification using the requested duration; no paid requests. The checked-in final export preserves each imported job’s original duration.
- `python pipeline.py --generate --duration 4 --limit 2`: bounded generation. `--ids` selects exact scenes. `--max-spend 150` caps spending against the durable initial account balance.
- `python pipeline.py --download`: retrieve completed existing jobs without generating.
- `python finish.py --ids <scene IDs>`: finish selected downloaded sources, leaving results under ignored `jobs/` until reviewed. Never rerender approved files unnecessarily. `--constant-qp 1` preserves the reviewed normal-H.264 encoding for Antique, Hateno and Tokyo; see their reports. `--masks-only` creates overlays without generation.
- `python review.py`: decode and check finished clips, create contact sheets and difference diagnostics. Technical passing alone never publishes a clip.
- `python review.py --publish-reviewed --ids <reviewed IDs> --reviewer '<specific review evidence>'`: publish only physically present, hash-matching, technically passing, visually reviewed clips and update the UI mapping.

## Resume and spending behavior

A process-wide advisory lock prevents overlapping queues. The queue uses two workers maximum. A durable submission marker is written **before** any paid command; any interrupted or uncertain job must be reconciled with provider history manually. Re-running the queue never automatically resubmits a marked scene. The queue stops admitting new work after provider errors or the spending ceiling. It never purchases credits or changes a plan.

`jobs/`, provider account balance, generated originals, masks, diagnostic images and logs are ignored in Git. The rich checked-in `manifest.json` lists only published reviewed clips. `web/ui/src/world/nookFilms.json` maps only physically present films; app/cloud copying remains an explicit integration step. No deployment occurs from this pipeline.

## Quality controls

The untouched original still forms the entire base plate. Feathered scene geometry permits movement only at appropriate windows, fire openings, water, tiny steam regions or existing animals. Full-frame generated camera drift is suppressed outside these regions. Forward crossfades close the loop without reversing flames/rain or slowing playback. Review checks silent H.264 video, all decoded frames, seam change, background stability, actual localized motion and brightness changes. Visually inspect contact sheets and repeated playback; measurements cannot establish natural pacing on their own. A failed scene stays unpublished while its finishing is corrected.

Each scene retains its original style: believable physical motion does not convert anime, watercolor, miniature or pixel art into photographic images. Ambience is handled separately by the recorded-audio integration.

## Completion and limits

All 50 final clips passed full decode, silent 1280×720 H.264/24 fps format, unchanged seam (<4× typical), brightness and geometric containment gates. Every final hash also has independent sampled source/motion/seam inspection. Run `python creative/nooks-release/verify-media-release.py` from repository root before deployment: it fails on missing/conflicting exact-hash approval, incomplete catalog, stale artwork/metadata or target drift. Deployment evidence is recorded separately under `creative/nooks-release/`; local media publication is not a remote deployment.

`review_status.py` refreshes `review-status.json`, matching independent reports against **current exact video hashes** and retaining stale verdicts separately. Author checks cover source/mask/contact-sheet inspection and full decode; independent samples and full-speed playback/audio are different gates. No claim of auditory audition or continuous playback is made here.

Midnight Train intentionally animates only restrained cup steam after independent review caught ghosted moving trees in the provider output. Its exterior is fixed, so do not describe its final video as animated rain or moving train scenery. Tiny Mouse also uses cup steam only: its amber arch is a doorway, not a fire. False steam regions on pen/paint-water containers were removed; shark silhouettes remain protected. Slytherin’s prominent right waterfall stays static, a possible polish target requiring a new reviewed candidate.


Several scenes intentionally keep generated rigid objects, animals, foliage and skylines static after reviewers detected doubling or ghosting. Safe steam, open water and hearth motion remain. `light-only` regions preserve all original pixels’ geometry and use only bounded, periodically smoothed luminance measured from the existing generated clip. Hateno and Nevermore use very subtle illumination rather than moving leaf/flame shapes; there is no synthetic motion floor. Light frames round to nearest integer to prevent one-code darkening at zero crossings. Default non-light compositing is unchanged. Optional constant-QP encoding equalizes I/P/B quantization without requiring the less portable lossless profile. Seven focused compositor regressions pass. See individual independent reviews and correction reports for exact limitations.
