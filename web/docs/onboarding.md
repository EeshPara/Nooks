# Welcome journey

A clean first visit shows the name entry, existing animal avatar picker, floating envelope, personalized developer letter, and guided tour. The welcome screens follow the supplied centered white layouts and add a faded grayscale nook with procedural grain across their lower half. Reduced-motion preferences disable bobbing and arrival animations.

The in-app tour highlights the real timer, tasks, music trigger, reward timeline, Focus mode, people counter, community privacy controls, study shortcuts, Library, Nooks tab/discovery, and replay info circle. It navigates between these views without starting a timer, playing music, changing privacy, generating content, sharing material, or joining a room. Replay restores the previously open study material. Dirty editors block replay until safely saved. The introduction does not automatically interrupt active material, open dialogs, or dirty notes.

Completion is private workspace data, saved with the existing authenticated workspace transaction; connected accounts retain it across browsers. Device mode retains it locally. Partial introductory input uses the existing owner-scoped crash drafts. The info circle replays only the in-app tour.

The chosen profile updates the existing community profile when connected. Website users may explicitly connect their account at the final tour stop; only the chosen name/avatar can cross that boundary, never the device library. Account linking uses the existing email/account flow. The website does not silently obtain or impersonate a ChatGPT account. Native ChatGPT profile updates use the verified native session. The small completion operation is included in both web and native development backends. Published native/cloud snapshots and hosted deployment remain separate and have not been replaced or deployed by this change.

Verification includes authenticated browser API isolation/validation, completion preservation tests against both backend engines, production designer build, and UI walkthroughs covering completion persistence and replay. Live ChatGPT account linkage needs acceptance in the deployed native environment; local designer mode cannot establish it.

The Library stop highlights the navigation tab. Only the arriving People panel, Library page, or Nooks dialog dissolves over 300 ms; the surrounding screen stays unchanged, and highlight bounds update without animation; highlighted areas remain sharp with a 2 px blur outside their bounds. On workspace reopening or room entry, unfinished focus sessions are completed through the existing elapsed-time accounting before the timer returns to its 25-minute setup view. Failed saves retain the session for recovery.

### Interactive practice tour

The in-app tour opens a temporary copy of the current workspace in a dedicated practice document. The normal workspace stays mounted behind it. Tool calls use the existing study engine with a memory store; the practice document replaces its own local/session storage with memory and starts without account or Spotify credentials. Tasks, timers, edits, practice results, favorites, and layout changes are discarded when the tour ends. ChatGPT generation, publishing, account connection, and real sharing remain outside practice. Spotify controls demonstrate playback state without controlling an actual Spotify device. Finishing the initial onboarding still saves the real chosen profile and onboarding completion through the normal account path.

The spotlight passes clicks to highlighted controls and any opened practice panels. The collection step uses one inverted L around the next-reward bar and timeline, leaving the music card shaded. Tour highlights remain stationary; only arriving panels dissolve.
