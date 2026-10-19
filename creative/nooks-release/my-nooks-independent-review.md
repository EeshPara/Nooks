# Independent My Nooks and save-focus review — October 8, 2026

**PASS for the reviewed source and tested device-local public-browser journeys, after correcting a browser-found sibling-key collision.** This repairs two reproduced product defects: current Studio drafts were absent from My Nooks, and saving could drop keyboard focus because the active button became natively disabled. Root's measured 390 × 844 desktop-emulation evidence is in `mobile-studio-qa.md`; no physical-phone evidence is implied. This reviewer changed only this note, performed no deployment and left the current release grades unchanged.

## Privacy and request lifecycle

The new list calls the existing owner-bound `nook_drafts_list` operation and uses summary metadata, alongside the existing favorites and legacy local drafts. It does not migrate, publish, delete or replace those older records. The server's existing list result contains draft metadata rather than private image bytes or artwork prompts. Existing authenticated transport and native recovery-scope checks remain in place.

Discovery is keyed by owner. Its listing controller rejects results after disposal, account changes or a newer request; the hook also matches the captured owner against the current callback owner and masks state from a different owner during render. Callback refs avoid restarting the request on every parent render. Selection rechecks the current owner before opening Studio, and the existing Studio leave/load path owns the actual draft switch. Closing discovery disposes its controller; a late result cannot reopen it or install that result into a later dialog.

Loading and failure have explicit presentation instead of a false zero count. Failure offers Retry while existing favorites/legacy cards remain available. Malformed summary entries become a retryable failure rather than crashing card rendering or sorting. Current cards consistently say Private draft regardless of a draft's requested publication visibility. Custom artwork uses a neutral placeholder, including summaries with artwork already present; it does not invent a gallery preview or fetch private image bytes into discovery. Copy distinguishes this workspace's private drafts from device-local favorites and earlier drafts.

## Navigation and focus findings resolved

I identified an additional repeat-selection bug in the preexisting Studio effect: it marked draft B handled before the unsaved-A leave prompt completed. Canceling that prompt could make a later selection of the same B do nothing. The new explicit selection counter lets each My Nooks selection pass through the guard again while leaving A intact until confirmation. This is scoped to the new selection path; it is not a general rewrite of all host presentation behavior.

Save remains focusable during busy work through `aria-disabled` and `aria-busy`, with equivalent disabled styling and no active hover treatment. The handler synchronously checks `currentBusy`, locked state and the latest title before work starts, so repeated activation before a React rerender does not send duplicate writes. Invalid/locked controls remain natively disabled, and failed saves release the guard for retry. No forced focus or global operation refactor was introduced. Actual browser focus still needs acceptance; JSX properties alone do not prove the visible result.

## Independent verification

I inspected App/Discovery/Studio integration, the new listing helper, the existing browser account-bound transport, server summary contract and dismissal behavior. I independently ran the listing, save-focus and existing Studio-dismiss tests: **16 passed**. During review I caught a test-evidence flaw: the late-success fixture lacked required summary fields and actually followed the malformed-response path. The implementation agent corrected it to a valid summary and added a separate late-error case. I then independently reran the final **six listing/navigation/card tests**, all passing. These runs overlap; they are not 22 distinct tests.

The checks cover valid late success after owner change/close, obsolete errors after successful retry, unavailable/malformed/recovery states, old-owner navigation rejection, cancel then reselect, truthful custom/private cards, synchronous duplicate-save suppression, failure retry, locked/blank/busy states, current-reference submission and existing hide-without-discard protections. These are controller/handler and rendered-card checks, not an end-to-end mounted React or browser proof.

I independently confirmed exact web/app/cloud parity for Discovery, its CSS, the listing helper and both new test files. The agent reports all three TypeScript checks plus 32 related publication/artwork/dismissal checks passed; I did not duplicate unchanged broad suites. Selective App/Studio differences remain intentional, and Site port/deployment are root-owned.

## Original acceptance gates and limits

The original requested browser gate was: the persisted QA Studio draft appears in My Nooks, opens the exact selected draft, saves with focus retained, survives reload, and remains available after closing/reopening. Failure/Retry and dirty A → B cancel/reselect should retain their guarded behavior. Keep actual UI observations distinct from source tests and hosted authenticated account-isolation evidence.

No blocking source issue remains within this scoped review. Listing currently loads once per discovery mount, including its All nooks view; no performance or provider-cost improvement is claimed. The patch does not add public custom-art publication, merge website/native libraries, close email onboarding, prove physical-device performance or improve the production-readiness score by itself.

## Browser-found integration blocker after initial source pass

Root's actual 390 × 844 browser exercised saving gallery draft A and custom draft B, retained Save focus, listed both drafts plus a favorite, opened exact A, and preserved dirty A after choosing B then Keep editing. It also found a defect missed by this source review: Discovery and the retained Studio were siblings with the identical `key={draftOwner}`. Reopening Discovery could leave an older opacity-zero discovery dialog mounted, including duplicate category/card controls. The production browser emitted no helpful React warning; absence of console errors was insufficient.

The fix namespaces the identities as `discovery:${draftOwner}` and `studio:${draftOwner}`. Source inspection confirms those are distinct for every owner while preserving owner remounts and hidden Studio retention. The earlier helper/extracted-JSX tests do not verify React reconciliation. That source pass was held until root repeated the actual mounted-browser lifecycle below. This failure is preserved rather than described as if the first source pass had been sufficient.

## Corrected local browser acceptance

I inspected root's appended corrected-candidate section in `mobile-studio-qa.md`. On the measured 390 × 844 browser, two Discovery reopen cycles each showed exactly one `.nd-dialog`, opacity one and one category control. Studio views had zero discovery dialogs and one Studio. The two saved drafts plus favorite survived reload, and exact draft A content/version reopened correctly. Dirty A → B → Keep editing → close/reopen → B displayed the guard again with A's exact unsaved description intact. Save and continue then opened exact B, Version 1 and its expected empty custom-art state. The prior focused Save button check remains applicable because the key correction did not change that implementation.

I independently passed the final **seven listing/navigation/key tests** after the namespaced-key correction. The new contract test reads actual App JSX key expressions and checks distinct sibling identities and owner changes. It supplements the recorded real browser reconciliation proof; it does not emulate mounted React. These overlapping runs must not be counted as distinct new product journeys.

This closes the local duplicate-dialog and cancel/reselect blockers. Root performed the browser operations; this reviewer independently inspected their report and source/test evidence. At this local-candidate checkpoint, public deployment and host acceptance were still pending. The subsequent final public acceptance is recorded below; overall grades stay unchanged.

## Published transport checks

Public followup `f2z3aj98o` is now published on the existing stable alias. I inspected the 10:33 reports: current HTML `d03cf6fb1687397f7f16feb1`, 72/72 exact asset checks and 19/19 compatibility checks pass. The disposable authenticated canary returns configuration 200/114 ms and workspace 200/365 ms; `nook_drafts_list` returns 200/368 ms with the fixture's expected recovery scope and empty drafts/publications arrays. Session/account/Auth cleanup passes, zero account rows and absent Auth identity are verified. This proves the empty authenticated list contract, not populated account draft rendering or cross-user browser isolation. The exact guarded topic cleanup is now verified in `operations/authenticated-probe-topic-cleanup-2026-10-08T10-33.json`: zero fixture accounts and no orphan topic remained.

## Final public acceptance

I inspected the final f2z3aj98o section of `mobile-studio-qa.md`. Root's actual public browser at measured 390 × 844, scrollWidth 390 now displays the previously missing QA quiet corner draft as one saved nook, with its Comfy Cabin thumbnail and Private draft label. Opening selects its exact title and Version 1. Saving unchanged content keeps focus on the Save draft button and correctly remains Version 1; this complements the earlier local changed-content save proof. Closing restores Nooks focus. Reopening yields exactly one discovery dialog and category control, with the draft still available. Root visually inspected the screenshot and reset the viewport.

Native version 39/source `19fed5461a56a45df18fc60cd6fd27f265a562ff`, deployment `appgdep_6ac77159a7188191a33f78e1476bbe08`, is reported successful at 10:33:09 UTC with its owner-private audience unchanged. This is deployment evidence only; no actual native iframe was operated.

Acceptance is complete for this scoped correction. Authenticated evidence remains an empty owner-scoped API list, while populated card/save/reopen evidence uses disposable device-local drafts. Neither establishes populated signed-in browser isolation, physical-phone behavior, native-frame behavior or hosted disconnect propagation. Quality/readiness scores stay 7.5/6.5; email onboarding and operational recovery/monitoring remain open.
