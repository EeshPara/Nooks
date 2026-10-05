-- Durable quotas for authenticated browser/API requests. Service-only, no private content.
begin;
create table nooks_private.request_limits (
  account_id uuid not null references public.nooks_accounts(id) on delete cascade,
  bucket text not null check (bucket in ('api','generation')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key(account_id,bucket)
);
alter table nooks_private.request_limits enable row level security;
revoke all on table nooks_private.request_limits from public,anon,authenticated;
grant all on table nooks_private.request_limits to service_role;
create function public.nooks_request_limit(p_account uuid,p_bucket text,p_limit integer,p_window_seconds integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp(); v_count integer; v_start timestamptz;
begin
  if p_bucket not in ('api','generation') or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit' using errcode='22023';
  end if;
  if not exists(select 1 from public.nooks_accounts where id=p_account) then raise exception 'Verified account required' using errcode='42501'; end if;
  insert into nooks_private.request_limits(account_id,bucket,window_started_at,request_count) values(p_account,p_bucket,v_now,1)
  on conflict(account_id,bucket) do update set
    request_count=case when nooks_private.request_limits.window_started_at <= v_now-make_interval(secs=>p_window_seconds) then 1 else least(nooks_private.request_limits.request_count+1,1000000) end,
    window_started_at=case when nooks_private.request_limits.window_started_at <= v_now-make_interval(secs=>p_window_seconds) then v_now else nooks_private.request_limits.window_started_at end
  returning request_count,window_started_at into v_count,v_start;
  return jsonb_build_object('allowed',v_count<=p_limit,'retryAfter',greatest(1,ceil(extract(epoch from v_start+make_interval(secs=>p_window_seconds)-v_now))::integer));
end $$;
revoke all on function public.nooks_request_limit(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.nooks_request_limit(uuid,text,integer,integer) to service_role;
commit;
