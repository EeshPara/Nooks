import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// An isolated Unix-socket-only cluster: never reads DATABASE_URL or connects to an existing DB.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const binaries = process.env.NOOKS_TEST_PG_BIN || '/usr/local/bin';
const temporary = await mkdtemp(join(tmpdir(), 'nooks-supabase-pg-'));
const data = join(temporary, 'data');
let started = false;
function run(name, args) {
  const result = spawnSync(join(binaries, name), args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
try {
  run('initdb', ['-D', data, '--auth=trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-k ${temporary} -h '' -p 5432 -F`, '-w', 'start']);
  started = true;
  const files = [join(here, 'bootstrap.sql'), ...(await readdir(join(root, 'migrations'))).filter(f => f.endsWith('.sql')).sort().map(f => join(root, 'migrations', f)), join(here, 'permissions.sql'), join(here, 'hosted-smoke.sql'), join(here,'production-hardening.sql'), join(here,'community-management.sql'), join(here,'nook-privacy.sql'), join(here,'artwork-inventory.sql'), join(here,'artwork-lifecycle.sql'), join(here,'custom-art-publication.sql')];
  for (const file of files) {
    const output = run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', '5432', '-d', 'postgres', '-f', file]);
    console.log(`Passed ${file.slice(root.length + 1)}`);
    if (file.endsWith('permissions.sql') || file.endsWith('hosted-smoke.sql')) console.log(output.split('\n').filter(line => line.includes('tests passed')).join('\n'));
  }
} finally {
  if (started) run('pg_ctl', ['-D', data, '-w', 'stop', '-m', 'fast']);
  if (temporary.startsWith(join(tmpdir(), 'nooks-supabase-pg-'))) await rm(temporary, { recursive: true, force: true });
}
