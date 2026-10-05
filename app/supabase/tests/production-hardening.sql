-- Synthetic fixtures only; safe to run in one hosted execution. Always rolls back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local role service_role;
do $$
declare
 actor uuid; nook uuid; event_id uuid; token uuid := gen_random_uuid(); revision integer := 0;
 result jsonb; before_focus jsonb; item jsonb;
 workspace jsonb := '{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{}}';
 namespace text := 'sites:nooks-hardening:'||gen_random_uuid()::text;
begin
 actor := (public.nooks_resolve_identity(namespace,repeat('f',64),null)->>'id')::uuid;
 for n in 1..20 loop
   result := public.nooks_workspace_commit(actor,revision,workspace);
   if (result->>'committed')::boolean is distinct from true then raise exception 'Commit failed'; end if;
   revision := revision+1;
 end loop;
 if (select count(*) from public.nooks_outbox where account_id=actor and event_type='workspace.changed')<>1 then raise exception 'Workspace hints did not coalesce'; end if;
 select id into event_id from public.nooks_outbox where account_id=actor;
 if (select payload->>'revision' from public.nooks_outbox where id=event_id)<>'20' then raise exception 'Latest revision missing'; end if;
 -- Model a claimed event without consuming any other account's pending events.
 update public.nooks_outbox set attempts=1,lease_token=token,lease_until=clock_timestamp()+interval '60 seconds' where id=event_id;
 perform public.nooks_workspace_commit(actor,revision,workspace); revision:=revision+1;
 if (select payload->>'revision' from public.nooks_outbox where id=event_id)<>'20' then raise exception 'Claimed payload changed'; end if;
 if (public.nooks_outbox_ack(event_id,token,false)->>'acknowledged')::boolean is distinct from true then raise exception 'Lease acknowledgement failed'; end if;
 perform public.nooks_workspace_commit(actor,revision,workspace); revision:=revision+1;
 if (select count(*) from public.nooks_outbox where account_id=actor)<>2 then raise exception 'Pending latest hint not bounded'; end if;
 if (select payload->>'revision' from public.nooks_outbox where id=event_id)<>'20' then raise exception 'Retry payload changed'; end if;
 begin
   perform public.nooks_community(actor,'update_profile',jsonb_build_object('displayName',repeat('x',29),'avatar',0));
   raise exception 'Oversize profile accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.nooks_community(actor,'update_profile',jsonb_build_object('displayName','Test','avatar',8));
   raise exception 'Unknown avatar accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.nooks_community(actor,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title',repeat('x',55),'roomId','rainy-library','visibility','private'));
   raise exception 'Oversize nook accepted';
 exception when invalid_parameter_value then null; end;
 nook := (public.nooks_community(actor,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Hardening test','roomId','rainy-library','visibility','private'))#>>'{nook,id}')::uuid;
 item := jsonb_build_object('id','hardening-focus','nookId',nook,'roomId','rainy-library','targetMinutes',25);
 workspace := jsonb_set(workspace,'{focusSessions}',jsonb_build_array(item));
 perform public.nooks_workspace_commit(actor,revision,workspace); revision:=revision+1;
 select to_jsonb(f) into before_focus from public.nooks_shared_focus f where account_id=actor;
 -- Note-only saves do not reprocess the entire history or alter active ledger time.
 workspace := jsonb_set(workspace,'{artifacts}','[{"id":"note","kind":"note","content":"Synthetic"}]');
 perform public.nooks_workspace_commit(actor,revision,workspace); revision:=revision+1;
 if (select to_jsonb(f) from public.nooks_shared_focus f where account_id=actor) is distinct from before_focus then raise exception 'Unchanged focus ledger was rewritten'; end if;
 workspace := jsonb_set(workspace,'{focusSessions}',jsonb_build_array(item||jsonb_build_object('pausedAt',clock_timestamp())));
 perform public.nooks_workspace_commit(actor,revision,workspace); revision:=revision+1;
 if not exists(select 1 from public.nooks_shared_focus where account_id=actor and status='paused' and active_started_at is null) then raise exception 'Changed focus did not pause'; end if;
 begin
   perform public.nooks_workspace_commit(actor,revision,jsonb_set(workspace,'{focusSessions,0,nookId}',to_jsonb(gen_random_uuid()::text)));
   raise exception 'Focus binding change accepted';
 exception when insufficient_privilege then null; end;
 if (public.nooks_workspace_read(actor)->>'revision')::integer<>revision then raise exception 'Failed commit changed revision'; end if;
end $$;
reset role;
select 'Production hardening tests passed' as result;
rollback;
