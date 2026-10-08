-- ONLY for the disposable local test cluster. Never apply to a Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth to anon,authenticated,service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on storage.buckets,storage.objects to service_role;
create schema realtime;
create table realtime.messages(extension text,topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
grant usage on schema realtime to authenticated,service_role;
grant select,insert on realtime.messages to authenticated;
grant all on realtime.messages to service_role;
grant execute on function realtime.topic() to authenticated,service_role;
create schema nooks_test;
create function nooks_test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
grant usage on schema nooks_test to anon,authenticated,service_role;
grant execute on function nooks_test.assert(boolean,text) to anon,authenticated,service_role;

-- Stand-in for Supabase's supported API: capture exact payloads locally only.
create table nooks_test.broadcasts(payload jsonb,event text,topic text,private boolean);
grant all on nooks_test.broadcasts to service_role;
create function realtime.send(payload jsonb,event text,topic text,private boolean default true) returns void language plpgsql as $$
begin
 if current_setting('nooks_test.fail_broadcast',true)='yes' then raise exception 'Synthetic broadcast outage'; end if;
 insert into nooks_test.broadcasts values(payload,event,topic,private);
end $$;
grant execute on function realtime.send(jsonb,text,text,boolean) to service_role;
