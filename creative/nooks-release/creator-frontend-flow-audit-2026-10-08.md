# Make a Nook frontend flow map

Read-only source audit, October 8, 2026. This identifies the current outcomes and the next reproduction targets; it is not blanket production acceptance.

| Journey | Current outcome / evidence | Remaining acceptance |
| --- | --- | --- |
| Create / customize | Studio retains owner-scoped local form state and supports gallery, upload, and native AI handoff. Full pristine-payload dirty comparison protects appearance-only work. | Real native host must render; screenshot failure unresolved. |
| Save / reopen / edit | Existing focused guards protect busy/dirty state; current Studio summaries appear separately in My Nooks and reopen by guarded ID. Earlier mounted tests cover retained edits and repeated dialogs. | Real connected browser custom-art path still needs acceptance after the apply correction. |
| Use this look | Saved hydrated custom artwork exposed an internal storage reference to strict space_customize. Current narrow allowlist fix passes real backend + extracted actual UI-chain tests for both reference formats. | Browser apply/reload, plus selected community/secret-state cases below. |
| Export | Studio has no visible draft export action or established draft-export contract. | This is missing scope, not a demonstrated broken export button; define intended format before adding. |
| Publish | Review/prepare/confirm/retry flow is explicit. Public/cloud custom-art publication remains intentionally unavailable; pending app backend differs. Gallery publication requires connected backend. | Do not imply custom-art publication ships with the current UI fixes. Root/backend own authenticated publication proof. |
| Account transitions | Deliberate account switch reopens hidden dirty/busy Studio and provides save/discard; reviewed source and simulated-account mounted cases exist. | Cross-tab automatic sign-out recovery and real email onboarding are not covered; public SMTP remains a documented blocker. |

## Next bounded reproduction targets

1. App's Studio onPreview callback saves appearance but leaves `selectedLiveNook` and `secretRoom` unchanged. `sceneName` prioritizes the selected live community's title over the new appearance name. A secret room with the same parent remains active and `sceneImage` prioritizes its image over the newly applied appearance. Ordinary `enterNook` clears incompatible live selection and secret state. Reproduce with an already selected community and, separately, an unlocked same-room secret; verify title, artwork and focus attribution after applying a private Studio draft. Do not automatically leave a community or settle a timer without choosing the intended product behavior.

2. Studio preview reports “Your study backdrop is saved” after App.onPreview resolves, while that callback returns undefined without applying if `canNavigate()` refuses. Confirm a reachable retained dirty-note path; if confirmed, propagate a small explicit applied/canceled outcome and show success only on applied. Stale-presentation completion should remain silent and must not reopen hidden Studio.

These targets were not edited or labeled browser-reproduced in this audit. The current priority remains native rendering acceptance and the independently reproduced stored-artwork apply failure.
