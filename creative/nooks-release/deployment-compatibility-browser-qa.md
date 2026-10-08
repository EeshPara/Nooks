# Deployed release compatibility acceptance — October 8, 2026

**PASS within the tested device-mode browser scope.** Root operated Chrome through CUA. No real account or original user material was edited. The public release is `https://nooks-study-space-iebenwu3j-eeshpara-1663s-projects.vercel.app`, aliased to `https://nooks-study-space.vercel.app`. Current entry is `/assets/index-BHG_76oL.js`; current HTML identity is `df2d810df2a8f0b88e19f23b`.

## Actual public tab left open during deployment

The public QA tab had loaded the preceding f4pl release for the artwork-copy check. Before deployment, its DOM script was `/assets/index-3dqvx5TN.js`; it had visited the home/discovery/studio views but had not opened the deferred editor after that reload. Root left it open through the new deployment.

After deployment, Pick up where you left off opened the original QA note successfully. The editor retained the existing Cellular respiration content and the earlier mobile QA sentence. Root changed only the disposable note title to **Public release compatibility verified** and observed Saved. A DOM check still showed the old f4pl entry, demonstrating that this was the old running client, not a refreshed build.

Root then reloaded the public page. The new entry `/assets/index-BHG_76oL.js` was present, the resume card retained the new title, and reopening the note retained the prior body and Saved state. This establishes old-client editor loading and guest note saving across this deployment. It does not prove old authenticated-client compatibility with future backend schema changes.

## Earlier nine-z release on a fresh origin

`old-release-browser-proxy.mjs` served the exact-source reconstruction of the earlier `8f548b9` / nine-z HTML at a fresh loopback origin, `127.0.0.1:5192`. Its HTML SHA is `ed6bf3dc9e61cab97c10b615899864131ef4342af5226cf97addb6ce73cf291c`. All six JS/CSS artifacts from that reconstruction match the original published hash report at that Git commit. The proxy forwards asset requests to the actual stable public alias and verifies old JS/CSS hashes and sizes before returning them. It supplies device-only configuration and rejects mutations; it does not forward browser credentials.

A fresh disposable Archive QA profile completed onboarding and skipped the optional tour. The editor had never loaded at this origin. Opening the seeded note requested `/assets/study-content-CAoZffAd.js` from the current public alias and received HTTP 200, exactly 543,864 bytes, SHA `0303d418eedfa2c93486c4303c0b790592951a9e72826243d36634db81c28498`. The editor became usable.

Root set the disposable title to **Archived release note** and its body to:

> Older release compatibility check: this note still saves after a new deployment.

The editor showed 13 words and Saved. After a full reload and reopening from the resume card, the exact sentence and Saved state remained. A screenshot was visually inspected. `old-release-browser-assets.json` records all proxied JS/CSS requests, including the original deferred module; each recorded request passed the original release hash/size check. This is a real old-frontend browser flow using live retained assets, with a local device-mode configuration; it is not an authenticated old-client API test.

## Current release and backend checks

- `public-compatibility-verification.json`: 16/16 actual public checks passed, including exact current metadata/HTML, both retained JS/CSS graphs, fresh retry queries, and genuine 404/no-store responses for missing assets. No missing asset returned immutable SPA HTML.
- `public-asset-verification.json`: 70/70 resources passed, including all 50 videos, 10 audio files and the complete current/retained JavaScript and stylesheets.
- The current public Nooks → Create a nook → Close nook studio flow returned keyboard focus to the Nooks button. The old f4pl flow had returned focus to the page body. No draft was changed.
- The fresh one-fixture authenticated canary passed: config 200/125 ms; workspace 200/393 ms. A 20,028-byte, 10,000-level invalid profile request returned 400 INVALID_INPUT and left the profile unchanged. Session/account/Auth cleanup passed; root's exact orphan-topic guard found zero remaining accounts/topics. See the 09:56 operations reports.

The compatibility policy retains verified generations for 48 hours from capture, with a conservative minimum 24-hour open-page window under the guarded deployment timing. Limits are 16 prior graphs and 32 MiB; deployments stop rather than discard unexpired assets. This is bounded frontend compatibility, not indefinite tabs, old API pinning, email onboarding, or physical-device performance proof.
