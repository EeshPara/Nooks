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

## Account entry validation

The configured public account dialog explains that website, device and ChatGPT plugin libraries remain separate. Empty email disables Continue. Submitting `invalid-email` displayed the browser’s missing-@ validation message locally. The dialog closed normally; no email request was sent. This does not lift the SMTP launch blocker.

## Custom-artwork copy correction

Public followup `https://nooks-study-space-f4plfem4r-eeshpara-1663s-projects.vercel.app` and native version37/source `44f2dbebbc308e0e0029c87676aecf0aa8d7099d` deployed successfully. Native deployment `appgdep_6ac75f895b3c819181484f1d468f8cee` preserved owner-private access. The19 native creator tests and both builds passed. Public current-asset verification again passed66/66.

Actual public Nooks → Create a nook initially reproduced the incorrect claim that published nooks retain selected custom artwork, although deployed custom-art publication is disabled. After deployment/reload, the same flow visibly says **Custom artwork is saved privately. Shared nooks currently use gallery scenes.** The account hint now says **Connect your account to publish a shared nook.** Server readiness gives the matching user action. The development app’s separate pending custom-publication implementation was not overwritten. No draft or upload was created in this browser check.

This followup also exposed a separate deployment-skew bug affecting an already-open older deferred-editor build; see `deployment-skew-review.md`. Current-release asset success does not prove old-client compatibility. The later `iebenwu3j` release fixes it; see `deployment-compatibility-browser-qa.md` for exact deployed and old-client acceptance.

## Nook Studio keyboard followup

On the f4pl public release, closing the empty Nook Studio returned focus to the page body. Its fallback selectors referenced buttons no longer present; the previous Create a nook button had unmounted with discovery. A focused source fix now targets the existing Nooks navigation button, with the current Create study material button as a fallback. The same selected change is ported to all four source snapshots. Native version38/source `8b065b240aaf1b971bb293b8bf0b5fe40a114543`, deployment `appgdep_6ac76628f8048191957f061ed4e324a2`, succeeded at09:45:45UTC with owner-private access. Its build passed under Node22. Local Chrome acceptance on candidate HTML `df2d810df2a8f0b88e19f23b…` passed: Nooks → Create a nook → Close nook studio returned accessibility focus to the Nooks button. No draft was edited. Public release `iebenwu3j` then passed the same focus-return flow after deployment.

A later attempt to check this dialog at390 ×844 did not apply the viewport override: the actual measured width remained1536. The override was reset, and no mobile-dialog pass is claimed from that attempt.
