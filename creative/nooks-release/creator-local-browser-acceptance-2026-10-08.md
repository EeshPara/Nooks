# Local creator browser acceptance

October 8, 2026. Actual Chrome CUA interactions with the local public/device app at `http://127.0.0.1:5188/`, tab538569855. Existing Flow QA onboarding was reused; no public user tab, live identity, authentication, media generation or backend fixture was touched.

Passed journey:

1. Nooks → Create a nook → entered `QA Cabin October 8` and a descriptive fixture sentence → Choose a scene → Comfy Cabin.
2. Save draft showed `Private draft saved` and `Saved · Version 1`. Focus remained on Save draft.
3. Use this look closed Studio and showed the matching personal title on the study page and community-preview header, fireplace ambience, Comfy Cabin collection and matching playlist.
4. Full reload preserved the applied personal title and Comfy Cabin presentation.
5. Nooks → My Nooks showed exactly one saved private draft with the expected title/description. Open in Studio restored title, description, Comfy Cabin and Version1.
6. Edited description to `Quiet gallery nook. Retained edit verified on October 8.` → New nook draft raised the unsaved-changes prompt. Keep editing preserved the edit.
7. Ordinary Close → Nooks → Create a nook reopened the retained unsaved editor with the exact new description. Save draft succeeded as Version2 and retained button focus.

A CUA screenshot captured the saved Version2 Studio, title, description, selected cabin artwork and private draft entry. The local test draft remains saved as evidence; no draft was deleted.

No new product defect was found in this bounded device journey. Two semantic-selector attempts timed out; fresh AX state and the visible indexed controls completed the actions. These are tooling observations, not asserted application failures.

Limits: this does not establish real connected custom-art upload/apply, public publication, native host rendering, community/secret-state transitions, or dirty-note cancellation behavior. The last transition source patch was being prepared independently during this session, so this report does not substitute for its focused tests or final-build acceptance.
