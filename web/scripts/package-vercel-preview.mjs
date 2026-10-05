/** Package the browser app and its isolated, authenticated server API. Never copy local user data. */
import { cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { previewApiEntry, previewFunctionConfig, previewProjectConfig, previewOutputConfig } from './preview-deployment-contract.mjs';
const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'dist-preview');
const destination = resolve(root, 'deploy/vercel-preview');
const output = resolve(destination, '.vercel/output');
await readFile(resolve(source, 'index.html')); // Never replace a package without a successful build.
await mkdir(destination, { recursive: true });
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, resolve(output, 'static'), { recursive: true });
const api = resolve(output, 'functions/api/index.func');
await mkdir(api, { recursive: true });
await cp(resolve(root, 'server'), resolve(api, 'server'), { recursive: true });
await mkdir(resolve(api, 'ui/src/world'), { recursive: true });
await cp(resolve(root, 'ui/src/world/room-rewards.json'), resolve(api, 'ui/src/world/room-rewards.json'));
await writeFile(resolve(api, 'index.mjs'), previewApiEntry);
await writeFile(resolve(api, 'package.json'), JSON.stringify({type:'module'}));
await writeFile(resolve(api, '.vc-config.json'), JSON.stringify(previewFunctionConfig, null, 2));
await writeFile(resolve(destination, 'vercel.json'), JSON.stringify(previewProjectConfig, null, 2));
await writeFile(resolve(output, 'config.json'), JSON.stringify(previewOutputConfig, null, 2));
console.log(`Nooks web app and authenticated API prepared at ${destination}`);
