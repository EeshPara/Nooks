# Study result revision integrity — 2026-10-04

Released native commit `f37c980c6ce756545eefa05291bc0d8d1f09e50a`, deployment `appgdep_6ac2e3f3e10081918662771fefb63aea`, succeeded 2026-10-04T23:40:47.385706+00:00. Native audience remains owner-private. Public alias deployment: https://nooks-study-space-kl8kcduo9-eeshpara-1663s-projects.vercel.app . No hosted migration, environment, plan, or audience changes.

## Fixed failure

An actual-engine reproduction opened quiz revision1 where option0 was correct, reordered options in revision2, then submitted original answers. Before the fix, server stored0/1 despite the UI showing1/1. New results carry the revision actually studied; different material versions are rejected without updating scores, card review state, XP, or nook progress.

Old open quizzes and cards may finish only when their exact owner-scoped saved checkpoint attests the same session, kind, current revision, and compatible evidence. Missing version without that proof is never replaced with the current revision. Previously committed session retries return the original event unchanged, even after edits/deletion. Matching and sprint games capture their starting version.

Deleted artifacts raise an O(1) workspace revision floor so recreating an ID cannot reinterpret old answers. Stale saves with an expected positive revision cannot resurrect a deleted note or study set. Conflicted or deleted pending results remain available to export/discard explicitly; they no longer block later valid saves. Network and owner errors stay retriable.

## Evidence

- Full backend270/270, UI369/369, cloud9/9; TypeScript and both builds pass.
- Independent reviewer54 focused tests pass. Three substantive findings corrected before release.
- Live native authenticated `workspace_get` succeeds with Supabase and4 library items. Existing native draft and quiz sessions left untouched.
- Public bundle `index-Du7g6ItH.js`: Music closes by visible X and outside tap; same nook/timer state retained; no console warnings/errors.
- Public config, health, exactJS andCSS assets HTTP200. Public backend remains unconfigured awaiting existing credential-destination approval.
- Screenshot: `practice-popup-release-2026-10-04.png`.

## Separate ongoing work

Real native artwork fileParams receive now succeeds from the observed Central US host; fresh native widget CORS import/completion/reopen remains unverified. Custom-publication DB packet is locally tested and reviewed but deliberately excluded from this release. Server/UI integration and hosted application are still required. This release is not overall production sign-off.
