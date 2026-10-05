-- Service-only community directory pagination and owner invitation metadata.
-- Preserves existing mutation authorization, limits, and room-before-focus lock order.
begin;

create or replace function public.nooks_community(p_actor uuid,p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_nook uuid; v_owner uuid; v_now timestamptz := clock_timestamp(); v_room public.nooks_rooms%rowtype;
 v_invite public.nooks_invites%rowtype; v_focus public.nooks_shared_focus%rowtype;
 v_id uuid; v_request uuid; v_seconds integer; v_title text; v_description text; v_visibility text;
 v_profile jsonb; v_members jsonb; v_leaderboard jsonb; v_role text; v_token_hash text; v_offset integer; v_limit integer; v_items jsonb; v_has_more boolean; v_joined_only boolean;
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
   if p_args ? 'joinedOnly' and jsonb_typeof(p_args->'joinedOnly') is distinct from 'boolean' then raise exception 'joinedOnly must be a boolean' using errcode='22023'; end if;
   v_joined_only:=coalesce((p_args->>'joinedOnly')::boolean,false);
   -- The extra row establishes hasMore without counting the whole directory.
   -- All ordering stages use the same unique tie-breaker.
   with page as materialized (
     select r.id,r.created_at from public.nooks_rooms r
     where r.archived_at is null
       and (r.visibility='public' or exists(select 1 from public.nooks_members m where m.nook_id=r.id and m.account_id=p_actor and m.left_at is null))
       and (not v_joined_only or exists(select 1 from public.nooks_members m where m.nook_id=r.id and m.account_id=p_actor and m.left_at is null))
     order by r.created_at desc,r.id desc offset v_offset limit v_limit+1
   ), numbered as (select page.*,row_number() over(order by created_at desc,id desc) as position from page)
   select coalesce(jsonb_agg(nooks_private.nook_summary(id,p_actor) order by created_at desc,id desc) filter(where position<=v_limit),'[]'::jsonb),count(*)>v_limit
     into v_items,v_has_more from numbered;
   return jsonb_build_object('nooks',v_items,'offset',v_offset,'limit',v_limit,'hasMore',v_has_more,'nextOffset',case when v_has_more then v_offset+v_limit else null end);
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
 if p_action in ('nook_snapshot','heartbeat','list_invites') then
   select * into v_room from public.nooks_rooms where id=v_nook;
 else
   select * into v_room from public.nooks_rooms where id=v_nook for update;
 end if;
 if not found then raise exception 'Nook unavailable' using errcode='42501'; end if;
 -- A lost archive response is retryable only by the persisted owner. Do not
 -- repeat writes, focus cancellation or event emission for an archived nook.
 if v_room.archived_at is not null then
   if p_action='archive_nook' and v_room.owner_id=p_actor then
     return jsonb_build_object('nookId',v_nook,'archived',true,'duplicate',true);
   end if;
   raise exception 'Nook unavailable' using errcode='42501';
 end if;
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
 elsif p_action='list_invites' then
   if v_owner<>p_actor then raise exception 'Only the nook owner can list invites' using errcode='42501'; end if;
   v_offset:=coalesce((p_args->>'offset')::integer,0); v_limit:=coalesce((p_args->>'limit')::integer,50);
   if v_offset<0 or v_offset>100000 or v_limit not between 1 and 50 then raise exception 'Invalid page' using errcode='22023'; end if;
   -- Metadata only. Never return invitation secrets, hashes, or recipient identities.
   with page as materialized (
     select i.* from public.nooks_invites i where i.nook_id=v_nook
     order by i.created_at desc,i.id desc offset v_offset limit v_limit+1
   ), numbered as (select page.*,row_number() over(order by created_at desc,id desc) as position from page)
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'nookId',nook_id,'expiresAt',expires_at,'uses',uses,'maxUses',max_uses,'revokedAt',revoked_at)
       order by created_at desc,id desc) filter(where position<=v_limit),'[]'::jsonb),count(*)>v_limit
     into v_items,v_has_more from numbered;
   return jsonb_build_object('invites',v_items,'offset',v_offset,'limit',v_limit,'hasMore',v_has_more,'nextOffset',case when v_has_more then v_offset+v_limit else null end);
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

revoke all on function public.nooks_community(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nooks_community(uuid,text,jsonb) to service_role;
commit;
