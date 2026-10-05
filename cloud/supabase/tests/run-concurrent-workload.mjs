import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { savePracticeCheckpoint } from '../../server/practice-checkpoints.mjs';
import { openWorkspaceSession, navigateWorkspaceSession, pollWorkspaceSession } from '../../server/workspace-session.mjs';

// A finite correctness workload, never a hosted load generator. Connection
// destinations are created here; no URL, credentials or duration flag is accepted.
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--report')) throw new Error('Usage: node supabase/tests/run-concurrent-workload.mjs [--report file.json]');
const reportPath = args.length ? resolve(args[1]) : null;
const binaries = process.env.NOOKS_TEST_PG_BIN || '/usr/local/bin';
const temporary = await mkdtemp(join(tmpdir(), 'nooks-workload-'));
const data = join(temporary, 'data');
const emptyPasswordFile = join(temporary, 'empty.pgpass');
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', PGPASSFILE: emptyPasswordFile, PGSERVICEFILE: emptyPasswordFile };
const connection = ['-h', temporary, '-p', '5432', '-U', 'nooks_workload_admin', '-w', '-d', 'postgres'];
const quote = value => `'${value.replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => Math.round(value * 1000) / 1000;
const limits = Object.freeze({ owners: 2, materialCounts: [100, 1000], concurrentClients: 6, monitoringClients: 1, writerActionsPerClient: 6, casAttempts: 5, pollIterations: 20, communityIterations: 6, monitoringSamples: 100, phaseDeadlineMs: 45000, statementTimeoutMs: 8000, lockTimeoutMs: 3000 });
const samples = [];
const clients = new Set();
let startAttempted = false;
let report;
let failure;

function run(name, commandArgs, input) {
  const result = spawnSync(join(binaries, name), commandArgs, { input, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}
function sql(statement) { return run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], statement); }

class Client {
  constructor(name, size) {
    this.name = name; this.size = size; this.pending = null; this.buffer = ''; this.stderr = ''; this.closed = false;
    this.child = spawn(join(binaries, 'psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    clients.add(this);
    this.exit = new Promise(resolveExit => this.child.once('close', code => {
      this.closed = true;
      if (this.pending) this.reject(new Error(`${this.name}: SQL client exited (${code}); ${this.stderr.trim()}`));
      resolveExit(code);
    }));
    this.child.once('error', error => { if (this.pending) this.reject(error); });
    this.child.stdin.on('error', error => { if (this.pending) this.reject(error); });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-4000); });
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      if (Buffer.byteLength(this.buffer) > 24 * 1024 * 1024) { this.reject(new Error(`${this.name}: response exceeds local test bound`)); this.child.kill(); return; }
      let newline;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        if (!this.pending) { this.stderr += ` Unexpected output: ${line.slice(0, 120)}`; continue; }
        const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
        if (line === 'ready') { pending.resolve(); continue; }
        try {
          const row = JSON.parse(line);
          samples.push({ size: this.size, client: this.name, operation: pending.label, ...(pending.label.endsWith('_commit') ? { committed: row.value.committed } : {}), dbMs: Number(row.dbMs), clientMs: round(performance.now() - pending.start), responseBytes: Buffer.byteLength(line) });
          pending.resolve(row.value);
        } catch (error) { pending.reject(error); }
      }
    });
  }
  reject(error) { const pending = this.pending; this.pending = null; if (pending) { clearTimeout(pending.timer); pending.reject(error); } }
  send(statement, label) {
    assert.equal(this.pending, null, 'one command at a time per connection');
    if (this.closed) throw new Error(`${this.name}: connection already closed`);
    return new Promise((resolveResult, rejectResult) => {
      const timer = setTimeout(() => { this.reject(new Error(`${this.name}: client deadline exceeded for ${label}`)); this.child.kill('SIGTERM'); }, 12000);
      this.pending = { resolve: resolveResult, reject: rejectResult, label, timer, start: performance.now() };
      this.child.stdin.write(`${statement}\n`);
    });
  }
  async ready() {
    await this.send(`\\set VERBOSITY sqlstate\nset application_name=${quote(`nooks-workload-${this.name}`)}; set statement_timeout='${limits.statementTimeoutMs}ms'; set lock_timeout='${limits.lockTimeoutMs}ms'; set idle_in_transaction_session_timeout='8s'; set role service_role;\n\\echo ready`, 'setup');
    return this;
  }
  query(label, expression) {
    return this.send(`with started as materialized (select clock_timestamp() as at), result as materialized (select (${expression}) as value from started) select jsonb_build_object('dbMs',extract(epoch from clock_timestamp()-started.at)*1000,'value',result.value) from started,result;`, label);
  }
  async close() {
    if (!this.closed) { if (this.pending) this.child.kill('SIGTERM'); else this.child.stdin.end('\\q\n'); }
    const timeout = setTimeout(() => this.child.kill('SIGKILL'), 2000);
    await this.exit; clearTimeout(timeout); clients.delete(this);
  }
}

function material(owner, index) {
  const kind = index === 2 || index % 10 === 2 ? 'flashcards' : index % 10 === 3 ? 'quiz' : index % 20 === 4 ? 'exam' : 'note';
  const content = Array.from({ length: 96 }, (_, word) => `term${(index * 137 + word * 43 + owner * 13) % 9973}`).join(' ');
  const base = { id: `material-${index}`, kind, title: `Synthetic owner ${owner} material ${index}`, revision: 1, ownerMarker: owner };
  if (kind === 'note') return { ...base, content };
  if (kind === 'flashcards') return { ...base, cards: Array.from({ length: 8 }, (_, n) => ({ id: `card-${n}`, front: `Synthetic ${index} question ${n}`, back: content.slice(n * 50, n * 50 + 100) })) };
  return { ...base, questions: Array.from({ length: 6 }, (_, n) => ({ id: `question-${n}`, prompt: `Synthetic ${index} question ${n}`, options: ['First', 'Second', 'Third'], answer: n % 3, explanation: content.slice(n * 60, n * 60 + 110) })) };
}
function workspace(owner, size, sessionId) {
  const value = { version: 1, artifacts: Array.from({ length: size }, (_, i) => material(owner, i + 1)), progress: [], focusSessions: [], roomProgress: {}, plan: { tasks: [] }, practiceCheckpoints: {} };
  openWorkspaceSession(value, { sessionId }, new Date().toISOString());
  return value;
}
function summarize(values, field) {
  const ordered = values.map(value => value[field]).sort((a, b) => a - b);
  const percentile = fraction => ordered.length ? round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]) : null;
  return { count: ordered.length, p50: percentile(0.5), p95: percentile(0.95), max: ordered.length ? round(ordered.at(-1)) : null };
}
async function phase(size) {
  const started = performance.now();
  const owners = [];
  for (let owner = 1; owner <= 2; owner++) {
    const authId = `42000000-0000-4000-8000-${String(size * 10 + owner).padStart(12, '0')}`;
    sql(`insert into auth.users(id) values(${quote(authId)});`);
    const account = JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(`local:workload:${size}`)},${quote(hash(String(owner)))},${quote(authId)});`)).id;
    const sessionId = randomUUID();
    const seed = workspace(owner, size, sessionId);
    const saved = JSON.parse(sql(`set role service_role; select public.nooks_workspace_commit(${quote(account)},0,${json(seed)});`));
    assert.equal(saved.committed, true);
    owners.push({ owner, account, authId, sessionId, seed, bytes: Buffer.byteLength(JSON.stringify(seed)), commits: 0, conflicts: 0, attempts: [], actions: [] });
  }
  const nook = JSON.parse(sql(`set role service_role; select public.nooks_community(${quote(owners[0].account)},'create_nook',${json({ requestId: randomUUID(), title: 'Synthetic shared workload nook', roomId: 'rainy-library', visibility: 'public' })});`)).nook.id;
  sql(`set role service_role; select public.nooks_community(${quote(owners[1].account)},'join_nook',${json({ nookId: nook })});`);
  sql('analyze;');
  const connections = await Promise.all(['a-autosave', 'a-checkpoint', 'b-autosave', 'b-focus', 'read-poll', 'community', 'monitor'].map(name => new Client(name, size).ready()));
  const [autoA, checkpoint, autoB, focus, reader, community, monitor] = connections;
  const sqlErrors = [];
  const monitorSamples = [];
  let writersDone = false;
  let releaseBarrier; const barrier = new Promise(resolveBarrier => { releaseBarrier = resolveBarrier; }); let atBarrier = 0;
  async function quota(client, owner) {
    const result = await client.query('quota', `public.nooks_request_limit(${quote(owner.account)},'api',180,60)`);
    assert.equal(result.allowed, true);
  }
  async function transact(client, owner, operation, mutate, collide = false) {
    const actionStarted = performance.now();
    await quota(client, owner);
    for (let attempt = 1; attempt <= limits.casAttempts; attempt++) {
      const record = await client.query('workspace_read', `public.nooks_workspace_read(${quote(owner.account)})`);
      assert.equal(record.workspace.artifacts.length, size);
      assert.ok(record.workspace.artifacts.every(item => item.ownerMarker === owner.owner));
      mutate(record.workspace);
      if (collide && attempt === 1) { atBarrier++; if (atBarrier === 2) releaseBarrier(); await barrier; }
      const result = await client.query(operation, `public.nooks_workspace_commit(${quote(owner.account)},${record.revision},${json(record.workspace)})`);
      if (result.committed) { owner.commits++; owner.attempts.push(attempt); owner.actions.push({ operation, attempts: attempt, ms: round(performance.now() - actionStarted) }); return; }
      assert.ok(result.revision > record.revision, 'CAS conflict must report a newer revision');
      owner.conflicts++;
    }
    throw new Error(`${client.name}: five CAS attempts exhausted`);
  }
  async function autosaves(client, owner, collide) {
    for (let step = 1; step <= limits.writerActionsPerClient; step++) {
      await transact(client, owner, 'autosave_commit', value => {
        const note = value.artifacts[0];
        note.content = `${owner.seed.artifacts[0].content}\nSynthetic autosave ${step}`;
        note.revision++;
      }, collide && step === 1);
      await sleep(60);
    }
  }
  async function checkpoints() {
    const owner = owners[0]; const sessionId = randomUUID();
    for (let step = 1; step <= limits.writerActionsPerClient; step++) {
      await transact(checkpoint, owner, 'checkpoint_commit', value => {
        savePracticeCheckpoint(value, { artifactId: 'material-2', checkpoint: { version: 1, kind: 'flashcards', artifactRevision: 1, sessionId, roomId: 'rainy-library', elapsedSeconds: step, state: { queue: [0, 1, 2, 3, 4, 5, 6, 7], known: [], firstAnswers: {}, flipped: step % 2 === 0, showHint: false, complete: false, duration: step } } }, new Date().toISOString());
        navigateWorkspaceSession(value, { sessionId: owner.sessionId, view: step % 2 ? 'library' : 'study' }, new Date().toISOString());
      }, step === 1);
      await sleep(80);
    }
  }
  async function focusUpdates() {
    const owner = owners[1];
    for (let step = 0; step < 6; step++) {
      await transact(focus, owner, 'focus_commit', value => {
        if (step === 0) value.focusSessions.push({ id: 'synthetic-focus', nookId: nook, roomId: 'rainy-library', targetMinutes: 25, startedAt: new Date().toISOString() });
        else if (step === 5) { delete value.focusSessions[0].pausedAt; value.focusSessions[0].completedAt = new Date().toISOString(); }
        else if (step % 2) value.focusSessions[0].pausedAt = new Date().toISOString();
        else delete value.focusSessions[0].pausedAt;
      });
      await sleep(100);
    }
  }
  async function reads() {
    for (let step = 0; step < limits.pollIterations; step++) {
      const owner = owners[step % 2]; await quota(reader, owner);
      const sessions = await reader.query('session_poll', `select document->'workspaceSessions' from public.nooks_workspaces where account_id=${quote(owner.account)}`);
      const polled = pollWorkspaceSession({ workspaceSessions: sessions }, { sessionId: owner.sessionId, afterSequence: 0 }, new Date().toISOString(), { verifyArtifacts: false });
      assert.equal(polled.sessionId, owner.sessionId);
      if (step % 5 === 0) {
        await quota(reader, owner);
        const record = await reader.query('workspace_read', `public.nooks_workspace_read(${quote(owner.account)})`);
        assert.equal(record.workspace.artifacts.length, size);
        assert.ok(record.workspace.artifacts.every(item => item.ownerMarker === owner.owner));
      }
      await sleep(100);
    }
  }
  async function communityUpdates() {
    for (let step = 0; step < limits.communityIterations; step++) {
      for (const owner of owners) {
        await quota(community, owner);
        await community.query('heartbeat', `public.nooks_community(${quote(owner.account)},'heartbeat',${json({ nookId: nook })})`);
        await quota(community, owner);
        const snapshot = await community.query('nook_snapshot', `public.nooks_community(${quote(owner.account)},'nook_snapshot',${json({ nookId: nook })})`);
        assert.equal(snapshot.memberCount, 2);
        await quota(community, owner);
        const listed = await community.query('list_nooks', `public.nooks_community(${quote(owner.account)},'list_nooks','{}')`);
        assert.ok(listed.nooks.some(item => item.id === nook));
      }
      await sleep(100);
    }
  }
  async function monitoring() {
    for (let step = 0; step < limits.monitoringSamples && !writersDone; step++) {
      const row = await monitor.query('monitor', `select jsonb_build_object('active',(select count(*) from pg_stat_activity where application_name like 'nooks-workload-%' and application_name<>'nooks-workload-monitor' and state='active'),'lockWaiters',(select count(*) from pg_stat_activity where application_name like 'nooks-workload-%' and wait_event_type='Lock'))`);
      monitorSamples.push(row); await sleep(100);
    }
  }
  const workloadStart = performance.now();
  const watchdog = setTimeout(() => { for (const client of connections) client.child.kill('SIGTERM'); releaseBarrier(); }, limits.phaseDeadlineMs);
  const observer = monitoring().catch(error => { sqlErrors.push(error.message); });
  const results = await Promise.allSettled([autosaves(autoA, owners[0], true), checkpoints(), autosaves(autoB, owners[1], false), focusUpdates(), reads(), communityUpdates()]);
  writersDone = true;
  await observer;
  clearTimeout(watchdog);
  const workloadMs = round(performance.now() - workloadStart);
  for (const result of results) if (result.status === 'rejected') sqlErrors.push(result.reason.message);
  await Promise.all(connections.map(client => client.close()));
  assert.deepEqual(sqlErrors, [], 'concurrent actions must complete without SQL/deadlock/serialization/timeout/retry exhaustion errors');
  for (const owner of owners) {
    const record = JSON.parse(sql(`set role service_role; select public.nooks_workspace_read(${quote(owner.account)});`));
    assert.equal(record.revision, 1 + owner.commits);
    assert.equal(owner.commits, 12);
    assert.equal(record.workspace.artifacts.length, size);
    assert.equal(record.workspace.artifacts[0].content, `${owner.seed.artifacts[0].content}\nSynthetic autosave 6`);
    assert.equal(record.workspace.artifacts[0].revision, 7);
    assert.deepEqual(record.workspace.artifacts.slice(1), owner.seed.artifacts.slice(1), 'unrelated material must survive overlapping metadata updates');
    assert.equal(Number(sql(`select count(*) from public.nooks_outbox where account_id=${quote(owner.account)} and event_type='workspace.changed' and lease_token is null and attempts=0;`)), 1);
    assert.equal(Number(sql(`select (payload->>'revision')::integer from public.nooks_outbox where account_id=${quote(owner.account)} and event_type='workspace.changed';`)), record.revision);
    const visible = JSON.parse(sql(`set request.jwt.claim.sub=${quote(owner.authId)}; set role authenticated; select jsonb_build_object('total',count(*),'foreign',count(*) filter(where account_id<>${quote(owner.account)})) from public.nooks_artifacts;`));
    assert.deepEqual(visible, { total: size, foreign: 0 }, 'authenticated role must see only its actual owner, even with duplicate artifact IDs');
    if (owner.owner === 1) {
      assert.equal(record.workspace.practiceCheckpoints['material-2'].elapsedSeconds, 6);
      assert.equal(record.workspace.workspaceSessions[0].sequence, 6);
      assert.equal(record.workspace.workspaceSessions[0].command.view, 'study');
      assert.equal(record.workspace.focusSessions.length, 0);
    } else {
      assert.equal(record.workspace.focusSessions.length, 1);
      assert.ok(record.workspace.focusSessions[0].completedAt);
      assert.equal(record.workspace.workspaceSessions[0].sequence, 0);
      const ledger = JSON.parse(sql(`select to_jsonb(f) from public.nooks_shared_focus f where account_id=${quote(owner.account)};`));
      assert.equal(ledger.status, 'completed'); assert.equal(ledger.active_started_at, null);
      assert.ok(ledger.accrued_seconds >= 0 && ledger.accrued_seconds <= Math.ceil(workloadMs / 1000));
    }
  }
  assert.ok(owners[0].conflicts >= 1, 'forced overlap must actually exercise CAS conflict handling');
  const byOperation = {};
  const phaseSamples = samples.filter(item => item.size === size && item.operation !== 'monitor');
  for (const operation of [...new Set(phaseSamples.map(item => item.operation))]) {
    const values = phaseSamples.filter(item => item.operation === operation);
    byOperation[operation] = { dbMs: summarize(values, 'dbMs'), clientMs: summarize(values, 'clientMs'), responseBytes: summarize(values, 'responseBytes'), totalResponseBytes: values.reduce((sum, value) => sum + value.responseBytes, 0) };
    if (operation.endsWith('_commit')) {
      byOperation[operation].successfulAttempts = summarize(values.filter(value => value.committed), 'dbMs');
      byOperation[operation].conflictingAttempts = summarize(values.filter(value => !value.committed), 'dbMs');
      byOperation[operation].logicalSaveMs = summarize(owners.flatMap(owner => owner.actions).filter(action => action.operation === operation), 'ms');
    }
  }
  return { materialsPerOwner: size, seedWorkspaceBytes: owners.map(owner => owner.bytes), commits: owners.map(owner => owner.commits), casConflicts: owners.map(owner => owner.conflicts), maximumAttempts: owners.map(owner => Math.max(...owner.attempts)), sqlErrors, databaseCalls: phaseSamples.length, monitorSamples: monitorSamples.length, maximumObservedActiveClients: Math.max(0, ...monitorSamples.map(row => row.active)), maximumObservedLockWaiters: Math.max(0, ...monitorSamples.map(row => row.lockWaiters)), workloadMs, totalPhaseMs: round(performance.now() - started), byOperation };
}

async function membershipRace() {
  // Force the narrow check-before-insert interleaving without changing an RPC.
  // This trigger exists only in this disposable DB, outside the timing phases.
  const fixture = JSON.parse(sql(`select jsonb_build_object('account',m.account_id,'nook',m.nook_id) from public.nooks_members m join public.nooks_identity_links l on l.account_id=m.account_id where l.namespace='local:workload:1000' and l.subject_hash=${quote(hash('2'))} and m.left_at is null;`));
  sql(`create function nooks_test.gate_new_focus() returns trigger language plpgsql as $$ begin if new.id='membership-race-focus' then perform pg_advisory_lock(716204); perform pg_advisory_unlock(716204); end if; return new; end $$;
    create trigger nooks_test_gate_new_focus before insert on public.nooks_shared_focus for each row execute function nooks_test.gate_new_focus();`);
  const [gate, starter, leaver] = await Promise.all(['race-gate', 'race-start', 'race-leave'].map(name => new Client(name, 0).ready()));
  let startOutcome; let leaveOutcome; let leaveSettled = false; let leaveBlocked = false;
  try {
    await gate.query('race_gate_lock', 'pg_advisory_lock(716204)');
    const record = await starter.query('race_load', `public.nooks_workspace_read(${quote(fixture.account)})`);
    record.workspace.focusSessions.push({ id: 'membership-race-focus', nookId: fixture.nook, roomId: 'rainy-library', targetMinutes: 25 });
    startOutcome = starter.query('race_start', `public.nooks_workspace_commit(${quote(fixture.account)},${record.revision},${json(record.workspace)})`).then(value => ({ value }), error => ({ error: error.message }));
    let reachedGate = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      reachedGate = await gate.query('race_observe', "select exists(select 1 from pg_locks where locktype='advisory' and objid=716204 and not granted)");
      if (reachedGate) break;
      await sleep(10);
    }
    assert.equal(reachedGate, true, 'focus start must reach the gate after its membership check');
    leaveOutcome = leaver.query('race_leave', `public.nooks_community(${quote(fixture.account)},'leave_nook',${json({ nookId: fixture.nook })})`).then(value => { leaveSettled = true; return { value }; }, error => { leaveSettled = true; return { error: error.message }; });
    for (let attempt = 0; attempt < 100 && !leaveSettled; attempt++) {
      leaveBlocked = await gate.query('race_observe', "select exists(select 1 from pg_stat_activity where application_name='nooks-workload-race-leave' and wait_event_type='Lock')");
      if (leaveBlocked) break;
      await sleep(10);
    }
    // A locking fix may correctly block leave until the focus transaction ends.
    // Release in both cases so the regression remains valid after such a fix.
    await gate.query('race_gate_unlock', 'pg_advisory_unlock(716204)');
    const [start, leave] = await Promise.all([startOutcome, leaveOutcome]);
    assert.equal(start.error, undefined); assert.equal(leave.error, undefined);
    assert.equal(start.value.committed, true); assert.equal(leave.value.joined, false);
    const observed = JSON.parse(sql(`select jsonb_build_object('membershipLeft',m.left_at is not null,'focusStatus',f.status,'activeClock',f.active_started_at is not null) from public.nooks_members m join public.nooks_shared_focus f using(account_id,nook_id) where m.account_id=${quote(fixture.account)} and f.id='membership-race-focus';`));
    const passed = leaveBlocked && observed.membershipLeft && observed.focusStatus === 'cancelled' && !observed.activeClock;
    return { result: passed ? 'passed' : 'failed', leaveWaitedForStart: leaveBlocked, ...observed, method: 'local test-only BEFORE INSERT trigger and advisory gate force focus-start membership-check/leave overlap; not a timing sample' };
  } finally {
    if (!gate.closed) try { await gate.query('race_gate_unlock', 'pg_advisory_unlock(716204)'); } catch {}
    await Promise.all([startOutcome, leaveOutcome].filter(Boolean));
    await Promise.all([gate, starter, leaver].map(client => client.close()));
    sql('drop trigger nooks_test_gate_new_focus on public.nooks_shared_focus; drop function nooks_test.gate_new_focus();');
  }
}

async function completionRace(action, first) {
  const accounts = JSON.parse(sql(`select jsonb_object_agg(subject_hash,account_id) from public.nooks_identity_links where namespace='local:workload:1000';`));
  const owner = accounts[hash('1')]; const member = accounts[hash('2')];
  // If the preceding regression exposed an orphan, reset that synthetic fixture
  // explicitly so the next independent scenario still exercises its own race.
  sql(`update public.nooks_shared_focus set status='cancelled',active_started_at=null where account_id=${quote(member)} and status in ('active','paused');`);
  const nook = JSON.parse(sql(`set role service_role; select public.nooks_community(${quote(owner)},'create_nook',${json({ requestId: randomUUID(), title: 'Synthetic completion race', roomId: 'rainy-library', visibility: 'public' })});`)).nook.id;
  sql(`set role service_role; select public.nooks_community(${quote(member)},'join_nook',${json({ nookId: nook })});`);
  const focusId = `race-${action}-${first}`;
  const record = JSON.parse(sql(`set role service_role; select public.nooks_workspace_read(${quote(member)});`));
  record.workspace.focusSessions.push({ id: focusId, nookId: nook, roomId: 'rainy-library', targetMinutes: 25 });
  assert.equal(JSON.parse(sql(`set role service_role; select public.nooks_workspace_commit(${quote(member)},${record.revision},${json(record.workspace)});`)).committed, true);
  record.revision++;
  record.workspace.focusSessions.at(-1).completedAt = new Date().toISOString();
  const table = first === 'community' ? 'nooks_members' : 'nooks_shared_focus';
  const condition = first === 'community' ? `new.account_id=${quote(member)}::uuid and new.left_at is not null` : `new.id=${quote(focusId)} and new.status='completed'`;
  sql(`create function nooks_test.gate_focus_completion() returns trigger language plpgsql as $$ begin if ${condition} then perform pg_advisory_lock(716205); perform pg_advisory_unlock(716205); end if; return new; end $$;
    create trigger nooks_test_gate_focus_completion before update on public.${table} for each row execute function nooks_test.gate_focus_completion();`);
  const [gate, completer, revoker] = await Promise.all(['completion-gate', 'completion-save', 'completion-revoke'].map(name => new Client(name, 0).ready()));
  let firstOutcome; let secondOutcome; let secondSettled = false; let secondBlocked = false;
  const complete = () => completer.query('race_complete', `public.nooks_workspace_commit(${quote(member)},${record.revision},${json(record.workspace)})`);
  const revoke = () => revoker.query('race_revoke', `public.nooks_community(${quote(action === 'archive_nook' ? owner : member)},${quote(action)},${json({ nookId: nook })})`);
  const settled = promise => promise.then(value => ({ value }), error => ({ error: error.message }));
  try {
    await gate.query('race_gate_lock', 'pg_advisory_lock(716205)');
    firstOutcome = settled(first === 'community' ? revoke() : complete());
    let reachedGate = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      reachedGate = await gate.query('race_observe', "select exists(select 1 from pg_locks where locktype='advisory' and objid=716205 and not granted)");
      if (reachedGate) break;
      await sleep(10);
    }
    assert.equal(reachedGate, true, `${action}/${first} must reach its deterministic gate`);
    secondOutcome = settled(first === 'community' ? complete() : revoke()).then(result => { secondSettled = true; return result; });
    const secondName = first === 'community' ? 'nooks-workload-completion-save' : 'nooks-workload-completion-revoke';
    for (let attempt = 0; attempt < 100 && !secondSettled; attempt++) {
      secondBlocked = await gate.query('race_observe', `select exists(select 1 from pg_stat_activity where application_name=${quote(secondName)} and wait_event_type='Lock')`);
      if (secondBlocked) break;
      await sleep(10);
    }
    await gate.query('race_gate_unlock', 'pg_advisory_unlock(716205)');
    const outcomes = await Promise.all([firstOutcome, secondOutcome]);
    const errors = outcomes.filter(outcome => outcome.error).map(outcome => outcome.error);
    const observed = JSON.parse(sql(`select jsonb_build_object('membershipLeft',m.left_at is not null,'focusStatus',f.status,'activeClock',f.active_started_at is not null) from public.nooks_members m join public.nooks_shared_focus f using(account_id,nook_id) where m.account_id=${quote(member)} and f.id=${quote(focusId)};`));
    const completion = outcomes[first === 'completion' ? 0 : 1].value;
    const expectedStatus = first === 'community' ? 'cancelled' : 'completed';
    const passed = !errors.length && completion?.committed === true && secondBlocked && observed.membershipLeft && !observed.activeClock && observed.focusStatus === expectedStatus;
    return { action, first, result: passed ? 'passed' : 'failed', secondWaited: secondBlocked, expectedStatus, ...observed, errors };
  } finally {
    if (!gate.closed) try { await gate.query('race_gate_unlock', 'pg_advisory_unlock(716205)'); } catch {}
    await Promise.all([firstOutcome, secondOutcome].filter(Boolean));
    await Promise.all([gate, completer, revoker].map(client => client.close()));
    sql(`drop trigger nooks_test_gate_focus_completion on public.${table}; drop function nooks_test.gate_focus_completion();`);
  }
}

try {
  await writeFile(emptyPasswordFile, '', { mode: 0o600 });
  const version = run('psql', ['--version']);
  run('initdb', ['-D', data, '-U', 'nooks_workload_admin', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  startAttempted = true;
  run('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-k '${temporary.replaceAll("'", "'\\''")}' -h '' -p 5432 -c unix_socket_permissions=0700 -c max_connections=16`, '-w', 'start']);
  assert.equal(sql('show listen_addresses;'), '');
  assert.equal(sql('show transaction_isolation;'), 'read committed');
  sql(await readFile(join(here, 'bootstrap.sql'), 'utf8'));
  const migrations = [];
  for (const name of (await readdir(resolve(here, '../migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    const content = await readFile(resolve(here, '../migrations', name), 'utf8');
    sql(content); migrations.push({ name, sha256: hash(content) });
  }
  // Monitoring permission applies only to the disposable synthetic cluster.
  sql('grant pg_read_all_stats to service_role;');
  const startedAt = new Date().toISOString();
  const phases = [];
  for (const size of limits.materialCounts) phases.push(await phase(size));
  const focusMembershipRace = await membershipRace();
  const completionRaces = [];
  for (const action of ['leave_nook', 'archive_nook']) for (const first of ['community', 'completion']) completionRaces.push(await completionRace(action, first));
  report = { result: focusMembershipRace.result === 'passed' && completionRaces.every(race => race.result === 'passed') ? 'passed' : 'failed', startedAt, postgres: version, limits, isolation: { transport: 'private Unix socket', tcpEnabled: false, hostedServicesContacted: false, existingDatabasesContacted: false, credentialsUsed: false }, migrations, phases, focusMembershipRace, completionRaces, verified: ['timed phases: exact expected revision and save counts', 'timed phases: forced stale CAS conflict retried within five attempts', 'timed phases: no lost autosaves/checkpoints/navigation/focus state', 'timed phases: unchanged other artifacts preserved', 'timed phases: owner RLS isolation after concurrent writes', 'timed phases: completed database-clock focus credit bounded by actual run time', 'timed phases: one latest unclaimed workspace hint per owner', 'timed phases: no SQL/deadlock/serialization/timeout errors'], limitations: ['Short finite local correctness workload on PostgreSQL14 with synthetic Auth/Storage/Realtime stubs; not production capacity evidence.', 'Direct RPC SQL over persistent Unix-socket psql connections; excludes HTTP, PostgREST, JWT verification, deployed server compute, Storage, WAN latency and native UI.', 'Synthetic material content is compressible; two new owners per phase (four total), six clients plus one monitor; time-compressed action bursts, not sustained load or real UI cadence.', 'API quota uses180/60 with one charge per synthetic public operation; checkpoint/navigation are combined in one synthetic write, so this is not an exact public API traffic replay.', 'DB timings cover SQL expression execution. clientMs includes output serialization/transfer/parse, psql and shared Node event-loop waits; input JSON/SQL construction precedes that timer. logicalSaveMs includes construction, mutation and CAS retries. Small-sample p95 values are descriptive only.', 'Focus history and community membership are small; no claim about long-lived large histories, public traffic or hosted timeout budgets.'] };
} catch (error) { failure = error; }
finally {
  await Promise.all([...clients].map(client => client.close()));
  let stopped = true;
  if (startAttempted) try { run('pg_ctl', ['-D', data, '-w', 'stop', '-m', 'fast']); } catch (error) { stopped = false; failure ||= error; }
  if (stopped && temporary.startsWith(join(tmpdir(), 'nooks-workload-'))) await rm(temporary, { recursive: true, force: true });
  else console.error(`Local workload cleanup needs attention: ${temporary}`);
  if (report) report.cleanup = { clusterStopped: stopped, temporaryFilesRemoved: stopped };
}
if (failure) throw failure;
if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (report.result !== 'passed') throw new Error('A focus membership concurrency regression failed; see the local report.');
