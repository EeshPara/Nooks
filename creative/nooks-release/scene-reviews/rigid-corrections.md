# Antique Workshop and Hateno Study corrections

Both final candidates pass the unchanged technical gates and are ready for independent exact-hash review. This report is producer evidence, not publication approval. No public assets or film mappings were changed, and no provider generation was requested.

| Scene | Final SHA-256 | Bytes | Seam / typical | Inside-mask change |
| --- | --- | ---: | ---: | ---: |
| Antique Workshop | `7d8af58993a8b5b8e1318456dbc3d660cf0a2ff9e271c06fb8f133e594cc08cc` | 716,718 | 1.5955 | 0.15327 |
| Hateno Study | `290ad7da5bca447dd6332a905fe9f0d62f9ea259f791fc78a3f0a63c4f9006a8` | 679,619 | 1.0228 | 0.07364 |

Antique Workshop retains the restrained cat torso motion. The pendulum mask was removed, preserving one original pendulum disk and its support; the inspected clock crop is pixel-identical across all 84 decoded frames. Source and eight sampled cat crops retain a singular silhouette and fur structure, with subtle movement inside the torso region.

Hateno Study preserves every original leaf and branch outline. The existing light-only mode extracts an AI-derived luminance signal from the original generated foliage region and applies bounded, periodic filtered daylight to the source plate. It does not import generated leaf geometry or synthesize a motion floor. The maximum signal magnitude remains 4% before the existing alpha mask; source relative variation is about 20.70% and bounded signal range is 6.59%. The brush holder is preserved with no invented steam. Viewed source/decoded comparisons show singular yellow leaf and forked branch edges.

The investigation exposed a directional quantization defect in light-only compositing: truncating a tiny negative delta from an integer source pixel subtracts a whole code value, while the equal positive delta does nothing. `quantize_frame` now rounds only light-containing compositions before uint8 conversion. Existing non-light output behavior is unchanged. Three focused regression checks cover sub-code deltas on either side of zero, symmetric resolvable deltas, clipping and legacy compatibility; the existing four light-mode tests also pass.

At ordinary CRF settings, I/P/B quantization differences still inflated seam ratios in these almost-static candidates. Antique failed at CRF2 (4.991) and CRF1 (4.241). Hateno after rounding failed at CRF2 (5.280) and CRF1 (4.872). An exploratory CRF0 encode used High 4:4:4 Predictive and was rejected as a delivery candidate. The final optional `--constant-qp 1` uses equal I/P/B quantizer ratios and regular H.264 High, yuv420p, level 3.1. It changes no underlying motion and adds only 24,559 bytes over Antique CRF2 and 10,832 bytes over rounded Hateno CRF2. Default encoder settings remain unchanged; no already-approved scenes were rerendered.

Reproduce with `finish.py --ids antique-workshop hateno-study --constant-qp 1`, then `review.py --ids antique-workshop hateno-study`, using the media Python environment. Exact metadata and codec checks are in `rigid-corrections.json`. Full-size comparison sheets, `rigid-correction-evidence.json`, `qa.json`, `finish-spec.json`, and Hateno's light signal are in each ignored scene job directory.

Visual scope: full contact sheets and source versus frames 0, 12, 24, 42, 60, 72, 82 and 83, with native crops enlarged 3× for inspection. All 84 frames decoded. No full-speed playback or integrated audio audition was performed. Independent review remains required before publishing these hashes.
