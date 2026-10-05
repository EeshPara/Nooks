# Rainy Library source animation review

Source: `generated-8s.mp4`, 1280 × 720, 24 fps, 193 frames (8.042 seconds).

## Assessment

The generated shot keeps its camera effectively locked. Integer alignment of its first and last frames gives zero translation in the desk/chair, right bookcase, sleeping cat, and distant city regions. There is slight local texture/shading variation, so it should not be described as pixel-perfect static geometry.

The large steam plume is too prominent for a study background. Around the middle of the source clip it rises across much of the window, competing with the view and UI. It should be reduced to a narrow, low-opacity wisp immediately above the cup. Root is already preparing this treatment.

The raw video is **not ready for a hard loop**. The first/last full-frame difference is 3.35 levels on a 0–255 scale, 3.83 times the normal adjacent-frame 95th percentile. Static furniture regions show a seam approximately 4.8–5 times normal adjacent changes. This suggests a visible reset of shading/detail despite no large camera jump.

## Recommended treatment

1. Keep foreground furniture stable. Use a still donor and selectively permit restrained movement in rain, distant lights, and a small feathered steam area.
2. Be careful when choosing that donor: the generated first frame differs from the supplied original, with darker grading and slight reframing. Original-to-first mean absolute difference is 13.04/255. Local matching finds approximately −3 pixels at the desk and +5 pixels at the right bookcase at a 640-pixel measurement width. This is consistent with slight horizontal expansion, not a proven affine registration. Globally blending the original and generated clip can create double edges. The first generated frame is the safest geometrically aligned donor; alternatively exclude generated furnishings entirely and only composite narrow animated details onto the original.
3. Use an approximately 0.8–1.0 second smooth tail-to-head dissolve. Trim the duplicated head overlap: play from the overlap end through the tail, then dissolve the tail into the head. The end then meets the same next source frame that begins the loop.
4. Avoid ping-pong playback; rain and steam moving backward would be conspicuous.
5. Recheck first/last seam after encoding and view several repetitions under the actual UI. Source metrics alone do not establish final visual quality.

## Measurements

All color differences are mean absolute channel differences measured after resizing to 640 × 360. They indicate relative change, not perceptual quality scores.

| Region | Adjacent p95 | First/last difference | Seam / adjacent p95 |
|---|---:|---:|---:|
| Whole frame | 0.876 | 3.351 | 3.83× |
| Desk and chair | 0.495 | 2.393 | 4.83× |
| Right books | 0.566 | 2.825 | 4.99× |
| Cat and cushion | 0.692 | 3.389 | 4.90× |
| Distant city | 0.891 | 3.947 | 4.43× |

The steam-region maximum difference from the first frame is 39.24/255, much higher than furniture or city variation. This supports attenuating the steam independently.

Artifacts: `source-motion-metrics.json`, `source-seam-comparison.jpg`, `original-vs-source-difference.png`, and sampled `frame-*.png` files. `measure_source.py` reproduces video motion/seam measurements.

No paid generation, source UI edits, or deployment were performed during this review.
