# Welcome journey

A clean first visit shows the name entry, existing animal avatar picker, floating envelope, personalized developer letter, and guided tour. The welcome screens follow the supplied centered white layouts and add a faded grayscale nook with procedural grain across their lower half. Reduced-motion preferences disable bobbing and arrival animations.

The in-app tour highlights the real timer, tasks, music trigger, reward timeline, Focus mode, people counter, community privacy controls, study shortcuts, Library, Nooks tab/discovery, and replay info circle. It navigates between these views without starting a timer, playing music, changing privacy, generating content, sharing material, or joining a room. Replay restores the previously open study material. Dirty editors block replay until safely saved. The introduction does not automatically interrupt active material, open dialogs, or dirty notes.

Completion is private workspace data, saved with the existing authenticated workspace transaction; connected accounts retain it across browsers. Device mode retains it locally. Partial introductory input uses the existing owner-scoped crash drafts. The info circle replays only the in-app tour.

The chosen profile updates the existing community profile when connected. Website users may explicitly connect their account at the final tour stop; only the chosen name/avatar can cross that boundary, never the device library. Account linking uses the existing email/account flow. The website does not silently obtain or impersonate a ChatGPT account. Native ChatGPT profile updates use the verified native session. The small completion operation is included in both web and native development backends. Published native/cloud snapshots and hosted deployment remain separate and have not been replaced or deployed by this change.

Verification includes authenticated browser API isolation/validation, completion preservation tests against both backend engines, production designer build, and UI walkthroughs covering completion persistence and replay. Live ChatGPT account linkage needs acceptance in the deployed native environment; local designer mode cannot establish it.
