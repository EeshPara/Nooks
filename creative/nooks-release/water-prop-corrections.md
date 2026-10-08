# Water and rigid-prop corrections

Author correction evidence for the three scenes rejected by independent review 23. These candidates remain unpublished and require independent review against the exact hashes below. No paid generation, shared manifest edit, public asset edit, or gate change was made.

| Scene | Final candidate SHA-256 | Seam / typical | Technical result |
| --- | --- | ---: | --- |
| Lighthouse Study | `a358cfcc2ed5225af6ec6641d66b05669f5e59ca8e5fd14da73d27c43fb2537b` | 1.368 | Pass |
| Desert Casita | `bdf54988552ae7f23a71893c7424c7d2b7feb203c6e2a651d25970d35b28438e` | 0.715 | Pass |
| Stationery Studio | `aac94049ca9f537333c203768554847117ead7dd2c595911369e571ca59cd547` | 0.601 | Pass |

All candidates fully decode to 84 silent frames, 1280×720, 24 fps, 3.5 seconds. The existing CRF2 compositor and unchanged technical gates were used. Only the three owned lines of `creative/nooks-animated-all/specs.py` changed.

Lighthouse water now occupies a conservative strip of open sea below the sailboat and clear of rocks, railing and telescope. Both the complete boat inspection rectangle and the left cliff rectangle have zero mask coverage and zero decoded frame-to-frame change across the whole clip. The boat no longer has a generated duplicate outline. Water and tea steam retain localized variation.

Desert water occupies two separate open-water patches to either side of the fountain stone. The false stone-pedestal trickle region is removed. The full pedestal inspection rectangle has zero mask coverage; its mean decoded frame-to-frame change is 0.00001594 channel values, with a maximum isolated channel change of 3 attributable to video encoding rather than a moving compositing layer. Source comparisons preserve the stem and base contours. Pool ripples and cup steam remain.

Stationery removes the mislabeled leaf-tip region completely. The window vase is static across all decoded frames, with zero mask coverage and zero temporal change. Only steam above the drinking mug moves. The other two scenes' steam bounds were also shortened to keep feathered motion above ceramic rims. All three cup inspection rectangles have zero mask coverage and zero decoded temporal change.

The author inspected original source plates, updated mask overlays, native motion samples at frames 0/12/24/36/48/60/72/83, enlarged source comparisons, and boundary frames 82/83/0/1. The formerly doubled or softened rigid contours are restored in these samples. No conspicuous boundary jump appears in the inspected samples. This is not continuous full-speed playback or an audio audition.

Detailed metrics are in `water-prop-corrections.json`. Ignored evidence lives under `creative/nooks-animated-all/jobs/<scene>/corrected-<region>-{motion,seam,source-compare}.png`. The reproducible evidence extractor is `jobs/lighthouse-study/water-prop-evidence.py`; each job also retains its `finished.mp4`, `qa.json`, `finish-spec.json`, mask and full-scene contact sheet. The checked-in scene export and rich/public manifests remain the integrating agent's responsibility after independent approval.
