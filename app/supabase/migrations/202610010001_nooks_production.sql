-- Nooks production foundation. No demo people, sample memberships, or fabricated activity.
-- Run only against the selected project after reviewing the setup guide.
begin;
create schema if not exists nooks_private;
revoke all on schema nooks_private from public, anon, authenticated;
grant usage on schema nooks_private to service_role;

create table public.nooks_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.nooks_identity_links (
  namespace text not null check (length(namespace) between 1 and 120),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  primary key(namespace, subject_hash)
);
create table public.nooks_profiles (
  account_id uuid primary key references public.nooks_accounts(id) on delete cascade,
  display_name text not null default 'Student' check (length(display_name) between 1 and 80),
  avatar integer not null default 0 check (avatar between 0 and 11),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.nooks_workspaces (
  account_id uuid primary key references public.nooks_accounts(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  document jsonb not null default '{}'::jsonb check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.nooks_artifacts (
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  id text not null check (length(id) between 1 and 128 and id not in ('__proto__','constructor','prototype')),
  kind text not null check (kind in ('note','quiz','exam','flashcards')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  position integer not null,
  primary key(account_id,id)
);
create table public.nooks_practice (
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  session_id text not null check (length(session_id) between 1 and 128),
  artifact_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  position integer not null,
  primary key(account_id,session_id)
);
create table public.nooks_personal_focus (
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  position integer not null,
  primary key(account_id,id)
);
create table public.nooks_room_progress (
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  room_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  primary key(account_id,room_id)
);
create table public.nooks_shares (
  id uuid primary key,
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create table public.nooks_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.nooks_accounts(id),
  request_id uuid not null,
  title text not null check (length(title) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  room_id text not null check (length(room_id) between 1 and 80),
  visibility text not null check (visibility in ('public','private')),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(owner_id,request_id)
);
create table public.nooks_members (
  nook_id uuid not null references public.nooks_rooms(id) on delete cascade,
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  last_seen_at timestamptz,
  primary key(nook_id,account_id)
);
create index nooks_members_account on public.nooks_members(account_id,nook_id) where left_at is null;
create table public.nooks_invites (
  id uuid primary key default gen_random_uuid(),
  nook_id uuid not null references public.nooks_rooms(id) on delete cascade,
  created_by uuid not null references public.nooks_accounts(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 25),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table public.nooks_invite_uses (
  invite_id uuid not null references public.nooks_invites(id) on delete cascade,
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  used_at timestamptz not null default clock_timestamp(),
  primary key(invite_id,account_id)
);
create table public.nooks_shared_focus (
  id text not null check (length(id) between 1 and 128),
  nook_id uuid not null references public.nooks_rooms(id) on delete cascade,
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  target_seconds integer not null check (target_seconds between 60 and 10800),
  started_at timestamptz not null default clock_timestamp(),
  active_started_at timestamptz,
  accrued_seconds integer not null default 0 check (accrued_seconds >= 0),
  status text not null check (status in ('active','paused','completed','cancelled')),
  completed_at timestamptz,
  primary key(account_id,id)
);
create unique index nooks_one_active_shared_focus on public.nooks_shared_focus(account_id) where status in ('active','paused');
create index nooks_shared_focus_leaderboard on public.nooks_shared_focus(nook_id,account_id) where status = 'completed';
create table public.nooks_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  account_id uuid references public.nooks_accounts(id) on delete cascade,
  nook_id uuid references public.nooks_rooms(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error text
);
create index nooks_outbox_pending on public.nooks_outbox(available_at,created_at) where delivered_at is null;
create table public.nooks_webhook_inbox (
  source text not null check (length(source) between 1 and 120),
  event_id text not null check (length(event_id) between 1 and 180),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null check (length(event_type) between 1 and 100),
  received_at timestamptz not null default clock_timestamp(),
  primary key(source,event_id)
);

-- Read helpers are private SECURITY DEFINER functions, never public Data API RPCs.
create function nooks_private.current_account() returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.nooks_accounts a where a.auth_user_id = (select auth.uid())
$$;
create function nooks_private.is_member(p_nook uuid, p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.nooks_members m join public.nooks_rooms r on r.id=m.nook_id
    where m.nook_id=p_nook and m.account_id=p_account and m.left_at is null and r.archived_at is null)
$$;
create function nooks_private.shares_nook(p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.nooks_members mine join public.nooks_members other using(nook_id)
    join public.nooks_rooms r on r.id=mine.nook_id where mine.account_id=nooks_private.current_account()
    and other.account_id=p_account and mine.left_at is null and other.left_at is null and r.archived_at is null)
$$;
grant usage on schema nooks_private to authenticated;
grant execute on function nooks_private.current_account(), nooks_private.is_member(uuid,uuid), nooks_private.shares_nook(uuid) to authenticated,service_role;
revoke execute on function nooks_private.current_account(), nooks_private.is_member(uuid,uuid), nooks_private.shares_nook(uuid) from public,anon;

do $$ declare t text; begin
  foreach t in array array['nooks_accounts','nooks_identity_links','nooks_profiles','nooks_workspaces','nooks_artifacts','nooks_practice','nooks_personal_focus','nooks_room_progress','nooks_shares','nooks_rooms','nooks_members','nooks_invites','nooks_invite_uses','nooks_shared_focus','nooks_outbox','nooks_webhook_inbox'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
grant select on public.nooks_accounts,public.nooks_profiles,public.nooks_workspaces,public.nooks_artifacts,public.nooks_practice,public.nooks_personal_focus,public.nooks_room_progress,public.nooks_shares,public.nooks_rooms,public.nooks_members,public.nooks_shared_focus to authenticated;
create policy nooks_account_self on public.nooks_accounts for select to authenticated using(id = nooks_private.current_account());
create policy nooks_profile_visible on public.nooks_profiles for select to authenticated using(account_id = nooks_private.current_account() or nooks_private.shares_nook(account_id));
do $$ declare t text; begin
  foreach t in array array['nooks_workspaces','nooks_artifacts','nooks_practice','nooks_personal_focus','nooks_room_progress','nooks_shares'] loop
    execute format('create policy nooks_owner_read on public.%I for select to authenticated using(account_id = nooks_private.current_account())',t);
  end loop;
end $$;
create policy nooks_room_read on public.nooks_rooms for select to authenticated using(archived_at is null and (visibility='public' or nooks_private.is_member(id,nooks_private.current_account())));
create policy nooks_members_read on public.nooks_members for select to authenticated using(nooks_private.is_member(nook_id,nooks_private.current_account()));
create policy nooks_shared_focus_read on public.nooks_shared_focus for select to authenticated using(nooks_private.is_member(nook_id,nooks_private.current_account()));

-- Service-only INVOKER RPCs: client roles cannot call these or mutate tables.
create function public.nooks_resolve_identity(p_namespace text,p_subject_hash text,p_auth_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_account uuid;
begin
  if p_namespace is null or length(p_namespace) not between 1 and 120 or p_subject_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid verified identity' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_namespace||':'||p_subject_hash,0));
  select account_id into v_account from public.nooks_identity_links where namespace=p_namespace and subject_hash=p_subject_hash;
  if v_account is null and p_auth_user_id is not null then select id into v_account from public.nooks_accounts where auth_user_id=p_auth_user_id; end if;
  if v_account is null then insert into public.nooks_accounts(auth_user_id) values(p_auth_user_id) returning id into v_account; end if;
  if p_auth_user_id is not null and not exists(select 1 from public.nooks_accounts where id=v_account and auth_user_id=p_auth_user_id) then
    raise exception 'Identity link conflict' using errcode='42501';
  end if;
  insert into public.nooks_identity_links(namespace,subject_hash,account_id) values(p_namespace,p_subject_hash,v_account) on conflict do nothing;
  insert into public.nooks_profiles(account_id) values(v_account) on conflict do nothing;
  return jsonb_build_object('id',v_account);
end $$;

create function public.nooks_workspace_read(p_account uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('revision',w.revision,'workspace',w.document || jsonb_build_object(
    'version',1,'artifacts',coalesce((select jsonb_agg(a.payload order by a.position) from public.nooks_artifacts a where a.account_id=p_account),'[]'::jsonb),
    'progress',coalesce((select jsonb_agg(p.payload order by p.position) from public.nooks_practice p where p.account_id=p_account),'[]'::jsonb),
    'focusSessions',coalesce((select jsonb_agg(f.payload order by f.position) from public.nooks_personal_focus f where f.account_id=p_account),'[]'::jsonb),
    'roomProgress',coalesce((select jsonb_object_agg(r.room_id,r.payload) from public.nooks_room_progress r where r.account_id=p_account),'{}'::jsonb)))
  from public.nooks_workspaces w where w.account_id=p_account
$$;

create function public.nooks_workspace_commit(p_account uuid,p_expected_revision bigint,p_workspace jsonb,p_share_operations jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_revision bigint; v_op jsonb; v_share uuid; v_document jsonb; v_source jsonb;
 v_focus public.nooks_shared_focus%rowtype; v_nook uuid; v_now timestamptz; v_seconds integer; v_status text;
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
  for v_source in select value from jsonb_array_elements(p_workspace->'focusSessions') loop
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
  insert into public.nooks_outbox(event_type,account_id,payload) values('workspace.changed',p_account,jsonb_build_object('revision',v_revision+1));
  return jsonb_build_object('committed',true,'revision',v_revision+1);
end $$;
create function public.nooks_share_read(p_share uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('owner',account_id,'snapshot',snapshot) from public.nooks_shares where id=p_share
$$;

-- The private bucket stores only uploaded appearance images; never public by default.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nooks-private','nooks-private',false,1048576,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='nooks-private' and (public or file_size_limit is distinct from 1048576 or allowed_mime_types is distinct from array['image/png','image/jpeg','image/webp'])) then
   raise exception 'nooks-private bucket already exists with incompatible access or upload limits';
 end if;
end $$;
create policy nooks_artwork_own_read on storage.objects for select to authenticated using(
  bucket_id='nooks-private' and split_part(name,'/',1)=nooks_private.current_account()::text);

revoke all on function public.nooks_resolve_identity(text,text,uuid),public.nooks_workspace_read(uuid),public.nooks_workspace_commit(uuid,bigint,jsonb,jsonb),public.nooks_share_read(uuid) from public,anon,authenticated;
grant execute on function public.nooks_resolve_identity(text,text,uuid),public.nooks_workspace_read(uuid),public.nooks_workspace_commit(uuid,bigint,jsonb,jsonb),public.nooks_share_read(uuid) to service_role;

commit;
