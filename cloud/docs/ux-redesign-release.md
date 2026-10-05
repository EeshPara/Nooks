# Unified workspace release — October 2, 2026

Implements the approved UX master plan around Study, Library and Explore. Study owns the current material; browsing Library or changing the nook does not discard that material. Create is one shared action. Focus, music, membership, collections and a small Today list are secondary controls. Quiz reading surfaces use quiet paper; decorative artwork stays around the work.

## Working application behavior

- Notes edit inline, autosave with revision protection, and recover unsaved writing within the same account/device scope.
- Cards and quizzes restore positions, answers, option ordering and review flags through the shared checkpoint API. Completed practice is deduplicated by its original session ID.
- Focus starts with the current material, restores its deadline, excludes pause time, and credits the original nook once. Rewards no longer interrupt an unfinished question; earned objects wait in Collection.
- Source selection accepts typed material, pasted passages, saved items and current note drafts. Optional website generation calls the authenticated backend and saves a validated artifact; native generation uses the ChatGPT host. Unconfigured website generation offers an explicit handoff.
- Spotify playlist links and ambient playback continue when their controls close. One utility popover opens at a time.
- Explore displays curated environments without fabricated live occupancy. Real membership, private invites and presence use the authenticated community backend.

## Deployment truth

The Vercel package includes the browser frontend and a Node API. The public project had no environment variables when inspected. Without the selected Supabase project's migrations and credentials, the deployed app intentionally remains in device-storage mode. With configuration, email authentication selects an isolated account workspace; failed/expired authentication never silently switches saves to local storage.

Website AI additionally requires a server-only OpenAI API key; ChatGPT subscriptions do not cover standalone API usage. Native ChatGPT installation and hosted multi-account verification remain separate release checks. Custom-art publishing and creator-specific reward definitions are still deferred. Community freshness uses 20-second polling.

Backend configuration and release gates: [browser backend](production/browser-backend.md). Product decisions: [UX master plan](nooks-ux-master-plan.md).

## Release verification

Deployed to https://nooks-study-space.vercel.app/ on October 2. Public home and configuration endpoint return 200; config truthfully reports unconfigured backend. An isolated public browser saved a note and recovered it after reload, opened Spotify controls, and passed mobile overflow/error checks. Local browser flows verified focus pause/reload/completion, selected current-note conversion, exact flashcard and quiz checkpoint restore, hidden-keyboard isolation and duplicate-completion protection. Native and public builds passed; backend, source, recovery, audio and PostgreSQL permission tests passed. Hosted cross-account and paid-provider tests remain pending configuration.
