/** One-command, credential-free UI workspace for the designer and their coding agent. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'web');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('Nooks needs Node 22.12 or newer. Ask the coding agent to use its bundled Node runtime or install the current LTS runtime.');
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Use npm run designer, or npm run designer:check.');
const checkOnly = args.includes('--check');
const npmCli = process.env.npm_execpath;
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: web, env, stdio: 'inherit', shell: false });
    const stop = signal => child.kill(signal);
    const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
    process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', code => { cleanup(); code === 0 ? resolve() : reject(new Error(`Nooks setup stopped (${code ?? 'interrupted'}).`)); });
  });
}
const lock = createHash('sha256').update(await readFile(join(web, 'package-lock.json'))).digest('hex');
const stamp = join(web, 'node_modules/.nooks-designer-lock');
let installed = false;
try {
  installed = (await readFile(stamp, 'utf8')).trim() === lock;
  await access(join(web, 'node_modules/vite/dist/node/index.js'));
  await access(join(web, 'node_modules/typescript/bin/tsc'));
} catch { installed = false; }
if (!installed) {
  if (!npmCli) throw new Error('Start this helper through npm run designer so it can install dependencies with the same Node runtime.');
  console.log('Setting up Nooks for design. This first step only runs when dependencies change.');
  await run(process.execPath, [npmCli, 'ci', '--prefer-offline', '--no-audit', '--no-fund']);
  await writeFile(stamp, lock + '\n');
}
// Public/device mode uses the existing real local study engine and IndexedDB.
// Never start the development backend, use hosted credentials or alter a database.
process.env.VITE_NOOKS_PUBLIC_PREVIEW = '1';
const { createServer, build } = await import(pathToFileURL(join(web, 'node_modules/vite/dist/node/index.js')).href);
if (checkOnly) {
  await run(process.execPath, [join(web, 'node_modules/typescript/bin/tsc'), '-p', join(web, 'tsconfig.json'), '--noEmit']);
  await build({ root: join(web, 'ui'), configFile: join(web, 'vite.config.ts'), build: { outDir: '../dist-preview' } });
  console.log('Nooks design checks passed.');
} else {
  const requestedPort = Number(process.env.NOOKS_DESIGNER_PORT || 5188);
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error('Choose a local preview port between 1024 and 65535.');
  const server = await createServer({
    root: join(web, 'ui'), configFile: join(web, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: requestedPort, strictPort: true, open: false },
  });
  await server.listen();
  console.log('\nNooks is ready. The coding agent should open this preview:');
  server.printUrls();
  console.log('Edit web/ui/src for instant updates. Notes and practice save on this device. Native ChatGPT AI and live community remain in the existing hosted plugin.');
  let stopping = false;
  const close = async () => { if (stopping) return; stopping = true; await server.close(); process.exit(0); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
