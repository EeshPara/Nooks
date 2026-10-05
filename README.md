# Nooks

Your little study nook in ChatGPT.

This private repository contains the Nooks work needed to continue from another computer: source code, native plugin, public website, study/backend work, design research, original artwork, and animation source files.

**Start with [START-HERE.md](START-HERE.md).** It records what is live, what is still in development, and how to continue safely.

- [Live public preview](https://nooks-study-space.vercel.app/)
- [Existing owner-private native plugin](https://nooks-study-space.eeshwarpara.chatgpt.site)
- [Latest app source](app/)
- [Published native source snapshot](cloud/)
- [Published public website source snapshot](web/)
- [Intro and Rainy Library animation sources](app/creative/)
- [UX master plan](app/docs/nooks-ux-master-plan.md)

## Open locally

Install Node.js 22.12 or newer, then:

```sh
cd app
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8787. For hot reload, leave the local server running and run `npm run dev` in another terminal.

Signing into the same ChatGPT account does not transfer local project folders. Clone this repository on the other computer and open the clone in Codex. Live service credentials remain in the existing hosting services; none are stored in this repository.
