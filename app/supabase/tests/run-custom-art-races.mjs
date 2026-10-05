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
if (args.length && (args.length !== 2 || args[0] !== '--report')) throw new Error('Usage: node supabase/tests/run-custom-art-races.mjs [--report file.json]');
const reportPath = args.length ? resolve(args[1]) : null;
const binaries = process.env.NOOKS_TEST_PG_BIN || '/usr/local/bin';
const temporary = await mkdtemp(join(tmpdir(), 'nooks-scene-races-'));
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
  async ready() { await this.send(`\\set VERBOSITY sqlstate\nset application_name=${quote(`nooks-scene-${this.name}`)}; set statement_timeout='8s'; set lock_timeout='5s'; set idle_in_transaction_session_timeout='8s'; set role service_role;\n\\echo ready`); return this; }
  query(expression) { return this.send(`select (${expression})::jsonb;`); }
  transaction(command) { return this.send(`${command};\n\\echo ready`); }
  async close() {
    if (!this.closed) { if (this.pending) this.child.kill('SIGTERM'); else this.child.stdin.end('\\q\n'); }
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 1500); await this.exit; clearTimeout(timer); clients.delete(this);
  }
}
async function waitBlocked(name) {
  for (let n = 0; n < 100; n++) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name=${quote(`nooks-scene-${name}`)} and wait_event_type='Lock');`) === 't') return true;
    await sleep(10);
  }
  return false;
}
function canonical(value) {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value && typeof value==='object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
async function race(kind, first) {
 const label=`${kind}-${first}`, namespace=`local:scene-race:${label}:${randomUUID()}`;
 const actor=JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('a'))},null);`)).id;
 const other=JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('b'))},null);`)).id;
 const fixture=JSON.parse(sql(`set role service_role; select nooks_test.scene_fixture(${quote(actor)},'public');`));
 assert.equal(hash(canonical(fixture.manifest)),fixture.hash,'SQL canonical digest agrees with actual server JS algorithm, including Unicode');
 let nook;
 if(kind==='archive') {
   nook=JSON.parse(sql(`set role service_role; select public.nooks_nook_publish_artwork(${quote(actor)},${quote(fixture.intentId)},${quote(fixture.hash)});`)).nook;
   sql(`set role service_role; select public.nooks_workspace_commit(${quote(actor)},1,jsonb_set(public.nooks_workspace_read(${quote(actor)})->'workspace','{nookCreator,drafts}','[]'));`);
 }
 // Expired pin and old creation time make accidental reference loss visible.
 // Real last-reference time must still be reset by archive.
 sql(`set role service_role; update public.nooks_artwork_assets set pin_until=clock_timestamp()-interval '1 hour',created_at=clock_timestamp()-interval '40 days' where account_id=${quote(actor)};`);
 const [operation,cleanup]=await Promise.all([new Client(`${label}-operation`).ready(),new Client(`${label}-cleanup`).ready()]);
 const operationCall=()=>operation.query(kind==='publish' ? `public.nooks_nook_publish_artwork(${quote(actor)},${quote(fixture.intentId)},${quote(fixture.hash)})` : `public.nooks_community(${quote(actor)},'archive_nook',${json({nookId:nook.id})})`);
 const cleanupCall=()=>cleanup.query(`public.nooks_artwork_cleanup_claim(${quote(actor)},false)`);
 const leader=first==='operation'?operation:cleanup, follower=first==='operation'?cleanup:operation;
 let pending;
 try {
   await leader.transaction('begin');
   const firstResult=await(first==='operation'?operationCall():cleanupCall());
   if(first==='cleanup') assert.deepEqual(firstResult.candidates,[]);
   pending=(first==='operation'?cleanupCall():operationCall()).then(value=>({value}),error=>({error:error.message}));
   assert.equal(await waitBlocked(follower.name),true,'follower must actually block on common artwork owner guard');
   const independent=JSON.parse(sql(`set role service_role; select public.nooks_artwork_reserve(${quote(other)},${quote(hash('other'))},'image/png',${quote(randomUUID())});`));
   assert.equal(independent.state,'reserved');
   await leader.transaction('commit');
   const result=await pending; assert.equal(result.error,undefined);
   if(first==='operation') assert.deepEqual(result.value.candidates,[],'newly referenced or newly unreferenced art must not be collected');
   const stored=JSON.parse(sql(`select jsonb_build_object('state',a.state,'references',(select count(*) from nooks_private.artwork_persisted_refs(${quote(actor)}) r where r.path=a.path and r.valid),'retentionFresh',a.unreferenced_since>clock_timestamp()-interval '1 minute','scenes',(select count(*) from public.nooks_room_scenes where account_id=${quote(actor)})) from public.nooks_artwork_assets a where account_id=${quote(actor)};`));
   assert.equal(stored.state,'ready'); assert.equal(stored.scenes,1);
   assert.equal(stored.references,kind==='publish'?2:0);
   assert.equal(stored.retentionFresh,kind==='archive'?true:null);
   return {kind,first,result:'passed',secondBlocked:true,otherOwnerProgressed:true,...stored};
 } finally {
   if(!leader.closed) try {await leader.transaction('rollback');}catch{}
   if(pending) await pending;
   await Promise.all([operation.close(),cleanup.close()]);
 }
}
async function membershipRace(first) {
 const label=`private-read-${first}`,namespace=`local:scene-race:${label}:${randomUUID()}`;
 const actor=JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('a'))},null);`)).id;
 const viewer=JSON.parse(sql(`set role service_role; select public.nooks_resolve_identity(${quote(namespace)},${quote(hash('b'))},null);`)).id;
 const f=JSON.parse(sql(`set role service_role; select nooks_test.scene_fixture(${quote(actor)},'private');`));
 const nook=JSON.parse(sql(`set role service_role; select public.nooks_nook_publish_artwork(${quote(actor)},${quote(f.intentId)},${quote(f.hash)});`)).nook;
 const tokenHash=hash(randomUUID());
 sql(`set role service_role; select public.nooks_community(${quote(actor)},'create_invite',${json({nookId:nook.id,tokenHash})}); select public.nooks_community(${quote(viewer)},'accept_invite',${json({tokenHash})});`);
 const [read,leave]=await Promise.all([new Client(`${label}-read`).ready(),new Client(`${label}-leave`).ready()]);
 const readCall=()=>read.query(`public.nooks_nook_scene_read(${quote(viewer)},${quote(nook.id)})`);
 const leaveCall=()=>leave.query(`public.nooks_community(${quote(viewer)},'leave_nook',${json({nookId:nook.id})})`);
 const leader=first==='read'?read:leave,follower=first==='read'?leave:read;
 let pending;
 try {
   await leader.transaction('begin'); await(first==='read'?readCall():leaveCall());
   pending=(first==='read'?leaveCall():readCall()).then(value=>({value}),error=>({error:error.message}));
   assert.equal(await waitBlocked(follower.name),true,'authorization/removal must actually serialize on room');
   await leader.transaction('commit'); const result=await pending;
   if(first==='read') {assert.equal(result.error,undefined); assert.equal(result.value.joined,false);}
   else assert.match(result.error??'',/42501/,'read after completed removal must deny');
   const future=spawnSync(join(binaries,'psql'),['-X','-qAt','-v','ON_ERROR_STOP=1',...connection],{env,encoding:'utf8',input:`set role service_role; select public.nooks_nook_scene_read(${quote(viewer)},${quote(nook.id)});`});
   assert.notEqual(future.status,0); assert.match(future.stderr,/Nook unavailable/);
   return {kind:'membership-read',first,result:'passed',secondBlocked:true,futureReadsDenied:true};
 } finally {
   if(!leader.closed) try {await leader.transaction('rollback');}catch{}
   if(pending)await pending;
   await Promise.all([read.close(),leave.close()]);
 }
}
try {
 await writeFile(emptyPasswordFile,'',{mode:0o600});
 run('initdb',['-D',data,'-U','nooks_artwork_test','--auth=trust','--no-locale','-E','UTF8']); started=true;
 run('pg_ctl',['-D',data,'-l',join(temporary,'postgres.log'),'-o',`-k '${temporary.replaceAll("'","'\\''")}' -h '' -p 5432 -c unix_socket_permissions=0700 -c max_connections=12`,'-w','start']);
 assert.equal(sql('show listen_addresses;'),'');
 sql(await readFile(join(here,'bootstrap.sql'),'utf8'));
 const migrations=[];
 for(const name of(await readdir(resolve(here,'../migrations'))).filter(name=>name.endsWith('.sql')).sort()) {
   const source=await readFile(resolve(here,'../migrations',name),'utf8'); sql(source); migrations.push({name,sha256:hash(source)});
 }
 const checks=await readFile(join(here,'custom-art-publication.sql'),'utf8');
 assert.match(sql(checks),/Custom artwork publication authorization/);
 sql(checks.slice(checks.indexOf('create function nooks_test.scene_fixture'),checks.indexOf('set local role service_role;')));
 const outcomes=[];
 for(const kind of['publish','archive'])for(const first of['operation','cleanup'])outcomes.push(await race(kind,first));
 for(const first of['read','leave'])outcomes.push(await membershipRace(first));
 report={result:'passed',completedAt:new Date().toISOString(),postgres:run('psql',['--version']),migrations,
   isolation:{transport:'private Unix socket',tcpEnabled:false,existingDatabasesContacted:false,hostedServicesContacted:false,credentialsUsed:false,realStorageObjects:0},
   limits:{forcedRaces:6,clientsPerRace:2,maximumSqlSeconds:8,lockTimeoutSeconds:5,perClientDeadlineSeconds:10},outcomes,
   additionalChecks:['SQL and server JS canonical digest agree with Unicode','service-only RPC and table ACLs','RLS enabled','public and accepted-private-member read authorization','unaccepted/expired invitation and former-member denial','stale review and foreign/fenced-generation denial','matching string revisions rejected despite identical digest-bound values','idempotent publication after draft removal','immutable published appearance','metadata-only directory','archive starts fresh retention and cannot revive','existing curated publication preserved'],
   limitations:['Local PostgreSQL14 with platform schema stubs; not hosted Storage HTTP, PostgREST, JWT or production capacity.','No feature enablement, hosted migration, actual image deletion or UI publication tested by this packet.']};
} catch(error){failure=error;}
finally {
 await Promise.all([...clients].map(client=>client.close()));
 let stopped=true;
 if(started)try{run('pg_ctl',['-D',data,'-w','stop','-m','fast']);}catch(error){stopped=false;failure||=error;}
 if(stopped)await rm(temporary,{recursive:true,force:true});
 if(report)report.cleanup={localClusterStopped:stopped,temporaryDirectoryRemoved:stopped};
}
if(failure)throw failure;
if(reportPath)await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
