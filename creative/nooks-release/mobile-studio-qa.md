# Mobile Studio QA — October 8, 2026

Tested public release `iebenwu3j` in a fresh Chrome tab using the existing disposable Release QA device profile. This was responsive desktop-browser emulation, not a physical phone or software-keyboard test. The fresh tab successfully measured **390 × 844**, document width/scrollWidth 390. A prior attempt on another tab had not applied the override and was explicitly excluded from mobile evidence.

## Passing observed behavior

- Nook Studio measured 374 pixels wide and 826 pixels high, with scrollWidth 372. A screenshot showed the artwork preview, name/description fields, artwork tabs and persistent action footer fitting the viewport without horizontal overflow.
- Created the device-local gallery draft **QA quiet corner**, choosing **Comfy Cabin**. Save showed **Private draft saved** and **Saved · Version 1**. No upload, account fixture, public publication or provider configuration was used.
- Closing Studio restored keyboard focus to Nooks on this mobile-sized layout.
- After a full page reload, Studio still listed the draft. Opening it retained the exact title, Comfy Cabin selection and saved revision. **Use this look** returned to the workspace with **Welcome to QA quiet corner** and the Comfy Cabin collection. The private draft is recoverable; no data loss was observed.

## Reproduced issues under repair

1. Clicking **Save draft** drops focus to the page body while the button is disabled during saving. The dialog remains mounted. A narrow focus-preserving busy-button fix is in review; this report does not claim it deployed.
2. After saving and reloading, **Nooks → My Nooks** showed **0 saved nooks**, while Studio correctly retained the draft. Source inspection confirms discovery consumes the legacy `readNookDrafts` list, whereas current Studio drafts use `nook_draft_list`/`nook_draft_save`. This is a discoverability/integration defect, not demonstrated deletion. An owner-scoped integration is being considered; existing legacy drafts must remain available.

The saved QA draft belongs only to the disposable local guest profile. The page was left without an unsaved edit after previewing it.

## Local candidate follow-up — My Nooks and Save focus

The first reviewed candidate built successfully but was **not published**. Actual Chrome at measured 390 × 844 (document scrollWidth390) created two disposable device-local drafts on localhost5190: QA discovery A using Comfy Cabin, and QA discovery B with custom artwork still empty. Saving A kept `document.activeElement` on the Save draft button and reported Saved · Version1. Closing Studio restored the Nooks control. My Nooks then showed three saved nooks: the existing Moon Observatory favorite and both Studio drafts. A used its gallery thumbnail; B displayed Custom artwork, and both cards said Private draft / Open in Studio. Opening A selected its exact title and version.

The repeated journey exposed a real integration defect missed by source tests: after Studio had mounted, returning to discovery left an earlier opacity-zero `.nd-dialog` in the DOM beside the new visible dialog. Both exposed controls in the accessibility tree. The new Discovery and retained Studio used the same sibling React key (`draftOwner`), making reconciliation ambiguous. Publication was paused and the implementation/reviewer agents were notified. No useSoftDismiss workaround or DOM manipulation was used.

Dirty A → choose B opened the existing unsaved-change guard. Keep editing retained the exact unsaved description. Root saved A as Version2 before rebuilding. Cancel/reselect, final duplicate-dialog absence, full reload and public-host acceptance remain pending the corrected build.

### Corrected candidate accepted

Root rebuilt after namespacing the sibling keys and reloaded the same 390 × 844 local tab. Both saved drafts and the existing favorite survived reload; opening A restored its exact description and Version2. Root edited A again, hid Studio, and reopened discovery twice. Each observed DOM had exactly **one** `.nd-dialog`, opacity1 and one Nook categories control; Studio views had zero discovery dialogs and one `.nooks-studio`.

Dirty A → B → Keep editing → close/reopen discovery → B opened the guard again with A's exact second unsaved description. **Save and continue** saved A and opened B's exact title, empty artwork state and Version1. This actual mounted-browser repetition closes the duplicate-key regression and cancel/reselect path for the device-local candidate. New key-contract tests supplement that evidence; they do not substitute for it. Public-host acceptance follows deployment.

### Public acceptance — f2z3aj98o

The stable public alias now loads `index-xOPmcwTP.js`. In the existing disposable Release QA guest profile at measured390 × 844 / scrollWidth390, My Nooks now displays **1 saved nook**, the exact previously missing QA quiet corner draft with Comfy Cabin thumbnail, Private draft and Open in Studio. Opening it restores its exact title and Saved · Version1. Saving keeps focus on the Save draft BUTTON and reports Private draft saved; unchanged content correctly remains Version1. Closing returns focus to Nooks. Reopening discovery produces exactly one `.nd-dialog` and one categories control; returning to My Nooks still shows the draft. Screenshot inspection confirms the card and controls fit without page overflow.

This is device-local public browser evidence. Authenticated empty-list API acceptance is separate; no populated signed-in browser or actual physical-phone claim is made. Root resets the temporary viewport after acceptance.
