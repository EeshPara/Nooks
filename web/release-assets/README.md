# Public asset compatibility registry

This compatibility registry is an intentional, bounded exception to the normal rule excluding build outputs from Git. It contains only exact previously published **browser JavaScript and CSS**, with verified hashes and provenance. It never contains old HTML, API/server code, credentials, browser profiles, or user data. Native assets are outside this registry.

Each 24-character release directory is derived from its entry HTML's SHA-256. `manifest.json` registers the full JS/CSS graph, required hashed media/font dependencies, capture/deadline, and publication evidence. `assets/` contains only its registered JS/CSS bytes. Keep complete generations together.

The guarded deploy command automatically verifies and retains the currently live graph **before rebuilding**. Every new package publishes `/nooks-release.json` with its current graph and all retained generations, allowing another computer to reconstruct the same unexpired registry from the public alias. That manifest is `no-store`. Unknown legacy releases without a registered manifest stop deployment rather than being guessed from source HEAD.

Retention targets **48 hours from capture**, with a one-hour maximum capture age checked just before publication. This provides a conservative minimum 24-hour open-page compatibility window during ordinary bounded deployments. The hard limits are **16 prior graphs and 32 MiB of stored JS/CSS**, counting duplicate files in separate generations. Exceeding either limit stops publication; it does not discard an unexpired generation. Expired generations are atomically renamed out of the active registry, then their files are removed during the next preparation/capture. This is bounded compatibility, not indefinite browser-session support.

Build preparation merges only validated retained files into the new output. Filename collisions require identical hashes; current output is never overwritten with different bytes. Required non-code hashed assets must still exist unchanged in the current build, otherwise deployment stops. Preflight checks the exact current-plus-retained JS/CSS union in both build and package. It does not weaken the existing exact-copy API/package guards.

The first two registry entries were bootstrapped from actual published verification reports:

- `ed6bf3dc9e61cab97c10b615`: deployment `9z41r5dtu`, source commit `8f548b9fa0df3a5fc9bfa3cfb3596a6743350a4a`. Rebuilt in an isolated temporary checkout using the identical dependency lock; every retained file and registered dependency matched the deployed report's exact SHA-256.
- `3c3d4164950ace2411497a8b`: deployment `f4plfem4r`, copy-only working tree. Current build bytes matched the deployed verification report and fresh public HTTP responses. The manifest deliberately does not falsely attribute that dirty-tree release to a clean source commit.

No Vercel plan, audience, access policy, or billing setting was changed. A narrow race between the final live-alias check and publication remains possible if a separate operator deploys concurrently; coordinate releases to the same existing project.
