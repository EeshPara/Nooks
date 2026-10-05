import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployPreview, preflightPreview, runCommand } from '../scripts/deploy-preview.mjs';
import { previewProject, previewScope, previewApiEntry, previewFunctionConfig, previewProjectConfig, previewOutputConfig } from '../scripts/preview-deployment-contract.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'nooks-deploy-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'deploy/vercel-preview'), output = join(destination, '.vercel/output'), api = join(output, 'functions/api/index.func');
  async function file(path, value) { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value)); }
  await file(join(destination, '.vercel/project.json'), previewProject);
  await file(join(destination, 'vercel.json'), previewProjectConfig);
  await file(join(root, 'dist-preview/index.html'), '<!doctype html><div id="root"></div><script type="module" src="/assets/index-123.js"></script><link rel="stylesheet" href="/assets/index-456.css">');
  await file(join(root, 'dist-preview/assets/index-123.js'), 'export const working = true;');
  await file(join(root, 'dist-preview/assets/index-456.css'), 'body { margin: 0; }');
  await file(join(root, 'server/browser-api.mjs'), 'export function createBrowserApiHandler() { return () => {}; }');
  await file(join(root, 'ui/src/world/room-rewards.json'), { rooms: [] });
  async function packageOutput() {
    await mkdir(output, { recursive: true });
    await cp(join(root, 'dist-preview'), join(output, 'static'), { recursive: true });
    await cp(join(root, 'server'), join(api, 'server'), { recursive: true });
    await file(join(api, 'ui/src/world/room-rewards.json'), await readFile(join(root, 'ui/src/world/room-rewards.json'), 'utf8'));
    await file(join(output, 'config.json'), previewOutputConfig);
    await file(join(api, 'index.mjs'), previewApiEntry);
    await file(join(api, 'package.json'), { type: 'module' });
    await file(join(api, '.vc-config.json'), previewFunctionConfig);
  }
  await packageOutput();
  return { root, destination, output, api, file, packageOutput };
}

test('deploy pipeline awaits packaging, checks import without secrets, and uses only the existing prebuilt production target', async t => {
  const f = await fixture(t), calls = [], logs = [];
  await rm(f.output, { recursive: true });
  const env = { PATH: process.env.PATH, VERCEL_TOKEN: 'do-not-print-token', SUPABASE_SERVICE_KEY: 'do-not-forward-to-import' };
  await deployPreview({ root: f.root, env, log: value => logs.push(value), run: async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'npm') { await new Promise(resolve => setTimeout(resolve, 15)); await f.packageOutput(); }
    else if (command === process.execPath) await runCommand(command, args, options);
  } });
  assert.deepEqual(calls.map(call => call.command), ['npm', process.execPath, 'vercel']);
  assert.deepEqual(calls[0].args, ['run', 'package:preview']);
  assert.equal(calls[0].options.cwd, f.root);
  assert.deepEqual(calls[1].options.env, { PATH: env.PATH });
  assert.deepEqual(calls[2].args, ['deploy', '--prebuilt', '--prod', '--yes', '--scope', previewScope]);
  assert.equal(calls[2].options.cwd, f.destination);
  assert.equal(logs.join('\n').includes(env.VERCEL_TOKEN), false);
  assert.equal(logs.join('\n').includes(env.SUPABASE_SERVICE_KEY), false);
  await assert.rejects(access(join(f.root, '.nooks-preview-deploy.lock')));
});

test('wrong linked project, organization, project name or environment target prevents even building', async t => {
  const f = await fixture(t);
  for (const key of Object.keys(previewProject)) {
    await f.file(join(f.destination, '.vercel/project.json'), { ...previewProject, [key]: 'unrelated-private-project' });
    await assert.rejects(deployPreview({ root: f.root, env: {}, run: () => assert.fail('must not run'), log() {} }), /not the existing Nooks project/);
  }
  await f.file(join(f.destination, '.vercel/project.json'), previewProject);
  for (const key of ['VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
    await assert.rejects(deployPreview({ root: f.root, env: { [key]: 'secret-unrelated-target' }, run: () => assert.fail('must not run'), log() {} }), error => {
      assert.match(error.message, /conflicts/); assert.equal(error.message.includes('secret-unrelated-target'), false); return true;
    });
  }
});

test('missing or malformed project link fails without creating or linking a replacement project', async t => {
  const f = await fixture(t);
  await f.file(join(f.destination, '.vercel/project.json'), 'malformed do-not-log');
  await assert.rejects(preflightPreview(f.root, {}), /not valid JSON/);
  await rm(join(f.destination, '.vercel/project.json'));
  await assert.rejects(deployPreview({ root: f.root, env: {}, run: () => assert.fail('must not run'), log() {} }), /project link is missing/);
});

test('failed build cannot deploy an older valid output and always releases the deployment lock', async t => {
  const f = await fixture(t), calls = [];
  await assert.rejects(deployPreview({ root: f.root, env: {}, log() {}, run: async command => { calls.push(command); throw new Error('Build failed'); } }), /Build failed/);
  assert.deepEqual(calls, ['npm']);
  await assert.rejects(access(join(f.root, '.nooks-preview-deploy.lock')));
});

const corruptions = [
  ['missing index', async f => rm(join(f.output, 'static/index.html'))],
  ['missing JavaScript', async f => rm(join(f.output, 'static/assets/index-123.js'))],
  ['stale stylesheet', async f => writeFile(join(f.output, 'static/assets/index-456.css'), 'old-styles')],
  ['bad index reference even when source and package match', async f => { for (const path of ['dist-preview/index.html', 'deploy/vercel-preview/.vercel/output/static/index.html']) await f.file(join(f.root, path), '<div id="root"></div><script src="/assets/missing.js"></script><link href="/assets/index-456.css">'); }],
  ['missing routes', async f => rm(join(f.output, 'config.json'))],
  ['static fallback ahead of API', async f => f.file(join(f.output, 'config.json'), { ...previewOutputConfig, routes: [...previewOutputConfig.routes].reverse() })],
  ['unknown project build command', async f => f.file(join(f.destination, 'vercel.json'), { ...previewProjectConfig, buildCommand: 'echo accidental build' })],
  ['missing API handler', async f => rm(join(f.api, 'index.mjs'))],
  ['wrong API runtime', async f => f.file(join(f.api, '.vc-config.json'), { ...previewFunctionConfig, runtime: 'nodejs18.x' })],
  ['stale API module', async f => f.file(join(f.api, 'server/browser-api.mjs'), 'export default null;')],
  ['mismatched reward catalog', async f => f.file(join(f.api, 'ui/src/world/room-rewards.json'), { rooms: ['old'] })],
  ['unexpected function', async f => f.file(join(f.output, 'functions/other.func/index.mjs'), 'private-content')],
  ['private file in static source and package', async f => { await f.file(join(f.root, 'dist-preview/.env'), 'SECRET=neverpublish'); await f.file(join(f.output, 'static/.env'), 'SECRET=neverpublish'); }],
  ['asset symlink', async f => { await rm(join(f.output, 'static/assets/index-123.js')); await symlink(join(f.root, 'dist-preview/assets/index-123.js'), join(f.output, 'static/assets/index-123.js')); }],
];
for (const [name, corrupt] of corruptions) test(`${name} blocks deployment before any Vercel invocation`, async t => {
  const f = await fixture(t), calls = [];
  await assert.rejects(deployPreview({ root: f.root, env: {}, log() {}, run: async command => {
    calls.push(command);
    if (command === 'npm') await corrupt(f);
  } }), /Public deployment stopped:/);
  assert.deepEqual(calls, ['npm']);
});

test('API import failure blocks deployment and a change during import is detected by the final preflight', async t => {
  const f = await fixture(t), calls = [];
  await assert.rejects(deployPreview({ root: f.root, env: {}, log() {}, run: async command => {
    calls.push(command); if (command === process.execPath) throw new Error('Missing package dependency');
  } }), /Missing package dependency/);
  assert.deepEqual(calls, ['npm', process.execPath]);
  calls.length = 0;
  await assert.rejects(deployPreview({ root: f.root, env: {}, log() {}, run: async command => {
    calls.push(command); if (command === process.execPath) await f.file(join(f.destination, '.vercel/project.json'), { ...previewProject, orgId: 'another-org' });
  } }), /not the existing Nooks project/);
  assert.deepEqual(calls, ['npm', process.execPath]);
});

test('concurrent deployment fails closed without stealing the first operation lock', async t => {
  const f = await fixture(t);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  const first = deployPreview({ root: f.root, env: {}, log() {}, run: async command => { if (command === 'npm') { entered(); await paused; } } });
  await started;
  await assert.rejects(deployPreview({ root: f.root, env: {}, run: () => assert.fail('second deploy ran'), log() {} }), /holds the lock/);
  await access(join(f.root, '.nooks-preview-deploy.lock'));
  release(); await first;
  await assert.rejects(access(join(f.root, '.nooks-preview-deploy.lock')));
});

test('CLI runner propagates nonzero exits without copying subprocess diagnostics into errors', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(17)'], { env: {} }), /did not finish successfully/);
});
