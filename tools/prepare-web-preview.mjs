// Restore only the existing, nonsecret Vercel project binding. Does not deploy.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { previewProject } from '../web/scripts/preview-deployment-contract.mjs';
const directory = new URL('../web/deploy/vercel-preview/.vercel/', import.meta.url);
const file = new URL('project.json', directory);
let existing;
try { existing = JSON.parse(await readFile(file, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing && Object.entries(previewProject).some(([key,value]) => existing[key] !== value)) {
  throw new Error('Existing project link differs. Refusing to relink another project.');
}
await mkdir(directory, { recursive: true });
await writeFile(file, JSON.stringify(previewProject, null, 2) + '\n');
console.log(`Existing Nooks project link ready: ${fileURLToPath(file)}`);
