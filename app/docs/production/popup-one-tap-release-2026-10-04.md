# Popup dismissal release — 2026-10-04

Public production: https://nooks-study-space.vercel.app/

Native owner-private production: https://nooks-study-space.eeshwarpara.chatgpt.site

Native deployment appgdep_6ac2ea2eb6f081919b589d1f4e0444ee succeeded at 2026-10-05T00:08:04.829597+00:00. Source commit 5ffde0dceab49fcdd76bc17b29f5e1883f4d1008.

Studio X, outside tap, and Escape now dismiss without a leave-confirmation gate. The same-tab draft and pending request remain in the mounted outer component; the visible dialog remounts on reopening. Hidden async completions cannot navigate. Backdrop handlers capture events to avoid inner stopPropagation swallowing the next host tap. Close controls have 44px minimum targets and remain visible through long popup scrolling.

Validation: primary UI 389/389; independent review 56 targeted tests; cloud typecheck, 9 cloud tests and production build passed. Browser checks covered dirty-draft dismissal/reopening, outside tap, scrolled music, and mobile personalization. Public production X and outside-tap checks passed. The native deployment succeeded, but existing native tabs contain unsaved user work and were not reloaded for post-release testing.

Screenshot: popup-one-tap-release-2026-10-04.png.

No database migration, credentials transfer, audience expansion, or paid service change was part of this release. Custom-art publication remains separate and incomplete.
