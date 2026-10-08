-- Read cost scales with members, never the full history of every member.
begin;
create table nooks_private.focus_totals (
 nook_id uuid not null references public.nooks_rooms(id) on delete cascade,
 account_id uuid not null references public.nooks_accounts(id) on delete cascade,
 completed_seconds bigint not null default 0 check(completed_seconds>=0),
 primary key(nook_id,account_id)
);
alter table nooks_private.focus_totals enable row level security;
revoke all on nooks_private.focus_totals from public,anon,authenticated;
grant all on nooks_private.focus_totals to service_role;
-- Backfill and trigger installation share the migration transaction. Block
-- writers while backfilling so no committed completion is lost or double-counted.
lock table public.nooks_shared_focus in share row exclusive mode;
insert into nooks_private.focus_totals(nook_id,account_id,completed_seconds)
 select nook_id,account_id,sum(accrued_seconds) from public.nooks_shared_focus
 where status='completed' group by nook_id,account_id;
create function nooks_private.maintain_focus_totals() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP<>'INSERT' and OLD.status='completed' then
   update nooks_private.focus_totals set completed_seconds=completed_seconds-OLD.accrued_seconds
     where nook_id=OLD.nook_id and account_id=OLD.account_id;
 end if;
 if TG_OP<>'DELETE' and NEW.status='completed' then
   insert into nooks_private.focus_totals(nook_id,account_id,completed_seconds)
     values(NEW.nook_id,NEW.account_id,NEW.accrued_seconds)
   on conflict(nook_id,account_id) do update
     set completed_seconds=focus_totals.completed_seconds+excluded.completed_seconds;
 end if;
 return null;
end $$;
revoke all on function nooks_private.maintain_focus_totals() from public,anon,authenticated;
grant execute on function nooks_private.maintain_focus_totals() to service_role;
create trigger nooks_focus_totals after insert or update or delete on public.nooks_shared_focus
for each row execute function nooks_private.maintain_focus_totals();
create index if not exists nooks_members_online on public.nooks_members(nook_id,last_seen_at) where left_at is null;
create index if not exists nooks_members_page on public.nooks_members(nook_id,joined_at,account_id) where left_at is null;

-- The deployed native baseline and development baseline deliberately differ
-- in custom artwork support. Change only these verified query fragments in the
-- installed function; preserve all installed authorization/publication logic.
-- Exact occurrence assertions fail closed if the installed source is unknown.
-- No user input is interpolated into DDL. CREATE OR REPLACE retains function ACL.
do $patch$
declare definition text:=pg_get_functiondef('public.nooks_community(uuid,text,jsonb)'::regprocedure); item record;
begin
 for item in select * from (values
  ($old$update public.nooks_members set last_seen_at=v_now where nook_id=v_nook and account_id=p_actor;$old$,$new$update public.nooks_members set last_seen_at=v_now where nook_id=v_nook and account_id=p_actor and left_at is null and (last_seen_at is null or last_seen_at<=v_now-interval '15 seconds');$new$,1),
  ($old$left join lateral(select floor(sum(s.accrued_seconds)/60)::bigint as minutes from public.nooks_shared_focus s where s.nook_id=v_nook and s.account_id=m.account_id and s.status='completed') f on true$old$,$new$left join nooks_private.focus_totals f on f.nook_id=v_nook and f.account_id=m.account_id$new$,2),
  ($old$coalesce(f.minutes,0)$old$,$new$coalesce(f.completed_seconds/60,0)$new$,3),
  ($old$order by m.joined_at)$old$,$new$order by m.joined_at,m.account_id)$new$,1)
 ) as replacements(before_text,after_text,expected_count) loop
   if (length(definition)-length(replace(definition,item.before_text,'')))/length(item.before_text)<>item.expected_count then
     raise exception 'Installed nooks_community differs from reviewed baseline; migration stopped';
   end if;
   definition:=replace(definition,item.before_text,item.after_text);
 end loop;
 execute definition;
end $patch$;
commit;
