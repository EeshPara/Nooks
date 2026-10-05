begin;
-- Bound lock waits; this dedicated database is small. No data is removed.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create index if not exists nooks_identity_links_account on public.nooks_identity_links(account_id);
create index if not exists nooks_invite_uses_account on public.nooks_invite_uses(account_id);
create index if not exists nooks_invites_creator on public.nooks_invites(created_by);
create index if not exists nooks_invites_nook on public.nooks_invites(nook_id);
create index if not exists nooks_outbox_account on public.nooks_outbox(account_id);
create index if not exists nooks_outbox_nook on public.nooks_outbox(nook_id);
create index if not exists nooks_shares_account on public.nooks_shares(account_id);
create index if not exists nooks_outbox_workspace_unclaimed on public.nooks_outbox(account_id,created_at desc,id desc)
  where event_type='workspace.changed' and delivered_at is null and lease_token is null and attempts=0;

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

create or replace function public.nooks_community(p_actor uuid,p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_nook uuid; v_owner uuid; v_now timestamptz := clock_timestamp(); v_room public.nooks_rooms%rowtype;
 v_invite public.nooks_invites%rowtype; v_focus public.nooks_shared_focus%rowtype;
 v_id uuid; v_request uuid; v_seconds integer; v_title text; v_description text; v_visibility text;
 v_profile jsonb; v_members jsonb; v_leaderboard jsonb; v_role text; v_token_hash text; v_offset integer; v_limit integer;
begin
 if not exists(select 1 from public.nooks_accounts where id=p_actor) then raise exception 'Verified account required' using errcode='42501'; end if;
 if jsonb_typeof(p_args) is distinct from 'object' then raise exception 'Arguments must be an object' using errcode='22023'; end if;
 if p_action='update_profile' then
   v_title:=btrim(p_args->>'displayName');
   if v_title is null or length(v_title) not between 1 and 28 or coalesce((p_args->>'avatar')::integer,-1) not between 0 and 7 then raise exception 'Invalid profile' using errcode='22023'; end if;
   update public.nooks_profiles set display_name=v_title,avatar=(p_args->>'avatar')::integer,updated_at=v_now where account_id=p_actor;
   return jsonb_build_object('profile',jsonb_build_object('id',p_actor,'displayName',v_title,'avatar',(p_args->>'avatar')::integer));
 elsif p_action='list_nooks' then
   v_offset:=coalesce((p_args->>'offset')::integer,0); v_limit:=coalesce((p_args->>'limit')::integer,50);
   if v_offset<0 or v_offset>100000 or v_limit not between 1 and 50 then raise exception 'Invalid page' using errcode='22023'; end if;
   return jsonb_build_object('nooks',coalesce((select jsonb_agg(nooks_private.nook_summary(r.id,p_actor) order by r.created_at desc) from (select * from public.nooks_rooms r
     where r.archived_at is null and (r.visibility='public' or exists(select 1 from public.nooks_members m where m.nook_id=r.id and m.account_id=p_actor and m.left_at is null)) order by r.created_at desc,r.id offset v_offset limit v_limit) r),'[]'::jsonb),'offset',v_offset,'limit',v_limit);
 elsif p_action='create_nook' then
   v_request:=(p_args->>'requestId')::uuid;
   if v_request is null then raise exception 'requestId required for retry safety' using errcode='22023'; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':create-nook',0));
   select id into v_nook from public.nooks_rooms where owner_id=p_actor and request_id=v_request;
   if v_nook is not null then return jsonb_build_object('nook',nooks_private.nook_summary(v_nook,p_actor),'duplicate',true); end if;
   v_title:=btrim(p_args->>'title'); v_description:=coalesce(p_args->>'description',''); v_visibility:=p_args->>'visibility';
   if v_title is null or length(v_title) not between 1 and 54 or length(v_description)>220 or v_visibility is null or v_visibility not in ('public','private')
     or p_args->>'roomId' is null or length(p_args->>'roomId') not between 1 and 80 then raise exception 'Invalid nook' using errcode='22023'; end if;
   if (select count(*) from public.nooks_rooms where owner_id=p_actor and archived_at is null)>=50 then raise exception 'Nook limit reached' using errcode='54000'; end if;
   insert into public.nooks_rooms(owner_id,request_id,title,description,room_id,visibility) values(p_actor,v_request,v_title,v_description,p_args->>'roomId',v_visibility) returning id into v_nook;
   insert into public.nooks_members(nook_id,account_id,role,last_seen_at) values(v_nook,p_actor,'owner',v_now);
   insert into public.nooks_outbox(event_type,nook_id,payload) values('nook.created',v_nook,jsonb_build_object('nookId',v_nook));
   return jsonb_build_object('nook',nooks_private.nook_summary(v_nook,p_actor));
 elsif p_action='accept_invite' then
   v_token_hash:=p_args->>'tokenHash';
   if v_token_hash is null or v_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invite' using errcode='22023'; end if;
   select * into v_invite from public.nooks_invites where token_hash=v_token_hash;
   if not found then raise exception 'Invite is expired or unavailable' using errcode='42501'; end if;
   select * into v_room from public.nooks_rooms where id=v_invite.nook_id for update;
   select * into v_invite from public.nooks_invites where token_hash=v_token_hash for update;
   if not found or v_invite.revoked_at is not null or v_invite.expires_at<=v_now then raise exception 'Invite is expired or unavailable' using errcode='42501'; end if;
   v_nook:=v_invite.nook_id;
   if v_room.archived_at is not null then raise exception 'Nook unavailable' using errcode='42501'; end if;
   if exists(select 1 from public.nooks_invite_uses where invite_id=v_invite.id and account_id=p_actor) and exists(select 1 from public.nooks_members where nook_id=v_nook and account_id=p_actor and left_at is null) then
     return jsonb_build_object('nookId',v_nook,'joined',true,'duplicate',true);
   end if;
   if v_invite.uses>=v_invite.max_uses then raise exception 'Invite has reached its limit' using errcode='42501'; end if;
   if exists(select 1 from public.nooks_members where nook_id=v_nook and account_id=p_actor and left_at is null) then return jsonb_build_object('nookId',v_nook,'joined',true); end if;
   insert into public.nooks_members(nook_id,account_id,role,last_seen_at) values(v_nook,p_actor,'member',v_now) on conflict(nook_id,account_id) do update set left_at=null,joined_at=v_now,last_seen_at=v_now;
   insert into public.nooks_invite_uses(invite_id,account_id) values(v_invite.id,p_actor) on conflict do nothing;
   update public.nooks_invites set uses=uses+1 where id=v_invite.id;
   insert into public.nooks_outbox(event_type,nook_id,payload) values('membership.changed',v_nook,jsonb_build_object('nookId',v_nook));
   return jsonb_build_object('nookId',v_nook,'joined',true);
 end if;

 v_nook:=(p_args->>'nookId')::uuid;
 if v_nook is null then raise exception 'nookId required' using errcode='22023'; end if;
 if p_action in ('nook_snapshot','heartbeat') then
   select * into v_room from public.nooks_rooms where id=v_nook;
 else
   select * into v_room from public.nooks_rooms where id=v_nook for update;
 end if;
 if not found or v_room.archived_at is not null then raise exception 'Nook unavailable' using errcode='42501'; end if;
 v_owner:=v_room.owner_id;
 select role into v_role from public.nooks_members where nook_id=v_nook and account_id=p_actor and left_at is null;
 if p_action='join_nook' then
   if v_role is null and v_room.visibility<>'public' then raise exception 'An invite is required for this nook' using errcode='42501'; end if;
   insert into public.nooks_members(nook_id,account_id,role,last_seen_at) values(v_nook,p_actor,case when v_owner=p_actor then 'owner' else 'member' end,v_now)
     on conflict(nook_id,account_id) do update set left_at=null,joined_at=case when public.nooks_members.left_at is null then public.nooks_members.joined_at else v_now end,last_seen_at=v_now;
   insert into public.nooks_outbox(event_type,nook_id,payload) values('membership.changed',v_nook,jsonb_build_object('nookId',v_nook));
   return jsonb_build_object('nookId',v_nook,'joined',true);
 end if;
 if v_role is null then raise exception 'Join this nook before accessing its members' using errcode='42501'; end if;
 if p_action='leave_nook' then
   if v_owner=p_actor then raise exception 'The owner must archive the nook instead of leaving' using errcode='42501'; end if;
   update public.nooks_members set left_at=v_now,last_seen_at=null where nook_id=v_nook and account_id=p_actor;
   update public.nooks_shared_focus set status='cancelled',active_started_at=null where nook_id=v_nook and account_id=p_actor and status in ('active','paused');
   insert into public.nooks_outbox(event_type,nook_id,payload) values('membership.changed',v_nook,jsonb_build_object('nookId',v_nook));
   return jsonb_build_object('nookId',v_nook,'joined',false);
 elsif p_action='heartbeat' then
   update public.nooks_members set last_seen_at=v_now where nook_id=v_nook and account_id=p_actor;
   return jsonb_build_object('nookId',v_nook,'onlineCount',(select count(*) from public.nooks_members where nook_id=v_nook and left_at is null and last_seen_at>v_now-interval '90 seconds'),'observedAt',v_now);
 elsif p_action='create_invite' then
   if v_owner<>p_actor then raise exception 'Only the nook owner can invite' using errcode='42501'; end if;
   v_token_hash:=p_args->>'tokenHash';
   if v_token_hash is null or v_token_hash !~ '^[a-f0-9]{64}$' or coalesce((p_args->>'expiresInHours')::integer,24) not between 1 and 168 or coalesce((p_args->>'maxUses')::integer,1) not between 1 and 25 then raise exception 'Invalid invite' using errcode='22023'; end if;
   insert into public.nooks_invites(nook_id,created_by,token_hash,expires_at,max_uses) values(v_nook,p_actor,v_token_hash,v_now+make_interval(hours=>coalesce((p_args->>'expiresInHours')::integer,24)),coalesce((p_args->>'maxUses')::integer,1)) returning * into v_invite;
   return jsonb_build_object('invite',jsonb_build_object('id',v_invite.id,'nookId',v_nook,'expiresAt',v_invite.expires_at));
 elsif p_action='revoke_invite' then
   if v_owner<>p_actor then raise exception 'Only the nook owner can revoke invites' using errcode='42501'; end if;
   update public.nooks_invites set revoked_at=v_now where nook_id=v_nook and id=(p_args->>'inviteId')::uuid;
   return jsonb_build_object('revoked',found);
 elsif p_action='archive_nook' then
   if v_owner<>p_actor then raise exception 'Only the nook owner can archive' using errcode='42501'; end if;
   update public.nooks_rooms set archived_at=v_now where id=v_nook;
   update public.nooks_members set left_at=v_now,last_seen_at=null where nook_id=v_nook;
   update public.nooks_shared_focus set status='cancelled',active_started_at=null where nook_id=v_nook and status in ('active','paused');
   insert into public.nooks_outbox(event_type,nook_id,payload) values('nook.archived',v_nook,jsonb_build_object('nookId',v_nook));
   return jsonb_build_object('nookId',v_nook,'archived',true);
 elsif p_action='nook_snapshot' then
   v_offset:=coalesce((p_args->>'offset')::integer,0); v_limit:=coalesce((p_args->>'limit')::integer,50);
   if v_offset<0 or v_offset>100000 or v_limit not between 1 and 50 then raise exception 'Invalid page' using errcode='22023'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',m.account_id,'displayName',p.display_name,'avatar',p.avatar,'role',m.role,
     'online',coalesce(m.last_seen_at>v_now-interval '90 seconds',false),'focusMinutes',coalesce(f.minutes,0)) order by m.joined_at),'[]'::jsonb) into v_members
   from (select * from public.nooks_members where nook_id=v_nook and left_at is null order by joined_at,account_id offset v_offset limit v_limit) m join public.nooks_profiles p using(account_id)
   left join lateral(select floor(sum(s.accrued_seconds)/60)::bigint as minutes from public.nooks_shared_focus s where s.nook_id=v_nook and s.account_id=m.account_id and s.status='completed') f on true
   where m.nook_id=v_nook and m.left_at is null;
   select coalesce(jsonb_agg(jsonb_build_object('id',l.account_id,'displayName',l.display_name,'avatar',l.avatar,'focusMinutes',l.minutes,'rank',l.rank) order by l.rank),'[]'::jsonb) into v_leaderboard from (
     select p.account_id,p.display_name,p.avatar,coalesce(f.minutes,0) as minutes,row_number() over(order by coalesce(f.minutes,0) desc,m.joined_at,p.account_id) as rank
     from public.nooks_members m join public.nooks_profiles p using(account_id)
     left join lateral(select floor(sum(s.accrued_seconds)/60)::bigint as minutes from public.nooks_shared_focus s where s.nook_id=v_nook and s.account_id=m.account_id and s.status='completed') f on true
     where m.nook_id=v_nook and m.left_at is null) l where l.rank<=50;
   select * into v_focus from public.nooks_shared_focus where nook_id=v_nook and account_id=p_actor and status in ('active','paused');
   return jsonb_build_object('nook',nooks_private.nook_summary(v_nook,p_actor),'members',v_members,'memberCount',(select count(*) from public.nooks_members where nook_id=v_nook and left_at is null),
     'onlineCount',(select count(*) from public.nooks_members where nook_id=v_nook and left_at is null and last_seen_at>v_now-interval '90 seconds'),'offset',v_offset,'limit',v_limit,'leaderboard',v_leaderboard,'focusSession',case when v_focus.id is null then null else to_jsonb(v_focus) end);
 end if;
 raise exception 'Unknown community action' using errcode='22023';
end $$;


commit;
