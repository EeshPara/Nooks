import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Finite local SQL workload only. NEVER reads a hosted connection string.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
if (baseline) args.splice(args.indexOf('--baseline'),1);
if (args.length && (args.length !== 2 || args[0] !== '--report')) throw new Error('Usage: node supabase/tests/run-community-load.mjs [--baseline] [--report report.json]');
const temporary = await mkdtemp(join(tmpdir(), 'nooks-community-load-'));
const binaries = process.env.NOOKS_TEST_PG_BIN || '/usr/local/bin';
const data = join(temporary, 'data');
const connection = ['-h', temporary, '-p', '5432', '-U', 'nooks_local_load', '-d', 'postgres'];
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', PGPASSFILE: join(temporary, 'empty.pgpass'), PGSERVICEFILE: join(temporary, 'empty.pgpass') };
const nook = '88000000-0000-4000-8000-000000000001';
let started = false;
function run(command, argv, input) {
  const result = spawnSync(join(binaries, command), argv, { cwd: temporary, env, input, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}
const sql = statement => run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], statement);
async function phase(name, body) {
  const script = join(temporary, `${name}.sql`);
  await writeFile(script, `set role service_role;\nset statement_timeout='8s';\nset lock_timeout='3s';\n${body}\n`);
  const output = run('pgbench', [...connection, '-n', '-c', '32', '-j', '4', '-t', '20', '-D', 'iteration=0', '-l', '--log-prefix', name, '-f', script]);
  const durations = [];
  for (const file of (await readdir(temporary)).filter(file => file.startsWith(`${name}.`))) {
    if (file.endsWith('.sql')) continue;
    for (const line of (await readFile(join(temporary, file), 'utf8')).trim().split('\n')) {
      const fields = line.split(/\s+/); if (fields.length > 3) durations.push(Number(fields[2]) / 1000);
    }
  }
  durations.sort((a,b)=>a-b);
  assert.equal(durations.length, 640);
  const percentile = p => Math.round(durations[Math.ceil(durations.length*p)-1]*1000)/1000;
  return { sqlClients: 32, transactions: durations.length, latencyMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: durations.at(-1) }, output };
}
try {
  run('initdb', ['-D', data, '-U', 'nooks_local_load', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-k ${temporary} -h '' -p 5432 -F`, '-w', 'start']); started = true;
  for (const file of [join(here, 'bootstrap.sql'), ...(await readdir(join(root, 'migrations'))).filter(f=>f.endsWith('.sql') && (!baseline || !f.endsWith('_scalable_community_snapshots.sql'))).sort().map(f=>join(root,'migrations',f))]) {
    run('psql', ['-X','-q','-v','ON_ERROR_STOP=1',...connection,'-f',file]);
  }
  sql(`set role service_role;
    insert into public.nooks_accounts(id) select md5(i::text)::uuid from generate_series(1,1000) i;
    insert into public.nooks_profiles(account_id,display_name) select md5(i::text)::uuid,'Synthetic member '||i from generate_series(1,1000) i;
    insert into public.nooks_rooms(id,owner_id,request_id,title,room_id,visibility) values('${nook}',md5('1')::uuid,gen_random_uuid(),'Synthetic load nook','rainy-library','public');
    insert into public.nooks_members(nook_id,account_id,role,last_seen_at) select '${nook}',md5(i::text)::uuid,case when i=1 then 'owner' else 'member' end,clock_timestamp() from generate_series(1,360) i;`);
  const concurrentJoins = await phase('joins', `\\set iteration :iteration + 1\n\\set member 360 + :client_id * 20 + :iteration\nselect public.nooks_community(md5(:member::text)::uuid,'join_nook','{"nookId":"${nook}"}'::jsonb);`);
  assert.equal(sql(`select count(*) from public.nooks_members where nook_id='${nook}' and left_at is null`), '1000');
  sql(`set role service_role;
    insert into public.nooks_shared_focus(id,nook_id,account_id,target_seconds,status,accrued_seconds)
      select 'synthetic-'||s,'${nook}',md5(i::text)::uuid,60,'completed',60 from generate_series(1,1000) i cross join generate_series(1,100) s;
    analyze;
    select nooks_test.assert(${baseline ? '(select count(*) from (select account_id from public.nooks_shared_focus group by account_id having sum(accrued_seconds)=6000) totals)=1000' : '(select count(*) from nooks_private.focus_totals where completed_seconds=6000)=1000'},'all focus totals exact');`);
  const snapshots = await phase('snapshots', `\\set member random(1,1000)\nselect public.nooks_community(md5(:member::text)::uuid,'nook_snapshot','{"nookId":"${nook}","limit":50}'::jsonb);`);
  const heartbeat = await phase('heartbeats', `\\set member random(1,1000)\nselect public.nooks_community(md5(:member::text)::uuid,'heartbeat','{"nookId":"${nook}"}'::jsonb);`);
  const sample = JSON.parse(sql(`set role service_role; select public.nooks_community(md5('1')::uuid,'nook_snapshot','{"nookId":"${nook}"}'::jsonb)`));
  assert.equal(sample.members.length, 50); assert.equal(sample.leaderboard.length, 50); assert.equal(sample.memberCount, 1000);
  assert.ok(sample.leaderboard.every(member=>member.focusMinutes===100));
  const report = { mode: baseline ? 'before scalable snapshot migration' : 'after scalable snapshot migration', measuredAt: new Date().toISOString(), environment: 'Disposable local PostgreSQL, Unix socket, fsync disabled; synthetic data, not production/network/WebSocket capacity evidence', limits: { members: 1000, completedFocusRows: 100000, simultaneousSqlClients: 32, transactionsPerPhase: 640, statementTimeoutSeconds: 8, lockTimeoutSeconds: 3 }, concurrentJoins, snapshots, heartbeat, correctness: { memberCount: sample.memberCount, boundedMembers: sample.members.length, boundedLeaderboard: sample.leaderboard.length, aggregateCreditExact: true }, responseBytes: Buffer.byteLength(JSON.stringify(sample)), productionGates: ['hosted multi-account authorization and actual WebSocket delivery/reconnect/revocation test','hosted 1000 simultaneous browser sessions and sustained workload within existing plan quotas','production database query latency, lock waits and API auth/quota overhead','backup/restore and public account sign-in verification'] };
  if (args.length) await writeFile(resolve(args[1]), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  if (started) run('pg_ctl', ['-D',data,'-w','stop','-m','fast']);
  if (temporary.startsWith(join(tmpdir(),'nooks-community-load-'))) await rm(temporary,{recursive:true,force:true});
}
