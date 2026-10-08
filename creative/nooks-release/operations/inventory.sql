-- Run only against Nooks project lcfcjglybfeozyrjjikk.
-- Read-only aggregate metadata, no account IDs, object paths, event payloads or private content.
begin read only;
set local statement_timeout = '5s';
select now() as sampled_at, count(*) as total_events,
 count(*) filter(where delivered_at is not null) as delivered,
 count(*) filter(where lease_until > now()) as active_leases,
 count(*) filter(where attempts > 0 and delivered_at is null) as retrying,
 count(*) filter(where attempts = 0 and delivered_at is null) as never_claimed,
 min(created_at) as oldest_created_at,
 pg_total_relation_size('public.nooks_outbox') as total_bytes
from public.nooks_outbox;
select schemaname,relname,n_live_tup::bigint as estimated_rows,
 pg_total_relation_size(relid)::bigint as total_bytes
from pg_stat_user_tables
where (schemaname='public' and relname like 'nooks%') or schemaname='nooks_private'
order by total_bytes desc;
commit;
