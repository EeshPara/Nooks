# Opening film integration

This component has no dependency on generated assets. The parent supplies final,
locally hosted `videoSrc` and `posterSrc` strings. It never calls image/video
generation, signs into another service, or touches study state.

```tsx
import OpeningFilm from './onboarding/OpeningFilm';
import { useOpeningFilm } from './onboarding/useOpeningFilm';

const opening = useOpeningFilm({
  scopeKey: draftOwner, // verified account:<UUID>, or the separate device workspace
  version: 'journey-v1',
  eligible: artworkAssetsReady && freshFirstVisit && workspaceReady,
  safeToOpen: workspaceReady && !hasUnsavedWork && !otherModalOpen && !activeArtifact,
});

<OpeningFilm
  open={opening.open}
  presentationId={opening.presentationId}
  videoSrc={finalOpeningVideoUrl}
  posterSrc={finalOpeningPosterUrl}
  endCardMode="baked-in" // When the verified film contains its own closing brand card.
  // Defaults use existing /images/nooks-wordmark.png and /images/nook-cat-logo.webp.
  onDismiss={opening.dismiss}
/>
```

`freshFirstVisit` must explicitly exclude restored/native sessions already in
progress. Do not infer it merely from an empty library: a returning student can
have an empty library. Do not include `opening.open` in `otherModalOpen`; the film
must not disqualify itself. The hook defaults to closed without explicit
eligibility and safety signals. Do not mount it only after the user has already
started interacting and later decide their now-empty view is a fresh visit.

Call `opening.replay()` from About or a welcome-film control. It returns false if
the current workspace is unsafe or unverified. Returning visitors stay closed
until this explicit action. No media elements are constructed while closed; do
not separately preload the video from the document shell.

The App currently enables explicit replay only. About's **Watch opening** and
the mounted app's `nooks_present {"presentation":"opening"}` request play an
overlay above the current work. Notes (including unsaved writing), references,
hidden creator drafts, autosave and focus timers stay mounted; replay does not
navigate home or call a study tool. The owner must be verified and loading,
competing dialogs and pending host navigation must be clear. A later host
navigation or owner change cancels the film and any queued replay. The app tool
reports `queued`; `nooks_view_state` includes `presentation:"opening"` only when
the film is actually mounted. Ordinary study navigation retains its edit guards.

The seen marker is scoped to the account/device workspace and film version, not
to the currently selected nook. It is written when the first presentation opens,
so skipping counts as seen. An in-memory fallback prevents repeated openings in
the same session when browser storage is blocked. No study data is stored.

`Enter my nook`, the visible ×, and Escape are available immediately and close
without waiting for an animation, including during the final dissolve. Natural
completion fades the whole film and native backdrop over 700 ms without moving
or scaling the image, revealing the real nook beneath. Hidden tabs pause that
dissolve and its completion timer; reduced motion dismisses immediately. The native HTML
dialog fills only the app's viewport/iframe; it does not invoke the browser
Fullscreen API. Its focus trap and restoration remain inside the app.

Autoplay is muted. Sound changes only after an explicit toggle. Reduced motion
renders the poster/end card without constructing a video element. A failed,
rejected, or continuously stalled load becomes the same usable still after at
most 2.5 seconds. Hidden tabs pause and suspend both loading/end-card timers.
By default (`endCardMode="overlay"`), a real-asset end card is shown for 1.1 seconds
at the end, then the surface dismisses; `endCardMs` adjusts that overlay's duration.
Use `endCardMode="baked-in"` for a film containing its own closing card. It dismisses
when playback ends, keeping the final frame through the 700 ms dissolve
without another logo overlay or pause. Hidden tabs defer that completion until
visible. Reduced motion and playback failure still show the usable separate card.
User entry never waits for these timers.

If a chat-driven artifact or another task appears, changing `safeToOpen` to
false immediately removes the film and clears its presentation. Finishing that
work does not reopen the interrupted film.

Verification: `node --test ui/src/onboarding/openingFilm.test.mjs` executes the
actual history, playback controller, first-visit hook, and closed component
boundary. Root integration still needs rendered mobile/desktop verification
with the final video asset and the actual host's autoplay/CSP behavior.

The isolated Vite page `/opening-film.html` loads the actual component only after
pressing Play opening. It uses `/media/opening-film/nooks-opening-v2.mp4` and
`/media/opening-film/nooks-opening-poster-v2.jpg`, with the real
`/images/lofi-rainy-library.webp` beneath it. It is a labeled film preview with
replay and a dismissal reason, without App, storage, native sessions, or mock controls.
