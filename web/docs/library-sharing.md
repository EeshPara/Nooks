# Course and material sharing

Courses remain folders in the existing workspace. Move adds materials to a course; Share appears beside a course heading and between Move and the material menu. Shared titles display the people icon, including materials inside a shared course.

Sharing requires a connected browser account and the updated browser API. View permits reading and studying; Comment adds comments; Edit also permits editing and adding materials to a shared course. These permissions apply to everyone using that invitation. Friends sign in before joining. Updating the invitation rotates its secret; stopping sharing revokes it and removes memberships. A file invitation grants access only to that file. Adding an existing material copies it into the shared folder.

The browser API verifies the actor, hashes invitation secrets, and invokes a service-only database function. Browser database roles have no table access or function execution. Edits use revision checks, update the owner's canonical workspace, and preserve note history. No service credential is sent to the browser. Invitation secrets stay in the URL fragment and are sent only to the authenticated join endpoint.

The two additive migrations are applied to the existing Nooks database. The frontend and browser API still require publication to the existing public website before friend links work there. Designer mode remains device-local and shows Connect account rather than issuing a fake link. GitHub pushes do not deploy this repository.

Verification: browser API/account and sharing unit tests; production designer build; rollback-only database assertions for roles, folder/file scope, stale revisions, history, token rotation, and revocation. Database test fixture is app/supabase/tests/library-collaboration.sql. No real account or material is modified by that fixture.
