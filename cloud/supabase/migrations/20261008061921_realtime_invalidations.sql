-- Private, lossy refresh hints. Never broadcast records, membership, identity,
-- counts, revisions, artwork, or study content. Authoritative APIs reauthorize.
-- Realtime caches channel authorization until token refresh/expiry: a former
-- member may still receive these content-free hints until then.
begin;
create table nooks_private.realtime_throttle (
 topic text primary key,
 sent_at timestamptz not null
);
alter table nooks_private.realtime_throttle enable row level security;
revoke all on nooks_private.realtime_throttle from public,anon,authenticated;
grant all on nooks_private.realtime_throttle to service_role;

create function nooks_private.invalidate_topic(p_topic text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_interval interval;
begin
 if p_topic !~ '^(account|nook):[0-9a-f-]{36}$' and p_topic<>'nooks:directory' then
   raise exception 'Invalid refresh topic' using errcode='22023';
 end if;
 v_interval:=case when p_topic='nooks:directory' then interval '10 seconds'
   when p_topic like 'nook:%' then interval '2 seconds' else interval '1 second' end;
 -- A burst never queues on a global directory or room lock. Skipped hints are
 -- repaired by periodic authenticated snapshots and reconnect refreshes.
 if not pg_try_advisory_xact_lock(hashtextextended('nooks-realtime:'||p_topic,0)) then return; end if;
 insert into nooks_private.realtime_throttle(topic,sent_at) values(p_topic,v_now)
 on conflict(topic) do update set sent_at=excluded.sent_at
 where realtime_throttle.sent_at<=v_now-v_interval;
 if not found then return; end if;
 -- realtime.send is the supported API; do not modify realtime schema objects.
 -- Delivery is best-effort. A broadcast outage must not break saved work.
 begin
   perform realtime.send('{"v":1}'::jsonb,'invalidate',p_topic,true);
 exception when others then
   raise warning 'Nooks realtime invalidation unavailable [%]',SQLSTATE;
 end;
end $$;

create function nooks_private.broadcast_outbox_hint() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and NEW.payload is not distinct from OLD.payload then return NEW; end if;
 if NEW.account_id is not null then perform nooks_private.invalidate_topic('account:'||NEW.account_id); end if;
 if NEW.nook_id is not null then perform nooks_private.invalidate_topic('nook:'||NEW.nook_id); end if;
 return NEW;
end $$;
create trigger nooks_outbox_realtime after insert or update of payload on public.nooks_outbox
for each row execute function nooks_private.broadcast_outbox_hint();

create function nooks_private.broadcast_room_hint() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform nooks_private.invalidate_topic('nook:'||NEW.id);
 -- Private-only activity never appears on the shared directory channel.
 if NEW.visibility='public' or (TG_OP='UPDATE' and OLD.visibility='public') then
   perform nooks_private.invalidate_topic('nooks:directory');
 end if;
 return NEW;
end $$;
create trigger nooks_room_realtime after insert or update of title,description,visibility,archived_at on public.nooks_rooms
for each row execute function nooks_private.broadcast_room_hint();

create function nooks_private.broadcast_member_hint() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_changed boolean;
begin
 v_changed:=TG_OP='INSERT' or (NEW.left_at is distinct from OLD.left_at);
 if v_changed then
   perform nooks_private.invalidate_topic('account:'||NEW.account_id);
   if exists(select 1 from public.nooks_rooms where id=NEW.nook_id and visibility='public' and archived_at is null) then
     perform nooks_private.invalidate_topic('nooks:directory');
   end if;
 end if;
 -- Heartbeats while already online do not fan out; expiry is reconciled by
 -- snapshots, and the first heartbeat after absence wakes the room.
 if v_changed or (coalesce(OLD.last_seen_at,'-infinity'::timestamptz)<clock_timestamp()-interval '90 seconds'
   and NEW.last_seen_at>clock_timestamp()-interval '90 seconds') then
   perform nooks_private.invalidate_topic('nook:'||NEW.nook_id);
 end if;
 return NEW;
end $$;
create trigger nooks_member_realtime after insert or update of left_at,last_seen_at on public.nooks_members
for each row execute function nooks_private.broadcast_member_hint();

create function nooks_private.broadcast_profile_hint() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_nook uuid;
begin
 if NEW.display_name is not distinct from OLD.display_name and NEW.avatar is not distinct from OLD.avatar then return NEW; end if;
 perform nooks_private.invalidate_topic('account:'||NEW.account_id);
 for v_nook in select nook_id from public.nooks_members where account_id=NEW.account_id and left_at is null loop
   perform nooks_private.invalidate_topic('nook:'||v_nook);
 end loop;
 return NEW;
end $$;
create trigger nooks_profile_realtime after update of display_name,avatar on public.nooks_profiles
for each row execute function nooks_private.broadcast_profile_hint();

create or replace function nooks_private.can_receive_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid; v_account uuid:=nooks_private.current_account();
begin
 if v_account is null then return false; end if;
 if p_topic='nooks:directory' or p_topic='account:'||v_account::text then return true; end if;
 if p_topic ~ '^nook:[a-fA-F0-9-]{36}$' then
   begin v_id:=substring(p_topic from 6)::uuid; exception when invalid_text_representation then return false; end;
   return nooks_private.is_member(v_id,v_account);
 end if;
 return false;
end $$;
revoke all on function nooks_private.invalidate_topic(text),nooks_private.broadcast_outbox_hint(),nooks_private.broadcast_room_hint(),nooks_private.broadcast_member_hint(),nooks_private.broadcast_profile_hint() from public,anon,authenticated;
grant execute on function nooks_private.invalidate_topic(text),nooks_private.broadcast_outbox_hint(),nooks_private.broadcast_room_hint(),nooks_private.broadcast_member_hint(),nooks_private.broadcast_profile_hint() to service_role;
-- Directory/account channels are receive-only. Preserve room presence for old
-- clients, but extending receive authorization must never widen client writes.
drop policy nooks_member_presence on realtime.messages;
create policy nooks_member_presence on realtime.messages for insert to authenticated
 with check(extension='presence' and (select realtime.topic()) ~ '^nook:[a-fA-F0-9-]{36}$'
   and nooks_private.can_receive_topic((select realtime.topic())));
-- Existing receive policy uses can_receive_topic. Clients have no broadcast
-- INSERT policy, so only server-authored invalidate messages can be received.
commit;
