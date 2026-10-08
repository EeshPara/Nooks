# Public browser acceptance — October 8, 2026

Tested https://nooks-study-space.vercel.app after guarded deployment `nooks-study-space-k4ck6bl16`. Chrome, desktop viewport, newly created disposable local guest profile Release QA. No real account credentials or user material were used.

- Fresh onboarding completed through the welcome flow and skipped tour.
- Rainy Library used the corrected `/videos/nooks-animated-all/rainy-library.mp4`; one muted looping video reached readyState4, playing without media error.
- Ambience changed from Play to Starting sound to Ambience on, then paused. No application console warning/error; one unrelated Grammarly extension warning. This verifies startup/control state, not subjective listening quality.
- Motion toggle paused the video while ambience remained on; restored motion independently.
- Discovery displayed all50 rooms; searching Tokyo Rain returned exactly one. Details opened, Study here selected Tokyo Rain Apartment. The replacement video `/videos/nooks-animated-all/neon-tokyo.mp4` reached readyState4, playing muted with no media error.
- Mute preference survived the room switch. The Tokyo-specific Natural surroundings / Window rain preset started and paused successfully. Test profile was left muted.
- Guest header still displayed8 example people without a visible qualifier. A focused followup fix is in review; this record does not claim that fix deployed.

Earlier broader device-mode journeys are in `browser-qa-local.md`. Browser email sign-in is blocked by missing custom SMTP; admin-confirmed API fixtures do not prove email onboarding. Native connected status/render tools passed after native35, but a controllable actual native iframe was unavailable. No mobile viewport, full-speed complete-film review, or subjective audio audition is claimed.

## Followup deployment and mobile viewport

Public followup `https://nooks-study-space-8hblkfqz7-eeshpara-1663s-projects.vercel.app` is aliased to the same public URL. Native version36 (`ea8036aa098743cfb35e92693e72996ee3edf3ea`, deployment `appgdep_6ac75374ed2c819189f7387ba46c3b4b`) succeeded with the existing owner-private audience. The public asset check again passed62/62 including all50 videos and10 audio files.

- Reloaded public UI visibly says **Study together**, with no fabricated8-person count. Share-dialog source copy is corrected and typechecked; no reachable share-dialog trigger was found in this flow, so that dialog is not claimed browser-verified.
- The browser viewport capability successfully measured390 ×844 this time, unlike the earlier local attempt. Home, discovery, library and note editor all measured document width390 / scrollWidth390. Screenshots reviewed each major layout. This is responsive desktop-browser emulation, not physical-phone performance or software-keyboard coverage.
- Mobile discovery showed50 rooms; unmatched search showed0 with a recovery action; Clear returned50. Closing returned focus to Change nook.
- Mobile bottom navigation opened Library, then the seeded note editor. A disposable QA sentence was added, Saved appeared, and reload followed by Pick up where you left off preserved the sentence. No real account or original user material was edited.
- No application console errors were observed during the desktop media flow.
