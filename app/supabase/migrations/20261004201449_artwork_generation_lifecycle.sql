-- Immutable artwork generations, upload pins and operator-only cleanup fences.
-- No Storage bytes or metadata are deleted by this migration or its functions.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create table public.nooks_artwork_assets (
 account_id uuid not null references public.nooks_accounts(id),
 request_id uuid not null,
 generation uuid not null default gen_random_uuid(),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 path text not null unique,
 state text not null default 'reserved' check(state in ('reserved','ready','deleting','deleted')),
 pin_token uuid not null default gen_random_uuid(),
 pin_until timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 unreferenced_since timestamptz,
 claim_token uuid,
 lease_until timestamptz,
 available_at timestamptz not null default clock_timestamp(),
 cleanup_attempts integer not null default 0 check(cleanup_attempts>=0),
 last_ack_success boolean,
 deleted_at timestamptz,
 primary key(account_id,request_id),
 unique(generation),
 check(path=account_id::text||'/'||content_hash||'/'||generation::text)
);
alter table public.nooks_artwork_assets enable row level security;
revoke all on public.nooks_artwork_assets from public,anon,authenticated;
grant select,insert,update on public.nooks_artwork_assets to service_role;
create index nooks_artwork_cleanup_owner on public.nooks_artwork_assets(account_id,available_at,path);
create index nooks_artwork_reservations_recent on public.nooks_artwork_assets(account_id,created_at);
create index nooks_artwork_retained_owner on public.nooks_artwork_assets(account_id) where state<>'deleted';

create function nooks_private.artwork_lock(p_owner uuid) returns void language sql volatile security invoker set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('nooks:artwork:'||p_owner::text,0))
$$;

-- A malformed known container produces a failing row, never an empty/safe inventory.
create function nooks_private.artwork_document_refs(p_owner uuid,p_document jsonb)
returns table(path text,mime text,valid boolean,canonical boolean) language sql stable security invoker set search_path='' as $$
 with containers as (
   select p_document->'space' as appearance where p_document ? 'space'
   union all select d.value->'space' from jsonb_array_elements(case when jsonb_typeof(p_document#>'{nookCreator,drafts}')='array' then p_document#>'{nookCreator,drafts}' else '[]'::jsonb end) d
 ), invalid_containers as (
   select 1 from containers where jsonb_typeof(appearance) is distinct from 'object'
   union all select 1 where jsonb_typeof(p_document) is distinct from 'object'
   union all select 1 where p_document ? 'nookCreator' and (jsonb_typeof(p_document->'nookCreator') is distinct from 'object' or jsonb_typeof(p_document#>'{nookCreator,drafts}') is distinct from 'array')
 ), raw as (
   select appearance->'_storedBackground' as ref from containers where jsonb_typeof(appearance)='object' and appearance ? '_storedBackground'
 ), parsed as (
   select ref,ref->>'path' as path,ref->>'mime' as mime,
     coalesce((ref->>'path') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[a-f0-9]{64}(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$',false) as canonical from raw
 ) select path,mime,case when jsonb_typeof(ref) is distinct from 'object' then false else
     coalesce(canonical and left(path,36)=p_owner::text and jsonb_typeof(ref->'path')='string' and jsonb_typeof(ref->'mime')='string'
       and mime in ('image/png','image/jpeg','image/webp') and (ref-array['path','mime'])='{}'::jsonb,false) end,canonical from parsed
 union all select null::text,null::text,false,false from invalid_containers
$$;

create function nooks_private.artwork_persisted_refs(p_account uuid default null)
returns table(account_id uuid,path text,mime text,valid boolean,canonical boolean) language sql stable security invoker set search_path='' as $$
 select w.account_id,r.* from public.nooks_workspaces w cross join lateral nooks_private.artwork_document_refs(w.account_id,w.document) r where p_account is null or w.account_id=p_account
 union all
 select s.account_id,r.* from public.nooks_shares s cross join lateral nooks_private.artwork_document_refs(s.account_id,
   -- A malformed share without its required appearance must quarantine its owner.
   case when s.snapshot ? 'space' then s.snapshot else jsonb_build_object('space',null) end) r where p_account is null or s.account_id=p_account
$$;

create function nooks_private.artwork_validate(p_owner uuid,p_document jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r record;
begin
 for r in select * from nooks_private.artwork_document_refs(p_owner,p_document) loop
   if not r.valid then raise exception 'Invalid owned artwork reference' using errcode='22023'; end if;
   -- Legacy two-component paths are preserved but never enter automated collection.
   if array_length(string_to_array(r.path,'/'),1)=3 and not exists(select 1 from public.nooks_artwork_assets a
     where a.account_id=p_owner and a.path=r.path and a.mime=r.mime and a.state='ready') then
     raise exception 'Artwork generation is unavailable; reserve a new upload' using errcode='40001';
   end if;
 end loop;
end $$;

create function public.nooks_artwork_reserve(p_account uuid,p_hash text,p_mime text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.nooks_artwork_assets%rowtype; v_generation uuid;
begin
 if not exists(select 1 from public.nooks_accounts where id=p_account) then raise exception 'Verified account required' using errcode='42501'; end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp') or p_request_id is null then raise exception 'Invalid artwork reservation' using errcode='22023'; end if;
 perform nooks_private.artwork_lock(p_account);
 select * into a from public.nooks_artwork_assets where account_id=p_account and request_id=p_request_id for update;
 if found then
   if a.content_hash<>p_hash or a.mime<>p_mime then raise exception 'Reservation ID reused with different artwork' using errcode='22023'; end if;
   if a.state not in ('reserved','ready') or a.pin_until<=clock_timestamp() then raise exception 'Artwork reservation is unavailable' using errcode='40001'; end if;
 else
   -- Initial bounded product policy. Retries above do not allocate or consume quota.
   if (select count(*) from public.nooks_artwork_assets where account_id=p_account and created_at>clock_timestamp()-interval '1 day')>=100
     or (select count(*) from public.nooks_artwork_assets where account_id=p_account and state<>'deleted')>=128 then
     raise exception 'Artwork upload quota reached; wait for daily reset or retention cleanup' using errcode='54000';
   end if;
   v_generation:=gen_random_uuid();
   insert into public.nooks_artwork_assets(account_id,request_id,generation,content_hash,mime,path,pin_until,unreferenced_since)
     values(p_account,p_request_id,v_generation,p_hash,p_mime,p_account::text||'/'||p_hash||'/'||v_generation::text,clock_timestamp()+interval '15 minutes',clock_timestamp()) returning * into a;
 end if;
 return jsonb_build_object('path',a.path,'mime',a.mime,'generation',a.generation,'pinToken',a.pin_token,'pinUntil',a.pin_until,'state',a.state);
end $$;

create function public.nooks_artwork_complete(p_account uuid,p_path text,p_pin_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.nooks_artwork_assets%rowtype;
begin
 perform nooks_private.artwork_lock(p_account);
 select * into a from public.nooks_artwork_assets where account_id=p_account and path=p_path for update;
 if not found or p_pin_token is null or a.pin_token<>p_pin_token or a.pin_until<=clock_timestamp() or a.state not in ('reserved','ready') then
   return jsonb_build_object('accepted',false,'reason','unavailable');
 end if;
 if a.state='reserved' then
   update public.nooks_artwork_assets set state='ready',unreferenced_since=clock_timestamp() where account_id=p_account and path=p_path;
 end if;
 return jsonb_build_object('accepted',true,'state','ready');
end $$;

create function public.nooks_artwork_cleanup_claim(p_account uuid,p_dry_run boolean default true,p_limit integer default 25,p_min_age_seconds integer default 2592000,p_lease_seconds integer default 60)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_refs text[]; v_quarantined boolean; a public.nooks_artwork_assets%rowtype;
 v_items jsonb:='[]'; v_count integer:=0; v_more boolean:=false; v_now timestamptz; v_token uuid;
begin
 if not exists(select 1 from public.nooks_accounts where id=p_account) then raise exception 'Verified account required' using errcode='42501'; end if;
 if p_dry_run is null or p_limit is null or p_limit not between 1 and 50 or p_min_age_seconds is null or p_min_age_seconds not between 86400 and 31536000
   or p_lease_seconds is null or p_lease_seconds not between 15 and 300 then raise exception 'Invalid artwork cleanup bounds' using errcode='22023'; end if;
 perform nooks_private.artwork_lock(p_account);
 v_now:=clock_timestamp();
 select coalesce(array_agg(distinct path) filter(where valid and account_id=p_account),'{}'::text[]),
   coalesce(bool_or(not valid and (account_id=p_account or (canonical and left(path,36)=p_account::text))),false)
   into v_refs,v_quarantined from nooks_private.artwork_persisted_refs();
 if v_quarantined then return jsonb_build_object('bucket','nooks-private','dryRun',p_dry_run,'quarantined',true,'candidates','[]'::jsonb,'hasMore',false); end if;
 -- One owner guard serializes all reference writers, reservations and collectors.
 -- Generation addresses and tombstones are permanent; DELETE always happens outside this transaction.
 for a in select * from public.nooks_artwork_assets where account_id=p_account and path<>all(v_refs)
   and (lease_until is null or lease_until<=v_now) and available_at<=v_now
   and ((state in ('reserved','ready') and pin_until<=v_now and unreferenced_since<=v_now-make_interval(secs=>p_min_age_seconds)) or state in ('deleting','deleted'))
   order by available_at,path limit p_limit+1 for update loop
   if v_count=p_limit then v_more:=true; exit; end if;
   v_count:=v_count+1;
   if p_dry_run then
     v_items:=v_items||jsonb_build_array(jsonb_build_object('path',a.path,'generation',a.generation,'state',a.state));
   else
     v_token:=gen_random_uuid();
     update public.nooks_artwork_assets set state=case when state='deleted' then 'deleted' else 'deleting' end,
       claim_token=v_token,lease_until=v_now+make_interval(secs=>p_lease_seconds),last_ack_success=null,cleanup_attempts=least(cleanup_attempts,2147483646)+1
       where account_id=p_account and path=a.path returning * into a;
     v_items:=v_items||jsonb_build_array(jsonb_build_object('path',a.path,'generation',a.generation,'state',a.state,'claimToken',a.claim_token,'leaseUntil',a.lease_until));
   end if;
 end loop;
 return jsonb_build_object('bucket','nooks-private','dryRun',p_dry_run,'quarantined',false,'candidates',v_items,'hasMore',v_more);
end $$;

create function public.nooks_artwork_cleanup_ack(p_account uuid,p_path text,p_claim_token uuid,p_success boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.nooks_artwork_assets%rowtype;
begin
 perform nooks_private.artwork_lock(p_account);
 select * into a from public.nooks_artwork_assets where account_id=p_account and path=p_path for update;
 if not found or p_success is null or p_claim_token is null or a.claim_token is distinct from p_claim_token or a.state not in ('deleting','deleted') then return jsonb_build_object('acknowledged',false); end if;
 -- Lost acknowledgment responses can be retried without rescheduling a completed attempt.
 if a.lease_until is null and a.last_ack_success is not distinct from p_success then return jsonb_build_object('acknowledged',true,'state',a.state,'duplicate',true); end if;
 if a.lease_until is null or a.lease_until<=clock_timestamp() then return jsonb_build_object('acknowledged',false,'state',a.state); end if;
 if p_success and exists(select 1 from storage.objects where bucket_id='nooks-private' and name=p_path) then return jsonb_build_object('acknowledged',false,'state',a.state); end if;
 update public.nooks_artwork_assets set state=case when p_success then 'deleted' else state end,
   deleted_at=case when p_success then coalesce(deleted_at,clock_timestamp()) else deleted_at end,
   lease_until=null,last_ack_success=p_success,
   available_at=clock_timestamp()+case when p_success then interval '1 day' else make_interval(secs=>least(3600,power(2,least(cleanup_attempts,12))::integer)) end
   where account_id=p_account and path=p_path returning * into a;
 return jsonb_build_object('acknowledged',true,'state',a.state);
end $$;

revoke all on function nooks_private.artwork_lock(uuid),nooks_private.artwork_document_refs(uuid,jsonb),nooks_private.artwork_persisted_refs(uuid),nooks_private.artwork_validate(uuid,jsonb) from public,anon,authenticated;
grant execute on function nooks_private.artwork_lock(uuid),nooks_private.artwork_document_refs(uuid,jsonb),nooks_private.artwork_persisted_refs(uuid),nooks_private.artwork_validate(uuid,jsonb) to service_role;
revoke all on function public.nooks_artwork_reserve(uuid,text,text,uuid),public.nooks_artwork_complete(uuid,text,uuid),public.nooks_artwork_cleanup_claim(uuid,boolean,integer,integer,integer),public.nooks_artwork_cleanup_ack(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nooks_artwork_reserve(uuid,text,text,uuid),public.nooks_artwork_complete(uuid,text,uuid),public.nooks_artwork_cleanup_claim(uuid,boolean,integer,integer,integer),public.nooks_artwork_cleanup_ack(uuid,text,uuid,boolean) to service_role;

-- Replace the original function in place; no callable pre-fence implementation remains.
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
  perform nooks_private.artwork_lock(p_account);
  insert into public.nooks_workspaces(account_id) values(p_account) on conflict do nothing;
  select revision into v_revision from public.nooks_workspaces where account_id=p_account for update;
  if v_revision<>p_expected_revision then return jsonb_build_object('committed',false,'revision',v_revision); end if;
  perform nooks_private.artwork_validate(p_account,p_workspace);
  for v_op in select value from jsonb_array_elements(p_share_operations) loop
    if v_op->>'kind'='publish' then perform nooks_private.artwork_validate(p_account,v_op->'snapshot'); end if;
  end loop;
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
  -- Shares and workspace now reflect this commit. Keep the first unreferenced
  -- instant, resetting it only after the last persisted reference disappears.
  if exists(select 1 from public.nooks_artwork_assets where account_id=p_account and state in ('reserved','ready')) then
  with refs as materialized(select distinct path from nooks_private.artwork_persisted_refs(p_account) where valid), desired as (
    select a.path,case when exists(select 1 from refs r where r.path=a.path) then null::timestamptz
      else coalesce(a.unreferenced_since,clock_timestamp()) end as unreferenced_since
    from public.nooks_artwork_assets a where a.account_id=p_account and a.state in ('reserved','ready')
  ) update public.nooks_artwork_assets a set unreferenced_since=d.unreferenced_since from desired d
    where a.path=d.path and a.unreferenced_since is distinct from d.unreferenced_since;
  end if;
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

-- The non-destructive inventory recognizes both legacy and generation paths.
create or replace function public.nooks_artwork_inventory(p_limit integer default 50,p_after text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 v_result jsonb;
 v_path_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$';
begin
 if p_limit is null or p_limit not between 1 and 50 or (p_after is not null and p_after !~ v_path_pattern) then
   raise exception 'Invalid inventory page' using errcode='22023';
 end if;
 with
 -- Enumerate known appearance locations only; never recursively inspect study content.
 containers as materialized (
   select w.account_id,'workspace'::text as source,w.document->'space' as appearance
   from public.nooks_workspaces w where w.document ? 'space'
   union all
   select w.account_id,'draft',d.value->'space'
   from public.nooks_workspaces w cross join lateral jsonb_array_elements(
     case when jsonb_typeof(w.document#>'{nookCreator,drafts}')='array' then w.document#>'{nookCreator,drafts}' else '[]'::jsonb end) d
   union all
   select s.account_id,'share',s.snapshot->'space' from public.nooks_shares s
 ), malformed_containers as materialized (
   select account_id from containers where jsonb_typeof(appearance) is distinct from 'object'
   union all
   select w.account_id from public.nooks_workspaces w where w.document ? 'nookCreator'
     and (jsonb_typeof(w.document->'nookCreator') is distinct from 'object' or jsonb_typeof(w.document#>'{nookCreator,drafts}') is distinct from 'array')
 ), raw_refs as materialized (
   select account_id,source,appearance->'_storedBackground' as ref from containers
   where jsonb_typeof(appearance)='object' and appearance ? '_storedBackground'
 ), refs as materialized (
   select account_id,source,ref->>'path' as path,
     coalesce((ref->>'path') ~ v_path_pattern,false) as canonical,
     case when jsonb_typeof(ref) is distinct from 'object' then false else coalesce(jsonb_typeof(ref->'path')='string'
       and (ref->>'path') ~ ('^'||account_id::text||'/[0-9a-f]{64}(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$')
       and jsonb_typeof(ref->'mime')='string' and ref->>'mime' in ('image/png','image/jpeg','image/webp')
       and (ref-array['path','mime'])='{}'::jsonb,false) end as valid
   from raw_refs
 ), quarantined_owners as materialized (
   select account_id::text as owner from malformed_containers
   union select account_id::text from refs where not valid
   -- A foreign canonical target is quarantined too, even when its owner has no bad document.
   union select left(path,36) from refs where canonical and not valid
 ), valid_refs as materialized (
   select path,count(*) as reference_count from refs where valid group by path
 ), object_rows as materialized (
   select o.name as path,coalesce(o.name ~ v_path_pattern,false) as canonical,
     case when length(o.metadata->>'size') between 1 and 19 and (o.metadata->>'size') ~ '^[0-9]+$'
       then case when (o.metadata->>'size')::numeric<=9223372036854775807 then (o.metadata->>'size')::numeric end end as bytes
   from storage.objects o where o.bucket_id='nooks-private'
 ), objects as materialized (
   select path,count(*) as object_count,count(bytes) as sizes_known,sum(bytes) as bytes
   from object_rows where canonical group by path
 ), paths as materialized (
   select path from objects union select path from refs where canonical
 ), inventory as materialized (
   select p.path,coalesce(o.object_count,0) as object_count,o.bytes,
     coalesce(r.reference_count,0) as reference_count,
     case
       when a.id is null then 'quarantined_unknown_owner'
       when q.owner is not null then 'quarantined_reference'
       when o.object_count>1 or o.sizes_known<o.object_count then 'quarantined_metadata'
       when o.path is null then 'missing_metadata'
       when r.path is not null then 'referenced'
       else 'unreferenced_at_snapshot'
     end as status
   from paths p left join objects o using(path) left join valid_refs r using(path)
   left join public.nooks_accounts a on a.id::text=left(p.path,36)
   left join quarantined_owners q on q.owner=left(p.path,36)
 ), page as materialized (
   select path,status from inventory where p_after is null or path>p_after order by path limit p_limit+1
 ), numbered as (select page.*,row_number() over(order by path) as position from page)
 select jsonb_build_object(
   'mode','dry_run','bucket','nooks-private','observedAt',statement_timestamp(),
   'metadataOnly',true,'deletionSafe',false,'inFlightUploadsTracked',false,
   'counts',jsonb_build_object(
     'objects',(select count(*) from object_rows),
     'knownObjectBytes',coalesce((select sum(bytes) from object_rows),0),
     'objectsWithUnknownBytes',(select count(*) from object_rows where bytes is null),
     'malformedObjectNames',(select count(*) from object_rows where not canonical),
     'validReferenceOccurrences',(select count(*) from refs where valid),
     'distinctReferencedPaths',(select count(*) from valid_refs),
     'workspaceReferences',(select count(*) from refs where valid and source='workspace'),
     'draftReferences',(select count(*) from refs where valid and source='draft'),
     'shareReferences',(select count(*) from refs where valid and source='share'),
     'invalidReferences',(select count(*) from refs where not valid),
     'malformedContainers',(select count(*) from malformed_containers),
     'quarantinedOwners',(select count(*) from quarantined_owners),
     'referencedObjects',(select count(*) from inventory where reference_count>0 and object_count>0),
     'missingReferencedPaths',(select count(*) from inventory where reference_count>0 and object_count=0),
     'unreferencedObjectsAtSnapshot',(select count(*) from inventory where status='unreferenced_at_snapshot'),
     'unreferencedKnownBytesAtSnapshot',coalesce((select sum(bytes) from inventory where status='unreferenced_at_snapshot'),0),
     'quarantinedPaths',(select count(*) from inventory where status like 'quarantined_%')),
   'candidates',coalesce((select jsonb_agg(jsonb_build_object('path',path,'status',status) order by path) from numbered where position<=p_limit),'[]'::jsonb),
   'limit',p_limit,'hasMore',(select count(*)>p_limit from numbered),
   'nextAfter',case when (select count(*)>p_limit from numbered) then (select max(path) from numbered where position<=p_limit) else null end
 ) into v_result;
 return v_result;
end $$;
commit;
