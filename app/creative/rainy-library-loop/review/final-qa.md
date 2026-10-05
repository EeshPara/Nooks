# Rainy Library finished-loop review

**Verdict: acceptable for the requested subtle study-background preview.** No blocking issue found in sampled-frame visual inspection or numeric motion checks. Root should still verify several loops underneath the actual workspace UI.

Reviewed `rainy-library-loop-v1.mp4`: H.264, 1280 × 720, 24 fps, 173 frames, 7.208 seconds, 578,523 bytes. No audio stream.

## Improvements

- Camera alignment remains zero integer pixels between first and last frames across all measured regions.
- Furnishings appear stable in sampled final frames. Peak desk/chair variation from the initial frame is only **0.78/255**, down **83.8%** from the generated source.
- Steam is now a faint wisp near the cup. The large plume no longer dominates the window. Peak variation across the broad steam region is **5.85/255**, down **85.1%**.
- The loop-boundary full-frame difference is **1.09/255**, down **67.6%** from the generated source. Mean signed brightness change across the boundary is only **−0.21/255**.
- Generated first-frame static compositing avoids the original-versus-generation geometry mismatch identified in source review.

## Measured limits

The boundary difference is still 4.59 times the very small ordinary adjacent-frame p95. This relative ratio does not establish a perceptually perfect seam. Absolute changes are low; static-region encoding variation contributes to the measurement. After a two-pixel blur, the full-frame boundary difference is **0.58/255**. No large motion jump or distracting brightness reset appeared in the sampled first/last comparison.

| Region | Adjacent p95 | First/last difference | Maximum difference from first frame |
|---|---:|---:|---:|
| Whole frame | 0.236 | 1.087 | 1.809 |
| Desk and chair | 0.157 | 0.699 | 0.776 |
| Right books | 0.162 | 0.804 | 0.857 |
| Cat and cushion | 0.204 | 0.877 | 0.942 |
| Distant city | 0.418 | 1.835 | 1.916 |
| Broad steam region | 0.640 | 1.366 | 5.854 |

All differences are mean absolute RGB-channel differences on a 0–255 scale, measured at 640 × 360. This review covers the encoded asset, not browser autoplay, live performance, reduced-motion behavior, or a user-visible deployment.

Evidence: `final-motion-metrics.json`, `final-seam-comparison.jpg`, sampled `final-frame-*.png`, and reproducible `measure_final.py`.
