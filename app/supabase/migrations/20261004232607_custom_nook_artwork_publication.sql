-- Immutable custom community scenes. All new entry points remain service-only.
-- Does not publish an existing draft or delete any Storage object.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

alter table public.nooks_artwork_assets add constraint nooks_artwork_owner_generation unique(account_id,generation);
alter table public.nooks_rooms add constraint nooks_room_owner_identity unique(id,owner_id);
create table public.nooks_room_scenes (
 id uuid not null unique default gen_random_uuid(),
 nook_id uuid primary key,
 account_id uuid not null,
 generation uuid not null,
 publication_intent_id uuid not null,
 draft_id uuid not null,
 draft_revision bigint not null check(draft_revision>0),
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 appearance jsonb not null check(jsonb_typeof(appearance)='object' and octet_length(appearance::text)<=4096),
 created_at timestamptz not null default clock_timestamp(),
 unique(account_id,publication_intent_id),
 foreign key(nook_id,account_id) references public.nooks_rooms(id,owner_id),
 foreign key(account_id,generation) references public.nooks_artwork_assets(account_id,generation)
);
alter table public.nooks_room_scenes enable row level security;
revoke all on public.nooks_room_scenes from public,anon,authenticated,service_role;
grant select,insert on public.nooks_room_scenes to service_role;
create index nooks_scene_artwork on public.nooks_room_scenes(account_id,generation);
comment on table public.nooks_room_scenes is 'Immutable reviewed community scene; no client table access. Artwork remains private and reads are authorized by nook membership.';

-- Canonical representation matches sorted-key JSON used by the server. Manifests
-- below contain only integer numbers, arrays and strings; no floating point ambiguity.
create function nooks_private.canonical_publication_json(p_value jsonb) returns text
language plpgsql immutable strict security invoker set search_path='' as $$
declare result text;
begin
 if jsonb_typeof(p_value)='object' then
   select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||nooks_private.canonical_publication_json(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(p_value);
 elsif jsonb_typeof(p_value)='array' then
   select '['||coalesce(string_agg(nooks_private.canonical_publication_json(value),',' order by position),'')||']' into result from jsonb_array_elements(p_value) with ordinality x(value,position);
 else result:=p_value::text; end if;
 return result;
end $$;

create or replace function nooks_private.artwork_persisted_refs(p_account uuid default null)
returns table(account_id uuid,path text,mime text,valid boolean,canonical boolean) language sql stable security invoker set search_path='' as $$
 select w.account_id,r.* from public.nooks_workspaces w cross join lateral nooks_private.artwork_document_refs(w.account_id,w.document) r where p_account is null or w.account_id=p_account
 union all
 select s.account_id,r.* from public.nooks_shares s cross join lateral nooks_private.artwork_document_refs(s.account_id,
   case when s.snapshot ? 'space' then s.snapshot else jsonb_build_object('space',null) end) r where p_account is null or s.account_id=p_account
 union all
 select s.account_id,a.path,a.mime,a.state='ready',true from public.nooks_room_scenes s
 join public.nooks_rooms n on n.id=s.nook_id and n.archived_at is null
 join public.nooks_artwork_assets a on a.account_id=s.account_id and a.generation=s.generation
 where p_account is null or s.account_id=p_account
$$;

create function nooks_private.artwork_refresh_references(p_account uuid) returns void
language sql volatile security invoker set search_path='' as $$
 with refs as materialized(select distinct path from nooks_private.artwork_persisted_refs(p_account) where valid), desired as (
   select a.path,case when exists(select 1 from refs r where r.path=a.path) then null::timestamptz
     else coalesce(a.unreferenced_since,clock_timestamp()) end as unreferenced_since
   from public.nooks_artwork_assets a where a.account_id=p_account and a.state in ('reserved','ready')
 ) update public.nooks_artwork_assets a set unreferenced_since=d.unreferenced_since from desired d
   where a.path=d.path and a.unreferenced_since is distinct from d.unreferenced_since
$$;

create or replace function nooks_private.nook_summary(p_nook uuid,p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'visibility',r.visibility,'roomId',r.room_id,'createdAt',r.created_at,
   'memberCount',(select count(*) from public.nooks_members m where m.nook_id=r.id and m.left_at is null),
   'onlineCount',(select count(*) from public.nooks_members m where m.nook_id=r.id and m.left_at is null and m.last_seen_at>clock_timestamp()-interval '90 seconds'),
   'joined',exists(select 1 from public.nooks_members m where m.nook_id=r.id and m.account_id=p_actor and m.left_at is null),
   'role',(select m.role from public.nooks_members m where m.nook_id=r.id and m.account_id=p_actor and m.left_at is null))
   || case when s.id is null then '{}'::jsonb else jsonb_build_object('scene',jsonb_build_object('id',s.id,'snapshotHash',s.snapshot_hash)) end
 from public.nooks_rooms r left join public.nooks_room_scenes s on s.nook_id=r.id where r.id=p_nook and r.archived_at is null
$$;

create function public.nooks_nook_publish_artwork(p_actor uuid,p_intent_id uuid,p_snapshot_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w jsonb; i jsonb; d jsonb; m jsonb; appearance jsonb; a public.nooks_artwork_assets%rowtype;
 s public.nooks_room_scenes%rowtype; n public.nooks_rooms%rowtype; result jsonb; v_request uuid;
begin
 if not exists(select 1 from public.nooks_accounts where id=p_actor) then raise exception 'Verified account required' using errcode='42501'; end if;
 if p_intent_id is null or p_snapshot_hash is null or p_snapshot_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid publication identity' using errcode='22023'; end if;
 -- Same owner lock order as workspace commit. No room/focus lock precedes this.
 perform nooks_private.artwork_lock(p_actor);
 select document into w from public.nooks_workspaces where account_id=p_actor for update;
 select value into i from jsonb_array_elements(coalesce(w#>'{nookCreator,publicationIntents}','[]'::jsonb)) x where value->>'id'=p_intent_id::text;
 if i is null or not coalesce(i->>'status' in ('prepared','publishing','retry-needed','published'),false) then raise exception 'Reviewed publication unavailable' using errcode='42501'; end if;
 m:=i->'manifest';
 if i->>'snapshotHash' is distinct from p_snapshot_hash or jsonb_typeof(m) is distinct from 'object' or octet_length(m::text)>8192
   or encode(sha256(convert_to(nooks_private.canonical_publication_json(m),'UTF8')),'hex') is distinct from p_snapshot_hash then raise exception 'Publication snapshot changed' using errcode='40001'; end if;
 v_request:=(i->>'requestId')::uuid;
 if v_request is null then raise exception 'Publication request missing' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':create-nook',0));
 select * into n from public.nooks_rooms where owner_id=p_actor and request_id=v_request;
 if found then
   select * into s from public.nooks_room_scenes where nook_id=n.id;
   if s.id is null or s.publication_intent_id<>p_intent_id or s.snapshot_hash<>p_snapshot_hash then raise exception 'Publication request belongs to another snapshot' using errcode='40001'; end if;
   if n.archived_at is not null then raise exception 'Published nook has been archived' using errcode='42501'; end if;
   return jsonb_build_object('nook',nooks_private.nook_summary(n.id,p_actor),'scene',jsonb_build_object('id',s.id,'generation',s.generation,'snapshotHash',s.snapshot_hash),'duplicate',true);
 end if;
 if i->>'status'='published' then raise exception 'Published nook unavailable' using errcode='42501'; end if;
 select value into d from jsonb_array_elements(coalesce(w#>'{nookCreator,drafts}','[]'::jsonb)) x where value->>'id'=i->>'draftId';
 if d is null or d->'revision' is distinct from i->'draftRevision' or m->'draftRevision' is distinct from d->'revision' or m->'draftId' is distinct from d->'id' then raise exception 'Draft changed after review' using errcode='40001'; end if;
 appearance:=m#>'{scene,appearance}';
 if not (m ?& array['schemaVersion','draftId','draftRevision','title','description','roomId','visibility','pathTemplate','scene'])
   or jsonb_typeof(d->'revision') is distinct from 'number'
   or jsonb_typeof(i->'draftRevision') is distinct from 'number'
   or jsonb_typeof(m->'draftRevision') is distinct from 'number'
   or (d->>'revision') !~ '^[1-9][0-9]{0,14}$'
   or m->'schemaVersion' is distinct from '2'::jsonb or m->>'roomId' is distinct from 'custom' or m->>'pathTemplate' is distinct from 'none'
   or (m-array['schemaVersion','draftId','draftRevision','title','description','roomId','visibility','pathTemplate','scene'])<>'{}'::jsonb
   or jsonb_typeof(m->'title') is distinct from 'string' or length(m->>'title') not between 1 and 54 or btrim(m->>'title')<>m->>'title'
   or jsonb_typeof(m->'description') is distinct from 'string' or length(m->>'description')>220
   or m->'title' is distinct from d->'title' or m->'description' is distinct from d->'description'
   or jsonb_typeof(m->'visibility') is distinct from 'string' or m->>'visibility' not in ('public','private') or m->'visibility' is distinct from i->'visibility'
   or jsonb_typeof(m->'scene') is distinct from 'object' or ((m->'scene')-array['generation','appearance'])<>'{}'::jsonb
   or not ((m->'scene') ?& array['generation','appearance'])
   or jsonb_typeof(appearance) is distinct from 'object' or octet_length(appearance::text)>4096
   or (appearance-array['name','tagline','theme','room','accent','companion','layout','decorations'])<>'{}'::jsonb
   or appearance is distinct from ((d->'space')-array['backgroundImage','_storedBackground'])
   or jsonb_typeof(d#>'{space,_storedBackground}') is distinct from 'object'
   or ((d#>'{space,_storedBackground}')-array['path','mime'])<>'{}'::jsonb then raise exception 'Invalid reviewed scene' using errcode='22023'; end if;
 -- Permit appearance primitives only. No URL, prompt, token or image bytes can
 -- be smuggled into the immutable published appearance under an unknown key.
 if not (appearance ?& array['name','tagline','theme','accent','companion','layout','decorations'])
   or exists(select 1 from jsonb_each(appearance) x where key<>'decorations' and jsonb_typeof(value)<>'string')
   or jsonb_typeof(appearance->'decorations') is distinct from 'array'
   or jsonb_array_length(appearance->'decorations')>2
   or exists(select 1 from jsonb_array_elements(appearance->'decorations') x where x not in ('"sparkles"'::jsonb,'"stickers"'::jsonb))
   or appearance->>'theme' not in ('botanical','moonlight','sunrise','lavender','sky')
   or appearance->>'accent' not in ('#8bc8a7','#e9ab86','#b1a0d8','#8cbad1','#d7a0b1')
   or appearance->>'companion' not in ('sleepy-dog','sprout','cat','none','bunny','fox','capybara','red-panda','owl','turtle','bear','ghost')
   or appearance->>'layout' not in ('calm','focused')
   or (appearance ? 'room' and appearance->>'room' not in ('rainy-library','midnight-train','sakura-garden','seaside-studio','alpine-cabin','autumn-bookshop','moonlit-observatory','sunlit-greenhouse','neon-tokyo','paris-attic','kyoto-teahouse','brooklyn-loft','cloud-bedroom','oxford-library','lighthouse-study','tropical-veranda','mossy-watermill','aurora-cabin','autumn-camper','ricefield-porch','lakeside-boathouse','castle-study','desert-casita','underwater-study','floating-airship','moon-base','woodland-treehouse','lavender-cottage','canal-apartment','night-campus','mosslight-dungeon'))
   or appearance->>'name' is distinct from m->>'title' or appearance->>'tagline' is distinct from m->>'description' then raise exception 'Invalid scene appearance' using errcode='22023'; end if;
 select * into a from public.nooks_artwork_assets where account_id=p_actor and generation=(m#>>'{scene,generation}')::uuid for update;
 if not found or a.state<>'ready' or a.path is distinct from d#>>'{space,_storedBackground,path}' or a.mime is distinct from d#>>'{space,_storedBackground,mime}' then raise exception 'Owned artwork generation unavailable' using errcode='40001'; end if;
 -- All writes are one transaction, including owner membership and notification.
 result:=public.nooks_community(p_actor,'create_nook',jsonb_build_object('requestId',v_request,'title',m->>'title','description',m->>'description','roomId','custom','visibility',m->>'visibility'));
 insert into public.nooks_room_scenes(nook_id,account_id,generation,publication_intent_id,draft_id,draft_revision,snapshot_hash,appearance)
 values((result#>>'{nook,id}')::uuid,p_actor,a.generation,p_intent_id,(d->>'id')::uuid,(d->>'revision')::bigint,p_snapshot_hash,appearance) returning * into s;
 perform nooks_private.artwork_refresh_references(p_actor);
 return jsonb_build_object('nook',nooks_private.nook_summary(s.nook_id,p_actor),'scene',jsonb_build_object('id',s.id,'generation',s.generation,'snapshotHash',s.snapshot_hash),'duplicate',false);
end $$;

create function public.nooks_nook_scene_read(p_actor uuid,p_nook uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare n public.nooks_rooms%rowtype; s public.nooks_room_scenes%rowtype; a public.nooks_artwork_assets%rowtype;
begin
 if not exists(select 1 from public.nooks_accounts where id=p_actor) then raise exception 'Verified account required' using errcode='42501'; end if;
 -- Serialize authorization with membership removal/archive (room-before-member).
 select * into n from public.nooks_rooms where id=p_nook for share;
 if not found or n.archived_at is not null or (n.visibility<>'public' and not exists(select 1 from public.nooks_members where nook_id=p_nook and account_id=p_actor and left_at is null)) then raise exception 'Nook unavailable' using errcode='42501'; end if;
 select * into s from public.nooks_room_scenes where nook_id=p_nook;
 if not found then return jsonb_build_object('nookId',p_nook,'scene',null); end if;
 select * into a from public.nooks_artwork_assets where account_id=s.account_id and generation=s.generation and state='ready';
 if not found then raise exception 'Nook artwork unavailable' using errcode='40001'; end if;
 -- Private backend result only. Never return this object directly to the model
 -- or browser: adapter hydrates verified bytes and strips owner/storage fields.
 return jsonb_build_object('nookId',p_nook,'visibility',n.visibility,'scene',jsonb_build_object('id',s.id,'snapshotHash',s.snapshot_hash,'generation',s.generation,'appearance',s.appearance),
   'artwork',jsonb_build_object('accountId',a.account_id,'path',a.path,'mime',a.mime,'contentHash',a.content_hash));
end $$;

revoke all on function nooks_private.canonical_publication_json(jsonb),nooks_private.artwork_refresh_references(uuid),public.nooks_nook_publish_artwork(uuid,uuid,text),public.nooks_nook_scene_read(uuid,uuid) from public,anon,authenticated;
grant execute on function nooks_private.canonical_publication_json(jsonb),nooks_private.artwork_refresh_references(uuid),public.nooks_nook_publish_artwork(uuid,uuid,text),public.nooks_nook_scene_read(uuid,uuid) to service_role;

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
 if p_action='archive_nook' then
   -- Read owner without a row lock, then take the common artwork guard first.
   -- Published scene ownership is immutable; authorization is checked below.
   select owner_id into v_owner from public.nooks_rooms where id=v_nook;
   if v_owner is not null then perform nooks_private.artwork_lock(v_owner); end if;
 end if;
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
   perform nooks_private.artwork_refresh_references(v_owner);
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
   union all
   select s.account_id,'community',jsonb_build_object('_storedBackground',jsonb_build_object('path',a.path,'mime',a.mime))
   from public.nooks_room_scenes s join public.nooks_rooms n on n.id=s.nook_id and n.archived_at is null
   join public.nooks_artwork_assets a on a.account_id=s.account_id and a.generation=s.generation
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
     'communityReferences',(select count(*) from refs where valid and source='community'),
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
