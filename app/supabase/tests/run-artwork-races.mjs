import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

// Finite deterministic races in a self-created PostgreSQL cluster only. No
// connection URL, inherited PG credentials, hosted service or Storage HTTP.
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--report')) throw new Error('Usage: node supabase/tests/run-artwork-races.mjs [--report file.json]');
const reportPath = args.length ? resolve(args[1]) : null;
const binaries = process.env.NOOKS_TEST_PG_BIN || '/usr/local/bin';
const temporary = await mkdtemp(join(tmpdir(), 'nooks-artwork-races-'));
const data = join(temporary, 'data');
const emptyPasswordFile = join(temporary, 'empty.pgpass');
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', PGPASSFILE: emptyPasswordFile, PGSERVICEFILE: emptyPasswordFile };
const connection = ['-h', temporary, '-p', '5432', '-U', 'nooks_artwork_test', '-w', '-d', 'postgres'];
const quote = value => `'${value.replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const clients = new Set();
let started = false;
let failure;
let report;
function run(name, values, input) {
  const result = spawnSync(join(binaries, name), values, { input, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}
function sql(statement) { return run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], statement); }
class Client {
  constructor(name) {
    this.name = name; this.pending = null; this.buffer = ''; this.errors = ''; this.closed = false;
    this.child = spawn(join(binaries, 'psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    clients.add(this);
    this.exit = new Promise(resolveExit => this.child.once('close', code => {
      this.closed = true; this.fail(new Error(`${this.name}: SQL exit ${code}: ${this.errors.trim()}`)); resolveExit(code);
    }));
    this.child.once('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stderr.on('data', chunk => { this.errors = (this.errors + chunk).slice(-3000); });
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      if (this.buffer.length > 1000000) { this.fail(new Error('Test response exceeded bound')); this.child.kill(); return; }
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        const request = this.pending;
        if (!request) { this.errors += ' Unexpected SQL output'; continue; }
        this.pending = null; clearTimeout(request.timer);
        try { request.resolve(line === 'ready' ? null : JSON.parse(line)); } catch (error) { request.reject(error); }
      }
    });
  }
  fail(error) { if (this.pending) { const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.reject(error); } }
  send(command) {
    assert.equal(this.pending, null);
    assert.equal(this.closed, false);
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => { this.fail(new Error(`${this.name}: deadline`)); this.child.kill(); }, 10000);
      this.pending = { resolve: resolveRequest, reject, timer }; this.child.stdin.write(`${command}\n`);
    });
  }
  async ready() { await this.send(`\\set VERBOSITY sqlstate\nset application_name=${quote(`nooks-artwork-${this.name}`)}; set statement_timeout='8s'; set lock_timeout='5s'; set idle_in_transaction_session_timeout='8s'; set role service_role;\n\\echo ready`); return this; }
  query(expression) { return this.send(`select (${expression})::jsonb;`); }
  transaction(command) { return this.send(`${command};\n\\echo ready`); }
  async close() {
    if (!this.closed) { if (this.pending) this.child.kill('SIGTERM'); else this.child.stdin.end('\\q\n'); }
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 1500); await this.exit; clearTimeout(timer); clients.delete(this);
  }
}
async function waitBlocked(name) {
  for (let n = 0; n < 100; n++) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name=${quote(`nooks-artwork-${name}`)} and wait_event_type='Lock');`) === 't') return true;
    await sleep(10);
  }
  return false;
}
async function race(kind, first) {
  const label = `${kind}-${first}`;
  const namespace = `local:artwork-race:${label}:${randomUUID()}`;
  const actor = JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('a'))},null);`)).id;
  const other = JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('b'))},null);`)).id;
  const reservation = JSON.parse(sql(`set role service_role; select public.nooks_artwork_reserve(${quote(actor)},${quote(hash(label))},'image/png',${quote(randomUUID())});`));
  sql(`set role service_role; select public.nooks_artwork_complete(${quote(actor)},${quote(reservation.path)},${quote(reservation.pinToken)}); update public.nooks_artwork_assets set pin_until=clock_timestamp()-interval '1 hour',unreferenced_since=clock_timestamp()-interval '40 days' where account_id=${quote(actor)};`);
  const empty = { version: 1, artifacts: [], progress: [], focusSessions: [], roomProgress: {} };
  const appearance = { _storedBackground: { path: reservation.path, mime: 'image/png' } };
  const workspace = kind === 'workspace' ? { ...empty, space: appearance } : empty;
  const shares = kind === 'share' ? [{ kind: 'publish', id: randomUUID(), snapshot: { space: appearance } }] : [];
  const [save, cleanup] = await Promise.all([new Client(`${label}-save`).ready(), new Client(`${label}-cleanup`).ready()]);
  let pending;
  const saveCall = () => save.query(`public.nooks_workspace_commit(${quote(actor)},0,${json(workspace)},${json(shares)})`);
  const cleanupCall = () => cleanup.query(`public.nooks_artwork_cleanup_claim(${quote(actor)},false)`);
  const leader = first === 'save' ? save : cleanup;
  const follower = first === 'save' ? cleanup : save;
  try {
    await leader.transaction('begin');
    const firstResult = await (first === 'save' ? saveCall() : cleanupCall());
    if (first === 'save') assert.equal(firstResult.committed, true);
    else assert.equal(firstResult.candidates[0].path, reservation.path);
    pending = (first === 'save' ? cleanupCall() : saveCall()).then(value => ({ value }), error => ({ error: error.message }));
    assert.equal(await waitBlocked(follower.name), true, 'the second operation must actually wait on the common owner guard');
    // Another owner remains independent while this owner is deliberately held.
    const independent = JSON.parse(sql(`set role service_role; select public.nooks_artwork_reserve(${quote(other)},${quote(hash('other'))},'image/png',${quote(randomUUID())});`));
    assert.equal(independent.state, 'reserved');
    await leader.transaction('commit');
    const outcome = await pending;
    if (first === 'save') { assert.equal(outcome.error, undefined); assert.deepEqual(outcome.value.candidates, []); }
    else { assert.match(outcome.error ?? '', /40001/, 'fenced generation attachment must fail after the wait'); }
    const stored = JSON.parse(sql(`select jsonb_build_object('state',a.state,'references',(select count(*) from nooks_private.artwork_persisted_refs(${quote(actor)}) r where r.path=a.path and r.valid)) from public.nooks_artwork_assets a where account_id=${quote(actor)};`));
    assert.deepEqual(stored, first === 'save' ? { state: 'ready', references: 1 } : { state: 'deleting', references: 0 });
    return { kind, first, result: 'passed', secondBlocked: true, otherOwnerProgressed: true, expectedDeniedSqlState: first === 'cleanup' ? '40001' : null, ...stored };
  } finally {
    if (!leader.closed) try { await leader.transaction('rollback'); } catch {}
    if (pending) await pending;
    await Promise.all([save.close(), cleanup.close()]);
  }
}
try {
  await writeFile(emptyPasswordFile, '', { mode: 0o600 });
  run('initdb', ['-D', data, '-U', 'nooks_artwork_test', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  started = true;
  run('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-k '${temporary.replaceAll("'", "'\\''")}' -h '' -p 5432 -c unix_socket_permissions=0700 -c max_connections=12`, '-w', 'start']);
  assert.equal(sql('show listen_addresses;'), '');
  sql(await readFile(join(here, 'bootstrap.sql'), 'utf8'));
  const migrations = [];
  for (const name of (await readdir(resolve(here, '../migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    const source = await readFile(resolve(here, '../migrations', name), 'utf8'); sql(source); migrations.push({ name, sha256: hash(source) });
  }
  const outcomes = [];
  for (const kind of ['workspace', 'share']) for (const first of ['save', 'cleanup']) outcomes.push(await race(kind, first));
  // Also execute retry, expired-pin, quarantine, late-PUT, legacy, quota and ACL checks.
  const checks = sql(await readFile(join(here, 'artwork-lifecycle.sql'), 'utf8'));
  assert.match(checks, /Artwork reservation, fencing/);
  report = { result: 'passed', completedAt: new Date().toISOString(), postgres: run('psql', ['--version']), migrations,
    isolation: { transport: 'private Unix socket', tcpEnabled: false, existingDatabasesContacted: false, hostedServicesContacted: false, credentialsUsed: false, realStorageObjects: 0 },
    limits: { forcedRaces: 4, clientsPerRace: 2, maximumSqlSeconds: 8, lockTimeoutSeconds: 5, perClientDeadlineSeconds: 10 }, outcomes,
    additionalChecks: ['reservation and ack retries', 'strict pin and cleanup lease ownership', 'expired completion denial', 'share-only retention', 'retention and live-pin protection', 'late PUT tombstone re-sweep', 'legacy noncollection', '100/day and128 retained-generation quotas with idempotent retries', 'service-only ACLs'],
    limitations: ['Synthetic local PostgreSQL with platform schema stubs, not hosted Storage HTTP or production capacity.', 'SQL metadata simulates a late PUT; adapter deletion request/response behavior is tested separately with mocked Storage. Real hosted image-byte deletion remains unproven.', 'No scheduler, hosted mutation, real data deletion or lifecycle operational deployment is proven.'] };
} catch (error) { failure = error; }
finally {
  await Promise.all([...clients].map(client => client.close()));
  let stopped = true;
  if (started) try { run('pg_ctl', ['-D', data, '-w', 'stop', '-m', 'fast']); } catch (error) { stopped = false; failure ||= error; }
  if (stopped) await rm(temporary, { recursive: true, force: true });
  if (report) report.cleanup = { localClusterStopped: stopped, temporaryDirectoryRemoved: stopped };
}
if (failure) throw failure;
if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
