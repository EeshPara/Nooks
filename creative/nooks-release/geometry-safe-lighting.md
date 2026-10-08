# Geometry-safe light correction — six unpublished candidates

Implemented optional `light-only` regions in `finish.py`. The original artwork supplies every flame, wick and rigid fixture pixel. Existing Higgsfield frames supply only each region’s weighted mean luminance over time. The normal forward-overlap loop is followed by periodic 125 ms Gaussian smoothing and a soft ±4% cap before the region’s existing alpha. There is no invented oscillation, minimum movement floor or amplitude amplification. Steam, water, rain and other non-light regions retain the existing pixel compositor. The default compositor and mask rendering remain unchanged.

All six candidates decode to 84 frames at 1280×720, 24 fps, 3.5 seconds, without audio. Existing `review.py` thresholds were not changed. Four focused regression tests pass: default masks match their previous bytes; constant source light remains constant; extreme input is bounded and periodic; small source fluctuations are not amplified.

Inspected native source/minimum/maximum/first/final light-region comparisons for every corrected region. Previously displaced silhouettes are absent in those samples. Contrast-normalized source-edge correlation across all 84 frames is at least 0.9974. This is a geometry diagnostic, not a perceptual-motion grade. Full-speed viewing and independent exact-hash approval remain required; nothing was published or added to the shared mapping.

Nevermore retains measurable intensity changes in all three light regions (pre-alpha peak-to-peak ranges 3.09%, 1.74%, 1.15%). Its only movement is this subtle light fluctuation. Minecraft’s front lantern signal is especially weak (0.67% pre-alpha peak-to-peak); no amplitude boost was added, and its existing hearth/rain motion remains. Do not represent these corrected lights as AI-generated moving flame silhouettes.

| Scene | SHA-256 | Existing QA | Seam ratio |
|---|---|---|---|
| nevermore-study | `1844a33560e38f11b47606757c3b9628b6ae3430ed098437e946696a11cab9d1` | PASS | 2.2109 |
| autumn-bakery | `149b1ad042465b04e6dd1dd475f13018884d8d6d63d5042e5afe598b656bd57c` | PASS | 1.1601 |
| seoul-night-cafe | `c198f3557c42e3dbf7304fa569b560d088dde174e5b12a88badc2d08d6ca562f` | PASS | 1.7450 |
| thousand-sunny-study | `27afda1e1d953fc66951a57b7900263f79d228c7bf099722aaabdd6ff7e11f19` | PASS | 1.0334 |
| minecraft-cottage | `890b936e711542e0fb4ec700437cede5dae657f81d78fad392522f65fcce7e11` | PASS | 1.1291 |
| moonlit-observatory | `be83ce5dae6ad1feabce951dcf61a481431651a649543cead6770ea5c2c74918` | PASS | 1.4555 |

Evidence: `geometry-safe-lighting-verification.json`; each scene’s ignored local job directory contains `light-only-evidence.json` with every source-derived modulation value, `light-only-verification.json`, `light-only-*-compare.png`, full-frame `review-contact.jpg`, and `qa.json`. Previous candidates were retained locally as `before-light-only.mp4`. No new paid generation, approved-scene rerender or shared manifest mutation occurred.
