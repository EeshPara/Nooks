-- Disposable local cluster only: asserts captured broadcasts, no hosted transport.
begin;
set local statement_timeout='30s';
set local role service_role;
do $$
declare a uuid; b uuid; n uuid; private_n uuid; r jsonb; before_seen timestamptz; ct integer;
 ns text:='local:realtime:'||gen_random_uuid();
begin
 a:=(public.nooks_resolve_identity(ns,repeat('a',64),null)->>'id')::uuid;
 b:=(public.nooks_resolve_identity(ns,repeat('b',64),null)->>'id')::uuid;
 truncate nooks_test.broadcasts;
 delete from nooks_private.realtime_throttle where topic='nooks:directory';
 private_n:=(public.nooks_community(a,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Private secret title','roomId','rainy-library','visibility','private'))#>>'{nook,id}')::uuid;
 perform nooks_test.assert(not exists(select 1 from nooks_test.broadcasts where topic='nooks:directory'),'private creation never hints global directory');
 n:=(public.nooks_community(a,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Public fixture','roomId','rainy-library','visibility','public'))#>>'{nook,id}')::uuid;
 perform public.nooks_community(b,'join_nook',jsonb_build_object('nookId',n));
 perform nooks_test.assert(exists(select 1 from nooks_test.broadcasts where topic='nooks:directory'),'public directory receives hint');
 perform nooks_test.assert(not exists(select 1 from nooks_test.broadcasts where payload<>'{"v":1}'::jsonb or event<>'invalidate' or private is not true),'broadcasts contain exact content-free private envelope');
 select count(*) into ct from nooks_test.broadcasts where topic='nook:'||n;
 for i in 1..100 loop perform nooks_private.invalidate_topic('nook:'||n); end loop;
 perform nooks_test.assert((select count(*) from nooks_test.broadcasts where topic='nook:'||n)=ct,'burst emits at most one hint per throttle window');
 update nooks_private.realtime_throttle set sent_at=clock_timestamp()-interval '5 seconds' where topic='nook:'||n;
 perform public.nooks_community(b,'update_profile','{"displayName":"New private name","avatar":1}');
 perform nooks_test.assert((select count(*) from nooks_test.broadcasts where topic='nook:'||n)=ct+1,'profile update invalidates member room');
 select last_seen_at into before_seen from public.nooks_members where nook_id=n and account_id=b;
 perform public.nooks_community(b,'heartbeat',jsonb_build_object('nookId',n));
 perform nooks_test.assert((select last_seen_at from public.nooks_members where nook_id=n and account_id=b)=before_seen,'rapid heartbeat does not write');
 update public.nooks_members set last_seen_at=clock_timestamp()-interval '100 seconds' where nook_id=n and account_id=b;
 r:=public.nooks_community(b,'heartbeat',jsonb_build_object('nookId',n));
 perform nooks_test.assert((r->>'onlineCount')::integer=2,'returning heartbeat restores presence');
 -- Verified credit is maintained exactly through completion, correction, deletion.
 insert into public.nooks_shared_focus(id,nook_id,account_id,target_seconds,status,accrued_seconds)
 values('first',n,b,600,'completed',125),('second',n,b,600,'completed',55),('paused',n,a,600,'paused',999);
 r:=public.nooks_community(a,'nook_snapshot',jsonb_build_object('nookId',n));
 perform nooks_test.assert(r#>>'{leaderboard,0,id}'=b::text and r#>>'{leaderboard,0,focusMinutes}'='3','sum seconds before flooring and exclude paused focus');
 update public.nooks_shared_focus set accrued_seconds=65 where account_id=b and id='first';
 perform nooks_test.assert((select completed_seconds from nooks_private.focus_totals where nook_id=n and account_id=b)=120,'correction does not double count');
 delete from public.nooks_shared_focus where account_id=b and id='second';
 perform nooks_test.assert((select completed_seconds from nooks_private.focus_totals where nook_id=n and account_id=b)=65,'deletion removes old credit');
 update public.nooks_shared_focus set status='cancelled' where account_id=b and id='first';
 perform nooks_test.assert((select completed_seconds from nooks_private.focus_totals where nook_id=n and account_id=b)=0,'cancel removes completed credit');
 -- A failure in realtime.send is best-effort and never rejects persisted state.
 perform set_config('nooks_test.fail_broadcast','yes',true);
 delete from nooks_private.realtime_throttle where topic='account:'||b;
 perform public.nooks_community(b,'update_profile','{"displayName":"Still saved","avatar":2}');
 perform nooks_test.assert((select display_name from public.nooks_profiles where account_id=b)='Still saved','save survives broadcast outage');
 perform set_config('nooks_test.fail_broadcast','no',true);
 -- Cascaded member data cleanup must not leave negative totals or block deletes.
 insert into public.nooks_shared_focus(id,nook_id,account_id,target_seconds,status,accrued_seconds) values('cascade',n,b,60,'completed',60);
 delete from public.nooks_rooms where id=n;
 perform nooks_test.assert(not exists(select 1 from nooks_private.focus_totals where nook_id=n),'room cascade clears totals safely');
end $$;
reset role;
insert into auth.users(id) values('85000000-0000-4000-8000-000000000001');
set local role service_role;
select public.nooks_resolve_identity('local:realtime-auth',repeat('7',64),'85000000-0000-4000-8000-000000000001')->>'id' as actor \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-4000-8000-000000000001',true);
select nooks_test.assert(nooks_private.can_receive_topic('nooks:directory'),'verified browser account can receive directory');
select nooks_test.assert(nooks_private.can_receive_topic('account:'||:'actor'),'own account topic authorized');
select nooks_test.assert(not nooks_private.can_receive_topic('account:85000000-0000-4000-8000-000000000001'),'Auth UUID is not Nooks account UUID');
select set_config('realtime.topic','nooks:directory',true);
do $$ begin
 begin insert into realtime.messages(extension,topic) values('presence','nooks:directory'); raise exception 'Client broadcast directory presence'; exception when insufficient_privilege then null; end;
 begin insert into realtime.messages(extension,topic) values('broadcast','nooks:directory'); raise exception 'Client forged directory broadcast'; exception when insufficient_privilege then null; end;
 begin perform nooks_private.invalidate_topic('nooks:directory'); raise exception 'Client forged invalidation'; exception when insufficient_privilege then null; end;
 begin perform * from nooks_private.focus_totals; raise exception 'Client read private aggregate'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','',true);
select nooks_test.assert(not nooks_private.can_receive_topic('nooks:directory'),'missing verified identity denied');
rollback;
