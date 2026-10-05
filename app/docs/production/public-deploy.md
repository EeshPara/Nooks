# Public Nooks deployment

Use Node 22.12 or later and the existing authenticated Vercel CLI. From the primary Nooks repository run:

```sh
node scripts/deploy-preview.mjs
```

The intended package alias is `npm run deploy:preview`, mapped to that exact command. This command accepts no alternate destination or flags. It targets only the existing `nooks-study-space` project in `eeshpara-1663s-projects` and does not create a Vercel project, change billing, configure credentials, migrate a database, or publish the native Site.

The command runs `npm run package:preview` and waits for the build and package to finish. It then checks the exact project link, conflicting Vercel environment overrides, the Build Output routing order, every packaged static file against the fresh build, the index's JavaScript and CSS references, the Node 22 API handler/runtime, every API module against the server source, and the reward catalog. Unexpected files, private environment files and symlinks stop the release. It imports the packaged API in a child process without backend credentials to detect missing runtime dependencies, checks again for changes, and only then runs `vercel deploy --prebuilt --prod --yes --scope eeshpara-1663s-projects` from the generated package directory.

**Do not run `vercel --prod` on the generated package.** It is Build Output API output, not a source project. A normal deployment may run a second build or publish the wrong files, leaving the homepage without its assets. Do not start packaging and deployment in parallel.

The existing project link belongs at `deploy/vercel-preview/.vercel/project.json`. A missing or mismatched link is an error, never a reason to create or link a new project automatically. Project and organization identifiers are pinned in `scripts/preview-deployment-contract.mjs`; these are public identifiers, not credentials. No token is accepted as a command argument or printed by this script.

The `.nooks-preview-deploy.lock` prevents two instances of this command from deploying concurrently. It is released after success or ordinary failure. If the process was killed, inspect the recorded PID and confirm that deployment/build work has actually stopped before removing this one lock file. A timeout while observing a running deployment is not evidence that it stopped. Do not bypass the lock with a manual Vercel command.

Before deployment, run the relevant UI and backend tests, including `node --test tests/deploy-preview.test.mjs`. The deployment guard validates packaging; it does not establish product readiness. After the CLI reports success, verify the public alias anonymously, inspect its JavaScript and CSS responses, open `/api/config` and `/api/health`, and exercise the changed behavior. Report account/backend capabilities according to those actual responses. The public Vercel preview and the owner-private native Site have separate deployment and identity configuration.

If deployment fails, do not report a successful release or change aliases by hand. Preserve the failing command/status, fix the cause, then rerun this entrypoint. If an unsafe release already reached production, restore a previously verified existing deployment through Vercel and inspect the public alias again; do not fabricate a rollback by redeploying unverified source.
