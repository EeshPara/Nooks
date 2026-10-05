\set ON_ERROR_STOP on
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
set role service_role;
select public.nooks_resolve_identity('test:auth',repeat('a',64),'10000000-0000-4000-8000-000000000001')->>'id' as alice \gset
select public.nooks_resolve_identity('test:auth',repeat('b',64),'10000000-0000-4000-8000-000000000002')->>'id' as bob \gset
select public.nooks_resolve_identity('test:auth',repeat('c',64),'10000000-0000-4000-8000-000000000003')->>'id' as carol \gset
select nooks_test.assert(public.nooks_workspace_read(:'alice') is null,'fresh account is empty');
select public.nooks_workspace_commit(:'alice',0,'{"version":1,"artifacts":[{"id":"private-note","kind":"note","title":"Alice only"}],"progress":[],"focusSessions":[],"roomProgress":{},"stats":{"xp":0},"reviews":{},"plan":{"tasks":[]}}','[]');
select nooks_test.assert((public.nooks_workspace_commit(:'alice',0,'{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{}}','[]')->>'committed')::boolean=false,'stale revision rejected');
select nooks_test.assert(jsonb_array_length(public.nooks_workspace_read(:'alice')->'workspace'->'artifacts')=1,'stale write preserved note');
select public.nooks_community(:'alice','create_nook','{"requestId":"20000000-0000-4000-8000-000000000001","title":"Private nook","roomId":"rainy-library","visibility":"private"}')->'nook'->>'id' as private_nook \gset
select public.nooks_community(:'alice','create_nook','{"requestId":"20000000-0000-4000-8000-000000000002","title":"Public nook","roomId":"rainy-library","visibility":"public"}')->'nook'->>'id' as public_nook \gset
select nooks_test.assert(jsonb_array_length(public.nooks_community(:'bob','list_nooks','{}')->'nooks')=1,'private nook hidden from nonmember');
select set_config('nooks.test.private',:'private_nook',false),set_config('nooks.test.alice',:'alice',false),set_config('nooks.test.bob',:'bob',false);
do $$ begin
 begin perform public.nooks_community(current_setting('nooks.test.bob')::uuid,'join_nook',jsonb_build_object('nookId',current_setting('nooks.test.private'))); raise exception 'private join allowed'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(current_setting('nooks.test.bob')::uuid,'nook_snapshot',jsonb_build_object('nookId',current_setting('nooks.test.private'))); raise exception 'private snapshot allowed'; exception when insufficient_privilege then null; end;
end $$;
select public.nooks_community(:'alice','create_invite',jsonb_build_object('nookId',:'private_nook','tokenHash',repeat('d',64),'maxUses',1));
select public.nooks_community(:'bob','accept_invite',jsonb_build_object('tokenHash',repeat('d',64)));
select nooks_test.assert((public.nooks_community(:'bob','accept_invite',jsonb_build_object('tokenHash',repeat('d',64)))->>'duplicate')::boolean,'invite retry consumes no second use');
select nooks_test.assert((public.nooks_community(:'bob','nook_snapshot',jsonb_build_object('nookId',:'private_nook'))->>'memberCount')::integer=2,'member can see real two-person roster');
select set_config('nooks.test.carol',:'carol',false);
do $$ begin
 begin perform public.nooks_community(current_setting('nooks.test.carol')::uuid,'accept_invite',jsonb_build_object('tokenHash',repeat('d',64))); raise exception 'exhausted invite accepted'; exception when insufficient_privilege then null; end;
end $$;

-- Bind the SAME existing personal timer, with no scene-based attribution to another nook.
select public.nooks_workspace_commit(:'alice',1,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions',jsonb_build_array(jsonb_build_object('id','focus-one','nookId',:'private_nook','roomId','rainy-library','targetMinutes',1,'startedAt',clock_timestamp()))),'[]');
reset role;
-- A controlled test clock fixture; these records are created only in the disposable cluster.
update public.nooks_shared_focus set active_started_at=clock_timestamp()-interval '75 seconds' where id='focus-one';
set role service_role;
select public.nooks_workspace_commit(:'alice',2,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions',jsonb_build_array(jsonb_build_object('id','focus-one','nookId',:'private_nook','roomId','rainy-library','targetMinutes',1,'completedAt',clock_timestamp()))),'[]');
select public.nooks_workspace_commit(:'alice',3,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions',jsonb_build_array(jsonb_build_object('id','focus-one','nookId',:'private_nook','roomId','rainy-library','targetMinutes',1,'completedAt',clock_timestamp()))),'[]');
select nooks_test.assert((select accrued_seconds=60 from public.nooks_shared_focus where account_id=:'alice' and id='focus-one'),'focus credit capped and retry-safe');
select nooks_test.assert((public.nooks_community(:'bob','nook_snapshot',jsonb_build_object('nookId',:'private_nook'))->'leaderboard'->0->>'focusMinutes')::integer=1,'leaderboard uses bound DB-timed focus');
select nooks_test.assert((public.nooks_community(:'alice','nook_snapshot',jsonb_build_object('nookId',:'public_nook'))->'leaderboard'->0->>'focusMinutes')::integer=0,'same-scene other nook receives no credit');
-- Organization/version metadata remains private and intact; unchanged rows avoid rewrites.
select public.nooks_workspace_commit(:'alice',4,jsonb_set(jsonb_set(public.nooks_workspace_read(:'alice')->'workspace','{artifacts}','[{"id":"private-note","kind":"note","revision":2,"courseId":"course-one","content":"Alice only"}]'),'{organization}','{"schemaVersion":1,"courses":[{"id":"course-one"}],"noteRevisions":[{"id":"revision-one","artifactId":"private-note","revision":1}]}'),'[]');
select xmin::text as artifact_xmin from public.nooks_artifacts where account_id=:'alice' and id='private-note' \gset
select public.nooks_workspace_commit(:'alice',5,public.nooks_workspace_read(:'alice')->'workspace','[]');
select nooks_test.assert((select xmin::text=:'artifact_xmin' from public.nooks_artifacts where account_id=:'alice' and id='private-note'),'unchanged artifact is not rewritten');
select nooks_test.assert(public.nooks_workspace_read(:'alice')->'workspace'->'organization'->'noteRevisions'->0->>'id'='revision-one','organization revisions survive normalized commit');
-- A paused block does not accrue database focus seconds.
select public.nooks_workspace_commit(:'bob',0,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions',jsonb_build_array(jsonb_build_object('id','focus-pause','nookId',:'private_nook','roomId','rainy-library','targetMinutes',2))),'[]');
reset role;
update public.nooks_shared_focus set active_started_at=clock_timestamp()-interval '40 seconds' where account_id=:'bob' and id='focus-pause';
set role service_role;
select public.nooks_workspace_commit(:'bob',1,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions',jsonb_build_array(jsonb_build_object('id','focus-pause','nookId',:'private_nook','roomId','rainy-library','targetMinutes',2,'pausedAt',clock_timestamp()-interval '1 hour'))),'[]');
select nooks_test.assert((select accrued_seconds=40 and active_started_at is null from public.nooks_shared_focus where account_id=:'bob' and id='focus-pause'),'pause stops clock without trusting client timestamp');
select public.nooks_workspace_commit(:'bob',2,public.nooks_workspace_read(:'bob')->'workspace','[]');
select nooks_test.assert((select accrued_seconds=40 from public.nooks_shared_focus where account_id=:'bob' and id='focus-pause'),'repeated paused commit does not accrue');
-- Revocation/cross-account share operations must roll back the entire workspace transaction.
select public.nooks_workspace_commit(:'alice',6,public.nooks_workspace_read(:'alice')->'workspace','[{"kind":"publish","id":"30000000-0000-4000-8000-000000000001","snapshot":{"space":{"name":"Appearance only"}}}]');
do $$ begin
 begin perform public.nooks_workspace_commit(current_setting('nooks.test.bob')::uuid,3,jsonb_build_object('version',1,'artifacts','[]'::jsonb,'progress','[]'::jsonb,'roomProgress','{}'::jsonb,'focusSessions','[]'::jsonb),'[{"kind":"revoke","id":"30000000-0000-4000-8000-000000000001"}]'); raise exception 'other owner revoked share'; exception when insufficient_privilege then null; end;
end $$;
select nooks_test.assert((public.nooks_workspace_read(:'bob')->>'revision')::integer=3,'failed share operation rolls back workspace revision');
select public.nooks_webhook_receive('test','evt-1',repeat('e',64),'membership.updated');
select nooks_test.assert((public.nooks_webhook_receive('test','evt-1',repeat('e',64),'membership.updated')->>'duplicate')::boolean,'webhook dedupe');
do $$ begin
 begin perform public.nooks_webhook_receive('test','evt-1',repeat('f',64),'membership.updated'); raise exception 'reused webhook accepted'; exception when invalid_parameter_value then null; end;
end $$;
select public.nooks_outbox_claim(100,60) as claimed \gset
select nooks_test.assert(jsonb_array_length(:'claimed'::jsonb->'events')>0,'outbox events leased');
select nooks_test.assert((public.nooks_outbox_ack((:'claimed'::jsonb->'events'->0->>'id')::uuid,gen_random_uuid(),true)->>'acknowledged')::boolean=false,'wrong lease cannot acknowledge event');
select nooks_test.assert((public.nooks_outbox_ack((:'claimed'::jsonb->'events'->0->>'id')::uuid,(:'claimed'::jsonb->'events'->0->>'leaseToken')::uuid,true)->>'acknowledged')::boolean,'correct lease acknowledges event');
select nooks_test.assert(jsonb_array_length(public.nooks_outbox_claim(100,60)->'events')=0,'leased events not double-claimed');

-- Storage remains private with owner-prefix read access only.
reset role;
insert into storage.objects(bucket_id,name) values('nooks-private',:'alice'||'/alice-art'),('nooks-private',:'bob'||'/bob-art');
set role service_role;
-- Actual RLS allow/deny checks under non-bypassing client roles.
reset role;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select nooks_test.assert((select count(*) from public.nooks_accounts)=1,'account RLS isolates bob');
select nooks_test.assert((select count(*) from storage.objects)=1,'storage RLS isolates bob artwork');
select nooks_test.assert((select count(*) from storage.objects where name like :'alice'||'/%')=0,'other account artwork denied');
select nooks_test.assert((select count(*) from public.nooks_workspaces where account_id=:'alice')=0,'bob cannot read alice workspace');
select nooks_test.assert((select count(*) from public.nooks_artifacts)=0,'bob cannot read alice artifacts');
select nooks_test.assert((select count(*) from public.nooks_members where nook_id=:'private_nook')=2,'member roster permitted');
select nooks_test.assert(nooks_private.can_receive_topic('nook:'||:'private_nook'),'member realtime allowed');
select nooks_test.assert(not nooks_private.can_receive_topic('account:'||:'alice'),'other account realtime denied');
select set_config('realtime.topic','nook:'||:'private_nook',false);
insert into realtime.messages(extension,topic) values('presence','nook:'||:'private_nook');
do $$ begin
 begin insert into realtime.messages(extension,topic) values('broadcast',current_setting('realtime.topic')); raise exception 'client forged authoritative broadcast'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin
 begin perform public.nooks_workspace_read(current_setting('nooks.test.alice')::uuid); raise exception 'client called service rpc'; exception when insufficient_privilege then null; end;
 begin insert into public.nooks_artifacts(account_id,id,kind,payload,position) values(current_setting('nooks.test.bob')::uuid,'forged','note','{}',1); raise exception 'client wrote data'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
set role authenticated;
select nooks_test.assert((select count(*) from public.nooks_members where nook_id=:'private_nook')=0,'nonmember roster denied');
select nooks_test.assert(not nooks_private.can_receive_topic('nook:'||:'private_nook'),'nonmember realtime denied');
reset role;
set role anon;
do $$ begin
 begin perform count(*) from public.nooks_workspaces; raise exception 'anon read workspace'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(current_setting('nooks.test.alice')::uuid,'list_nooks','{}'); raise exception 'anon called service rpc'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
select nooks_test.assert((public.nooks_request_limit(:'alice','generation',1,3600)->>'allowed')::boolean,'first generation quota accepted');
select nooks_test.assert(not (public.nooks_request_limit(:'alice','generation',1,3600)->>'allowed')::boolean,'generation quota durable exhaustion');
select nooks_test.assert((public.nooks_request_limit(:'bob','generation',1,3600)->>'allowed')::boolean,'quota isolated per account');
reset role;
set role authenticated;
do $$ begin
 begin perform public.nooks_request_limit(current_setting('nooks.test.alice')::uuid,'generation',1000,1); raise exception 'client reset generation quota'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Leaving a private nook revokes roster/topic access and cannot revive shared credit.
set role service_role;
select public.nooks_community(:'bob','leave_nook',jsonb_build_object('nookId',:'private_nook'));
select nooks_test.assert((select status='cancelled' and active_started_at is null from public.nooks_shared_focus where account_id=:'bob' and id='focus-pause'),'leaving cancels shared timer');
select public.nooks_workspace_commit(:'bob',(public.nooks_workspace_read(:'bob')->>'revision')::bigint,
  jsonb_set(public.nooks_workspace_read(:'bob')->'workspace','{focusSessions,0,completedAt}',to_jsonb(clock_timestamp())),'[]');
select nooks_test.assert((select status='cancelled' and accrued_seconds=40 from public.nooks_shared_focus where account_id=:'bob' and id='focus-pause'),'later personal completion cannot revive abandoned community credit');
do $$ begin
 begin perform public.nooks_community(current_setting('nooks.test.bob')::uuid,'nook_snapshot',jsonb_build_object('nookId',current_setting('nooks.test.private'))); raise exception 'departed member read private roster'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select nooks_test.assert(not nooks_private.can_receive_topic('nook:'||:'private_nook'),'departed member cannot authorize a new realtime channel');
select nooks_test.assert((select count(*) from public.nooks_members where nook_id=:'private_nook')=0,'departed member roster RLS denied');
select nooks_test.assert((select count(*) from public.nooks_shared_focus where nook_id=:'private_nook')=0,'departed member shared focus RLS denied');
reset role;
set role service_role;
select public.nooks_community(:'alice','create_invite',jsonb_build_object('nookId',:'private_nook','tokenHash',repeat('1',64)))->'invite'->>'id' as expired_invite \gset
select public.nooks_community(:'alice','create_invite',jsonb_build_object('nookId',:'private_nook','tokenHash',repeat('2',64)))->'invite'->>'id' as revoked_invite \gset
select public.nooks_community(:'alice','revoke_invite',jsonb_build_object('nookId',:'private_nook','inviteId',:'revoked_invite'));
reset role;
update public.nooks_invites set expires_at=clock_timestamp()-interval '1 minute' where id=:'expired_invite';
set role service_role;
do $$ begin
 begin perform public.nooks_community(current_setting('nooks.test.bob')::uuid,'accept_invite',jsonb_build_object('tokenHash',repeat('1',64))); raise exception 'expired invite accepted'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(current_setting('nooks.test.bob')::uuid,'accept_invite',jsonb_build_object('tokenHash',repeat('2',64))); raise exception 'revoked invite accepted'; exception when insufficient_privilege then null; end;
end $$;
select public.nooks_workspace_commit(:'alice',(public.nooks_workspace_read(:'alice')->>'revision')::bigint,
  jsonb_set(public.nooks_workspace_read(:'alice')->'workspace','{focusSessions}',
    (public.nooks_workspace_read(:'alice')->'workspace'->'focusSessions')||jsonb_build_array(jsonb_build_object('id','focus-archive','nookId',:'private_nook','roomId','rainy-library','targetMinutes',2))),'[]');
select public.nooks_community(:'alice','archive_nook',jsonb_build_object('nookId',:'private_nook'));
select nooks_test.assert((select status='cancelled' from public.nooks_shared_focus where account_id=:'alice' and id='focus-archive'),'archive cancels active community focus');
reset role;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
set role authenticated;
select nooks_test.assert(not nooks_private.can_receive_topic('nook:'||:'private_nook'),'archived nook rejects new realtime authorization even for owner');
reset role;
select 'Nooks permission, ownership, invite, DB-time, event and quota tests passed' as result;
