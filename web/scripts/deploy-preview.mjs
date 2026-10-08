/** The only supported public deployment entrypoint: build → package → validate → prebuilt deploy. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, open, unlink } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { previewProject, previewScope, previewApiEntry, previewFunctionConfig, previewProjectConfig, previewOutputConfig } from './preview-deployment-contract.mjs';
import { retainLiveRelease, verifyLiveRelease, verifyReleaseAssets } from './release-assets.mjs';

const defaultRoot = resolve(import.meta.dirname, '..');
const fail = message => { throw new Error(`Public deployment stopped: ${message}`); };
async function regular(path, label) {
  let info; try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular file.`);
  return readFile(path);
}
async function json(path, label) {
  const content = await regular(path, label);
  try { return JSON.parse(content); } catch { fail(`${label} is not valid JSON.`); }
}
async function directory(path, label) {
  let info; try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real directory.`);
}
async function directoryChain(root, parts) {
  await directory(root, 'Repository');
  let path = root;
  for (const part of parts) { path = join(path, part); await directory(path, 'Deployment directory'); }
  return path;
}
async function inventory(path, label) {
  await directory(path, label);
  const result = new Map();
  async function visit(folder) {
    for (const name of (await readdir(folder)).sort()) {
      const file = join(folder, name), info = await lstat(file);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) fail(`${label} contains an unsupported file.`);
      if (/^(?:\.env(?:\..*)?|\.notable-data|\.git|node_modules)$/i.test(name)) fail(`${label} contains private or unexpected runtime files.`);
      if (info.isDirectory()) await visit(file);
      else result.set(relative(path, file), createHash('sha256').update(await readFile(file)).digest('hex'));
    }
  }
  await visit(path);
  return result;
}
async function sameDirectory(source, target, label) {
  const [expected, actual] = await Promise.all([inventory(source, `${label} source`), inventory(target, `${label} package`)]);
  if (!isDeepStrictEqual(expected, actual)) fail(`${label} package does not match the current source.`);
  return actual;
}
async function expectJson(path, expected, label) {
  if (!isDeepStrictEqual(await json(path, label), expected)) fail(`${label} does not match the approved deployment contract.`);
}

export async function validatePreviewProject(root = defaultRoot, env = process.env) {
  const destination = await directoryChain(root, ['deploy', 'vercel-preview', '.vercel']);
  const linked = await json(join(destination, 'project.json'), 'Vercel project link');
  for (const [key, expected] of Object.entries(previewProject)) if (linked[key] !== expected) fail('The linked Vercel project is not the existing Nooks project.');
  for (const [key, expected] of [['VERCEL_PROJECT_ID', previewProject.projectId], ['VERCEL_ORG_ID', previewProject.orgId]]) {
    if (env[key] !== undefined && env[key] !== expected) fail(`${key} conflicts with the approved Nooks destination.`);
  }
  return resolve(destination, '..');
}

export async function preflightPreview(root = defaultRoot, env = process.env) {
  const destination = await validatePreviewProject(root, env);
  const output = await directoryChain(destination, ['.vercel', 'output']);
  await expectJson(join(destination, 'vercel.json'), previewProjectConfig, 'Vercel project configuration');
  await expectJson(join(output, 'config.json'), previewOutputConfig, 'Build Output routing');
  const files = await sameDirectory(join(root, 'dist-preview'), join(output, 'static'), 'Static assets');
  await verifyReleaseAssets(root);
  await verifyReleaseAssets(root, join(output, 'static'));
  const html = (await regular(join(output, 'static/index.html'), 'Compiled index')).toString();
  if (!files.size || !/<div\b[^>]*\bid=["']root["']/i.test(html)) fail('Compiled index is not the Nooks application.');
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]).filter(value => value.startsWith('/assets/'));
  if (!references.some(value => /\.js(?:\?|$)/.test(value)) || !references.some(value => /\.css(?:\?|$)/.test(value))) fail('Compiled index has no built JavaScript and stylesheet.');
  for (const reference of references) {
    const pathname = reference.split(/[?#]/, 1)[0].slice(1);
    if (pathname.includes('..') || !files.has(pathname)) fail('Compiled index references a missing or unsafe asset.');
  }
  const api = await directoryChain(output, ['functions', 'api', 'index.func']);
  if ((await regular(join(api, 'index.mjs'), 'Browser API entrypoint')).toString() !== previewApiEntry) fail('Browser API entrypoint differs from the approved handler.');
  await expectJson(join(api, '.vc-config.json'), previewFunctionConfig, 'Browser API runtime');
  await expectJson(join(api, 'package.json'), { type: 'module' }, 'Browser API package');
  await sameDirectory(join(root, 'server'), join(api, 'server'), 'Browser API modules');
  const rewardSource = await regular(join(root, 'ui/src/world/room-rewards.json'), 'Reward catalog source');
  const rewardPackage = await regular(join(api, 'ui/src/world/room-rewards.json'), 'Reward catalog package');
  if (!rewardSource.equals(rewardPackage)) fail('Reward catalog package does not match the source.');
  const packaged = await inventory(output, 'Build Output');
  for (const path of packaged.keys()) {
    if (path === 'config.json' || path.startsWith('static/') || path.startsWith('functions/api/index.func/server/')) continue;
    if (!['functions/api/index.func/index.mjs', 'functions/api/index.func/package.json', 'functions/api/index.func/.vc-config.json', 'functions/api/index.func/ui/src/world/room-rewards.json'].includes(path)) fail('Build Output contains an unexpected file or function.');
  }
  return { destination, apiEntry: join(api, 'index.mjs'), assets: files.size };
}

export function runCommand(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    // Argument arrays, never a shell; credentials stay in the inherited environment.
    const child = spawn(command, args, { ...options, shell: false, stdio: 'inherit' });
    child.once('error', () => reject(new Error(`${command} could not start. Check the installed CLI and Node version.`)));
    child.once('exit', (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} did not finish successfully${signal ? ' (interrupted)' : ''}. No later deployment step ran.`)));
  });
}

export async function deployPreview({ root = defaultRoot, env = process.env, run = runCommand, log = console.log, retain = retainLiveRelease, verifyLive = verifyLiveRelease } = {}) {
  root = resolve(root);
  await validatePreviewProject(root, env); // Never build, relink or create a project after a wrong-destination check.
  const lockPath = join(root, '.nooks-preview-deploy.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('Another public deployment holds the lock. Wait for it to finish; do not run a second deploy.'); throw new Error('Public deployment lock could not be created.'); }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    log('Verifying and retaining the current public release before replacing its assets.');
    const capture = await retain(root);
    log('Building and packaging the public Nooks app.');
    await run('npm', ['run', 'package:preview'], { cwd: root, env });
    const prepared = await preflightPreview(root, env);
    // Only import/construct the packaged handler. This check never sends a request or reads account data.
    await run(process.execPath, ['--input-type=module', '--eval', "const {pathToFileURL}=await import('node:url');const entry=await import(pathToFileURL(process.argv[1]));if(typeof entry.default!=='function')process.exit(1);", prepared.apiEntry], { cwd: prepared.destination, env: { PATH: env.PATH ?? '' } });
    await preflightPreview(root, env); // Catch source/output/link changes while the import check was running.
    await verifyLive(capture); // The local lock cannot prevent a different computer from publishing.
    log('Verified compiled assets and the isolated API. Deploying the existing Nooks project.');
    await run('vercel', ['deploy', '--prebuilt', '--prod', '--yes', '--scope', previewScope], { cwd: prepared.destination, env });
    log('Vercel deployment completed. Verify the public page, hashed assets and API health before reporting release success.');
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 2) { console.error('This command does not accept flags or alternate deployment targets.'); process.exitCode = 1; }
  else try { await deployPreview(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
