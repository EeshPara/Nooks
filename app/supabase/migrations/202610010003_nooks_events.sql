begin;
-- Leased at-least-once delivery. Never hold a DB transaction open during HTTP delivery.
create function public.nooks_outbox_claim(p_limit integer default 25,p_lease_seconds integer default 60)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_token uuid:=gen_random_uuid(); v_events jsonb;
begin
 if p_limit not between 1 and 100 or p_lease_seconds not between 15 and 300 then raise exception 'Invalid outbox lease' using errcode='22023'; end if;
 with claimed as (
   select id from public.nooks_outbox where delivered_at is null and available_at<=clock_timestamp()
     and (lease_until is null or lease_until<clock_timestamp()) order by created_at for update skip locked limit p_limit
 ), updated as (
   update public.nooks_outbox o set lease_token=v_token,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1
   from claimed c where o.id=c.id returning o.id,o.event_type,o.account_id,o.nook_id,o.payload,o.created_at,o.attempts,o.lease_token
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'accountId',account_id,'nookId',nook_id,'payload',payload,'createdAt',created_at,'attempts',attempts,'leaseToken',lease_token)),'[]'::jsonb) into v_events from updated;
 return jsonb_build_object('events',v_events);
end $$;
create function public.nooks_outbox_ack(p_id uuid,p_lease_token uuid,p_success boolean,p_error text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 update public.nooks_outbox set delivered_at=case when p_success then clock_timestamp() else null end,
   available_at=case when p_success then available_at else clock_timestamp()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer)) end,
   last_error=case when p_success then null else left(coalesce(p_error,'Delivery failed'),500) end,lease_token=null,lease_until=null
 where id=p_id and lease_token=p_lease_token and lease_until>clock_timestamp() and delivered_at is null;
 return jsonb_build_object('acknowledged',found);
end $$;
create function public.nooks_webhook_receive(p_source text,p_event_id text,p_payload_hash text,p_event_type text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_hash text;
begin
 if p_source is null or length(p_source) not between 1 and 120 or p_event_id is null or length(p_event_id) not between 1 and 180
   or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' or p_event_type is null or length(p_event_type) not between 1 and 100 then raise exception 'Invalid event envelope' using errcode='22023'; end if;
 insert into public.nooks_webhook_inbox(source,event_id,payload_hash,event_type) values(p_source,p_event_id,p_payload_hash,p_event_type)
 on conflict(source,event_id) do nothing;
 if found then return jsonb_build_object('accepted',true,'duplicate',false); end if;
 select payload_hash into v_hash from public.nooks_webhook_inbox where source=p_source and event_id=p_event_id;
 if v_hash<>p_payload_hash then raise exception 'Webhook ID was reused with different content' using errcode='22023'; end if;
 return jsonb_build_object('accepted',true,'duplicate',true);
end $$;
revoke all on function public.nooks_outbox_claim(integer,integer),public.nooks_outbox_ack(uuid,uuid,boolean,text),public.nooks_webhook_receive(text,text,text,text) from public,anon,authenticated;
grant execute on function public.nooks_outbox_claim(integer,integer),public.nooks_outbox_ack(uuid,uuid,boolean,text),public.nooks_webhook_receive(text,text,text,text) to service_role;
commit;
