# Original pilot corrections

Three corrected candidates reuse the original paid Higgsfield jobs. No new provider calls, no shared manifest edits, and no original published pilot changes. Candidates are not published and require independent review.

All 50 catalog IDs now have specs. Imported pilots retain eight-second raw duration, original generation prompts and hashes in import-provenance.json, and durable imported-completed submission markers. The no-generation path was verified with a raising provider-command stub.

Each candidate is 7 seconds, 168 frames, 1280×720, 24 fps, silent, and passes the unchanged technical QA gates. Constant QP1 avoids almost-static I/P quantization seam inflation.

| Scene | SHA-256 | Seam / typical | Inside-mask change | Bytes |
|---|---|---:|---:|---:|
| rainy-library | `d915555624575c5c1355bd2055bcbf3b7217f9532c332d96cae84057ec04b093` | 0.3283 | 1.1440 | 859651 |
| howls-moving-study | `aaa752b280a9e5b2589e322adea960be8b2625acf839b7604be4d8423be14431` | 0.5066 | 0.4807 | 924265 |
| gryffindor-common-room | `daeea4dd5d26b2724f6e757af7ccf4042665745df019f21f6a5238913891eac7` | 1.0866 | 8.3419 | 1368026 |

## rainy-library

Removed all generated window/skyline overlays and lamp regions. Real generated cup steam only, masked above the ceramic rim; rainy exterior remains the original still artwork.

Candidate: `creative/nooks-animated-all/jobs/rainy-library/finished.mp4`.

## howls-moving-study

Removed generated cat and lantern movement. Real generated cup steam remains. The stove uses bounded periodic luminance derived from the existing generated frames, applied to original geometry; no generated iron bars or alternate flame silhouette is blended.

Candidate: `creative/nooks-animated-all/jobs/howls-moving-study/finished.mp4`.

## gryffindor-common-room

Removed generated candles and cat. Actual generated flame is restricted to the upper open hearth above screen bars, with an additional margin from the left ornamental post and lower opacity for gentler motion.

Candidate: `creative/nooks-animated-all/jobs/gryffindor-common-room/finished.mp4`.

Native source/candidate crops and temporal metrics are in pilot-corrections-crop-metrics.json and pilot-correction-*.png, reproducible through pilot-corrections-extract.py. Gryffindor final left ornamental post, right post, left candle and cat have zero temporal pixel range in their inspected crops. The screen has only a two-code-value maximum codec difference. Rainy skyline and Howl cat similarly retain geometry with at most two/one code-value codec differences.

Limit: sampled native-crop inspection only, not continuous playback or listening. Steam is restrained; Rainy skyline is deliberately static and Howl stove preserves flame shape while modulating light. No independent quality approval is implied.
