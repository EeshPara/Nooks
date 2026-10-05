begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
-- Preserve the existing signature, SECURITY INVOKER boundary, empty search_path,
-- function owner and service-only ACL. No data rewrite or privilege change.
create or replace function public.nooks_workspace_commit(p_account uuid,p_expected_revision bigint,p_workspace jsonb,p_share_operations jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_revision bigint; v_op jsonb; v_share uuid; v_document jsonb; v_source jsonb;
 v_focus public.nooks_shared_focus%rowtype; v_nook uuid; v_now timestamptz; v_seconds integer; v_status text; v_changed_focus jsonb; v_event uuid;
begin
  if not exists(select 1 from public.nooks_accounts where id=p_account) then raise exception 'Verified account required' using errcode='42501'; end if;
  if jsonb_typeof(p_workspace) is distinct from 'object' or (p_workspace->>'version')::integer is distinct from 1
    or jsonb_typeof(p_workspace->'artifacts') is distinct from 'array' or jsonb_typeof(p_workspace->'progress') is distinct from 'array'
    or jsonb_typeof(p_workspace->'focusSessions') is distinct from 'array' or jsonb_typeof(p_workspace->'roomProgress') is distinct from 'object'
    or jsonb_typeof(p_share_operations) is distinct from 'array' then raise exception 'Invalid workspace' using errcode='22023'; end if;
  if octet_length(p_workspace::text)>16777216 or jsonb_array_length(p_workspace->'artifacts')>1000 or jsonb_array_length(p_workspace->'progress')>10000
    or jsonb_array_length(p_workspace->'focusSessions')>10000 then raise exception 'Workspace storage limit reached' using errcode='54000'; end if;
  insert into public.nooks_workspaces(account_id) values(p_account) on conflict do nothing;
  select revision into v_revision from public.nooks_workspaces where account_id=p_account for update;
  if v_revision<>p_expected_revision then return jsonb_build_object('committed',false,'revision',v_revision); end if;
  -- Keep unchanged rows untouched: only changed/new records are written, missing records removed.
  delete from public.nooks_artifacts a where a.account_id=p_account and not exists(select 1 from jsonb_array_elements(p_workspace->'artifacts') item where item->>'id'=a.id);
  insert into public.nooks_artifacts(account_id,id,kind,payload,position) select p_account,item->>'id',item->>'kind',item,ordinality::integer
    from jsonb_array_elements(p_workspace->'artifacts') with ordinality as items(item,ordinality)
    on conflict(account_id,id) do update set kind=excluded.kind,payload=excluded.payload,position=excluded.position
    where (public.nooks_artifacts.kind,public.nooks_artifacts.payload,public.nooks_artifacts.position) is distinct from (excluded.kind,excluded.payload,excluded.position);
  delete from public.nooks_practice a where a.account_id=p_account and not exists(select 1 from jsonb_array_elements(p_workspace->'progress') item where item->>'sessionId'=a.session_id);
  insert into public.nooks_practice(account_id,session_id,artifact_id,payload,position) select p_account,item->>'sessionId',item->>'artifactId',item,ordinality::integer
    from jsonb_array_elements(p_workspace->'progress') with ordinality as items(item,ordinality)
    on conflict(account_id,session_id) do update set artifact_id=excluded.artifact_id,payload=excluded.payload,position=excluded.position
    where (public.nooks_practice.artifact_id,public.nooks_practice.payload,public.nooks_practice.position) is distinct from (excluded.artifact_id,excluded.payload,excluded.position);
  -- Check only changed timer payloads; note autosaves do not rescan the entire focus ledger.
  select coalesce(jsonb_agg(item),'[]'::jsonb) into v_changed_focus
    from jsonb_array_elements(p_workspace->'focusSessions') item
    left join public.nooks_personal_focus existing on existing.account_id=p_account and existing.id=item->>'id'
    where existing.payload is distinct from item;
  -- Community leave/archive first locks the room, then changes membership and
  -- cancels focus ledgers. Take compatible shared room locks in the same order
  -- BEFORE any ledger row lock or insertion, so revocation cannot miss a new
  -- ledger after its membership check. Unrelated members may focus concurrently.
  -- Include persisted bindings too: a caller changing/removing a nookId must not
  -- evade the existing ledger's guard. Sort multiple rooms to avoid lock cycles.
  perform r.id from public.nooks_rooms r
    where r.id in (
      select (item->>'nookId')::uuid from jsonb_array_elements(v_changed_focus) item where item->>'nookId' is not null
      union
      select f.nook_id from public.nooks_shared_focus f
        join jsonb_array_elements(v_changed_focus) item on item->>'id'=f.id
        where f.account_id=p_account
    ) order by r.id for share of r;
  delete from public.nooks_personal_focus a where a.account_id=p_account and not exists(select 1 from jsonb_array_elements(p_workspace->'focusSessions') item where item->>'id'=a.id);
  insert into public.nooks_personal_focus(account_id,id,payload,position) select p_account,item->>'id',item,ordinality::integer
    from jsonb_array_elements(p_workspace->'focusSessions') with ordinality as items(item,ordinality)
    on conflict(account_id,id) do update set payload=excluded.payload,position=excluded.position
    where (public.nooks_personal_focus.payload,public.nooks_personal_focus.position) is distinct from (excluded.payload,excluded.position);
  delete from public.nooks_room_progress a where a.account_id=p_account and not (p_workspace->'roomProgress' ? a.room_id);
  insert into public.nooks_room_progress(account_id,room_id,payload) select p_account,key,value from jsonb_each(p_workspace->'roomProgress')
    on conflict(account_id,room_id) do update set payload=excluded.payload where public.nooks_room_progress.payload is distinct from excluded.payload;
  for v_op in select value from jsonb_array_elements(p_share_operations) loop
    v_share := (v_op->>'id')::uuid;
    if v_op->>'kind'='publish' then
      if jsonb_typeof(v_op->'snapshot') is distinct from 'object' or not (v_op->'snapshot' ? 'space')
        or ((v_op->'snapshot') - array['id','url','createdAt','space','description','stats','roomDisplay'])<>'{}'::jsonb then
        raise exception 'Invalid appearance snapshot' using errcode='22023'; end if;
      insert into public.nooks_shares(id,account_id,snapshot) values(v_share,p_account,v_op->'snapshot');
    elsif v_op->>'kind'='revoke' then
      delete from public.nooks_shares where id=v_share and account_id=p_account;
      if not found then raise exception 'Share not owned' using errcode='42501'; end if;
    else raise exception 'Invalid share operation' using errcode='22023'; end if;
  end loop;
  -- One authoritative personal timer; this ledger verifies its community credit with DB time.
  for v_source in select value from jsonb_array_elements(v_changed_focus) loop
    select * into v_focus from public.nooks_shared_focus where account_id=p_account and id=v_source->>'id' for update;
    if found then
      if v_source->>'nookId' is distinct from v_focus.nook_id::text then raise exception 'Focus nook binding is immutable' using errcode='42501'; end if;
      if v_focus.status in ('completed','cancelled') then continue; end if;
      if not exists(select 1 from public.nooks_members m join public.nooks_rooms r on r.id=m.nook_id where m.account_id=p_account and m.nook_id=v_focus.nook_id and m.left_at is null and r.archived_at is null) then
        update public.nooks_shared_focus set status='cancelled',active_started_at=null where account_id=p_account and id=v_focus.id;
        insert into public.nooks_outbox(event_type,nook_id,payload) values('focus.changed',v_focus.nook_id,jsonb_build_object('nookId',v_focus.nook_id,'sessionId',v_focus.id));
        continue;
      end if;
    elsif v_source->>'nookId' is not null then
      v_nook:=(v_source->>'nookId')::uuid;
      if v_source ? 'completedAt' or v_source ? 'cancelledAt' then raise exception 'Historic focus cannot earn new nook credit' using errcode='22023'; end if;
      if not exists(select 1 from public.nooks_members m join public.nooks_rooms r on r.id=m.nook_id
        where m.nook_id=v_nook and m.account_id=p_account and m.left_at is null and r.archived_at is null and r.room_id=v_source->>'roomId') then
        raise exception 'Focus nook membership or scene is invalid' using errcode='42501'; end if;
      insert into public.nooks_shared_focus(id,nook_id,account_id,target_seconds,active_started_at,status)
        values(v_source->>'id',v_nook,p_account,(v_source->>'targetMinutes')::integer*60,clock_timestamp(),'active') returning * into v_focus;
      insert into public.nooks_outbox(event_type,nook_id,payload) values('focus.changed',v_nook,jsonb_build_object('nookId',v_nook,'sessionId',v_focus.id));
    else continue; end if;
    if (v_source->>'targetMinutes')::integer*60 is distinct from v_focus.target_seconds then raise exception 'Focus target is immutable' using errcode='42501'; end if;
    v_now:=clock_timestamp();
    v_status:=case when v_source ? 'cancelledAt' then 'cancelled' when v_source ? 'completedAt' then 'completed' when v_source ? 'pausedAt' then 'paused' else 'active' end;
    v_seconds:=least(v_focus.target_seconds,v_focus.accrued_seconds+case when v_focus.active_started_at is null then 0 else greatest(0,floor(extract(epoch from v_now-v_focus.active_started_at)))::integer end);
    if v_status in ('completed','paused','cancelled') then
      update public.nooks_shared_focus set status=v_status,accrued_seconds=case when v_status='cancelled' then accrued_seconds else v_seconds end,
        active_started_at=null,completed_at=case when v_status='completed' then v_now else null end where account_id=p_account and id=v_focus.id;
    elsif v_focus.status='paused' then
      update public.nooks_shared_focus set status='active',active_started_at=v_now where account_id=p_account and id=v_focus.id;
    end if;
    if v_status<>v_focus.status then insert into public.nooks_outbox(event_type,nook_id,payload) values('focus.changed',v_focus.nook_id,jsonb_build_object('nookId',v_focus.nook_id,'sessionId',v_focus.id)); end if;
  end loop;
  v_document := p_workspace - array['artifacts','progress','focusSessions','roomProgress'];
  update public.nooks_workspaces set revision=revision+1,document=v_document,updated_at=clock_timestamp() where account_id=p_account;
  -- A never-claimed workspace event is an invalidation hint: only its latest revision matters.
  -- Do not rewrite claimed/retried events: consumers may already hold their id and payload.
  select id into v_event from public.nooks_outbox where event_type='workspace.changed' and account_id=p_account
    and delivered_at is null and lease_token is null and attempts=0 order by created_at desc,id desc limit 1 for update skip locked;
  if v_event is null then
    insert into public.nooks_outbox(event_type,account_id,payload) values('workspace.changed',p_account,jsonb_build_object('revision',v_revision+1));
  else
    update public.nooks_outbox set payload=jsonb_build_object('revision',v_revision+1),available_at=clock_timestamp() where id=v_event;
  end if;
  return jsonb_build_object('committed',true,'revision',v_revision+1);
end $$;
commit;
