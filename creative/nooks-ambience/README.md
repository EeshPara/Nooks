# Nooks: natural sound for the 50-scene collection

Built 2026-10-08. The current 50 scenes all have explicit mixes. Rainy Library, Howl's stove and Gryffindor's hearth retain their accepted recordings and default levels. New backgrounds use the desk's acoustic perspective: waves beneath coastal rooms, leaves beyond garden windows, carriage hum on the train, water at pools, restrained night life outside night gardens, and very quiet recorded room tone indoors. No generated hiss or synthesizer stands in for these natural recordings. Brown noise and soft synth remain optional user controls, off in every preset.

`web/ui/src/world/nookAmbience.ts` contains the 50 default levels; `recordedAmbience.ts` contains the 50 scene bed recipes. Both are explicit maps, so a mistyped/new scene stays quiet. A Natural surroundings slider adjusts the scene's whole bed. Existing rain, fire, master and device-track sliders stay independent. Customized mixes and silence survive switching rooms and reloads. Old automatically cached generic mixes migrate to the new scene defaults; existing custom mixes do not unexpectedly gain new sound.

## Recording provenance

See `web/ui/src/world/audio/SOURCES.md`. Source licenses were checked on Freesound pages themselves, not inferred from third-party credits. The initially considered library sound was rejected because its current primary page says NonCommercial. A third-party list called the selected stream CC0; its primary page says CC BY 4.0, which is correctly credited in the sound panel. An initial short room recording was rejected because its author disclosed voices; the selected kyles room tone replaces it. No purchase or audio generation credits were used.

## Processing and playback

`process-audio.py` reproduces the seven new MP3s using downloaded high-quality preview files in `/tmp/nooks-{kind}-original.mp3`. These are real recordings edited for a background role: rumble removal, restrained low-pass filtering, gentle transient compression, -22 to -27 LUFS targets, and -6 dBTP processing ceiling. Three seconds of overlapping tail/head audio makes a circular loop without a silent fade-out. Stereo is preserved; source-mono recordings remain naturally centered. New loops are 29–51 seconds and 96 kbps.

The audio graph uses gain ramps for scene changes and user controls. It decodes recordings only when selected, reuses an existing player on return, and ignores stale decode completions after a scene change. Decode failures can retry. Teardown closes the context and releases all players. The limiter remains a final guard against an unusually loud user mix. User-provided local tracks and Spotify stay separate sources.

## Validation and limits

Run `python3 creative/nooks-ambience/measure-audio.py` for decoded duration, clipping, loudness, peak and boundary metrics in `audio-metrics.json`. These are signal checks, not evidence of an audition. No audio-listening tool was available in this agent session, so listening quality and all 50 mixes still need a human headphone audition; this work does not claim that subjective review occurred.

Tests cover all 50 presets/bed recipes, safe levels, storage isolation, migration of old defaults, saved silence, stale asynchronous decoding, player reuse, retries and closing during decode. TypeScript/build validation accompanies the integration. All audio stays bundled for the native host's cross-origin restrictions; the seven new MP3s add about 3.5 MB before base64 encoding. A deployment/native transport-size check remains necessary before publishing.

Validation completed: 15 targeted audio/control tests passed; web TypeScript and `npm run designer:check` passed on Node 22.17.1. The public production build's main chunk is 7.70 MB (5.08 MB gzip), including the inlined audio. App/cloud received only the corresponding six code/test files, seven new MP3s and source credits after confirming their original code was identical; their separate builds were not run because those snapshots do not have node_modules installed. No commit or deployment was performed.
