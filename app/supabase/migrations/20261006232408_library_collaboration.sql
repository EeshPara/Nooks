begin;
create table public.nooks_library_shares (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.nooks_accounts(id),
 kind text not null check(kind in ('course','material')), target_id text not null,
 permission text not null default 'view' check(permission in ('view','comment','edit')),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'), revoked boolean not null default false,
 created_at timestamptz not null default clock_timestamp(), unique(owner_id,kind,target_id)
);
create table public.nooks_library_members (
 share_id uuid not null references public.nooks_library_shares(id) on delete cascade,
 account_id uuid not null references public.nooks_accounts(id), primary key(share_id,account_id)
);
create table public.nooks_library_comments (
 id uuid primary key default gen_random_uuid(), share_id uuid not null references public.nooks_library_shares(id) on delete cascade,
 account_id uuid not null references public.nooks_accounts(id), artifact_id text not null,
 body text not null check(length(body) between 1 and 4000), created_at timestamptz not null default clock_timestamp()
);
create index nooks_library_member_account on public.nooks_library_members(account_id);
create index nooks_library_comment_share on public.nooks_library_comments(share_id,created_at);
alter table public.nooks_library_shares enable row level security;
alter table public.nooks_library_members enable row level security;
alter table public.nooks_library_comments enable row level security;
revoke all on public.nooks_library_shares,public.nooks_library_members,public.nooks_library_comments from public,anon,authenticated;
grant select,insert,update,delete on public.nooks_library_shares,public.nooks_library_members,public.nooks_library_comments to service_role;

-- Service-only entry point. p_account is the verified Nooks identity, never browser input.
create function public.nooks_library_action(p_account uuid,p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.nooks_library_shares%rowtype; w public.nooks_workspaces%rowtype;
 role_name text; target jsonb; payload jsonb; old jsonb; materials jsonb; comments jsonb;
 sid uuid; item_id text; count_items integer; stamp text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if not exists(select 1 from public.nooks_accounts where id=p_account) then raise exception 'Verified account required' using errcode='42501'; end if;
 if p_action='list' then
  return jsonb_build_object('shares',coalesce((select jsonb_agg(jsonb_build_object('id',sh.id,'kind',sh.kind,'targetId',sh.target_id,'permission',case when sh.owner_id=p_account then 'owner' else sh.permission end,'owned',sh.owner_id=p_account,'title',case when sh.kind='course' then (select c->>'title' from public.nooks_workspaces w,jsonb_array_elements(w.document->'organization'->'courses') c where w.account_id=sh.owner_id and c->>'id'=sh.target_id) else (select a.payload->>'title' from public.nooks_artifacts a where a.account_id=sh.owner_id and a.id=sh.target_id) end) order by sh.created_at desc) from public.nooks_library_shares sh where not sh.revoked and (sh.owner_id=p_account or exists(select 1 from public.nooks_library_members m where m.share_id=sh.id and m.account_id=p_account))),'[]'::jsonb));
 end if;
 if p_action='create' then
  if p_args->>'kind' not in ('course','material') or p_args->>'permission' not in ('view','comment','edit') or p_args->>'tokenHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid sharing request' using errcode='22023'; end if;
  select * into w from public.nooks_workspaces where account_id=p_account for update;
  if p_args->>'kind'='course' then select c into target from jsonb_array_elements(w.document->'organization'->'courses') c where c->>'id'=p_args->>'targetId' and coalesce((c->>'archived')::boolean,false)=false;
  else select a.payload into target from public.nooks_artifacts a where a.account_id=p_account and a.id=p_args->>'targetId'; end if;
  if target is null then raise exception 'Course or material not found' using errcode='P0002'; end if;
  insert into public.nooks_library_shares(owner_id,kind,target_id,permission,token_hash) values(p_account,p_args->>'kind',p_args->>'targetId',p_args->>'permission',p_args->>'tokenHash')
  on conflict(owner_id,kind,target_id) do update set permission=excluded.permission,token_hash=excluded.token_hash,revoked=false returning * into s;
  return jsonb_build_object('share',jsonb_build_object('id',s.id,'targetId',s.target_id,'kind',s.kind,'title',target->>'title','permission',s.permission,'owned',true));
 end if;
 sid := (p_args->>'shareId')::uuid;
 select * into s from public.nooks_library_shares where id=sid for update;
 if not found or s.revoked then raise exception 'This share is no longer available' using errcode='P0002'; end if;
 if p_action='join' then
  if p_args->>'tokenHash' is distinct from s.token_hash then raise exception 'This invitation is no longer valid' using errcode='42501'; end if;
  insert into public.nooks_library_members(share_id,account_id) values(s.id,p_account) on conflict do nothing;
 end if;
 if s.owner_id=p_account then role_name:='owner';
 elsif exists(select 1 from public.nooks_library_members where share_id=s.id and account_id=p_account) then role_name:=s.permission;
 else raise exception 'You do not have access to this shared material' using errcode='42501'; end if;
 if p_action='revoke' then
  if role_name<>'owner' then raise exception 'Only the owner can stop sharing' using errcode='42501'; end if;
  update public.nooks_library_shares set revoked=true where id=s.id;
  delete from public.nooks_library_members where share_id=s.id;
  return jsonb_build_object('revoked',true);
 end if;
 select * into w from public.nooks_workspaces where account_id=s.owner_id for update;
 if s.kind='course' then select c into target from jsonb_array_elements(w.document->'organization'->'courses') c where c->>'id'=s.target_id and coalesce((c->>'archived')::boolean,false)=false;
 else select a.payload into target from public.nooks_artifacts a where a.account_id=s.owner_id and a.id=s.target_id; end if;
 if target is null then raise exception 'Course or material no longer available' using errcode='P0002'; end if;
 if p_action='save' then
  if role_name not in ('owner','edit') then raise exception 'Edit permission is required' using errcode='42501'; end if;
  payload:=p_args->'artifact'; item_id:=payload->>'id';
  if jsonb_typeof(payload) is distinct from 'object' or payload->>'kind' not in ('note','flashcards','quiz','exam') or item_id is null or length(item_id) not between 1 and 128 or item_id in ('__proto__','constructor','prototype') or octet_length(payload::text)>1048576 then raise exception 'Invalid material' using errcode='22023'; end if;
  select a.payload into old from public.nooks_artifacts a where a.account_id=s.owner_id and a.id=item_id;
  if old is not null and (case when s.kind='course' then old->>'courseId' is distinct from s.target_id else item_id<>s.target_id end) then raise exception 'Material is outside this shared folder' using errcode='42501'; end if;
  if s.kind='material' and item_id<>s.target_id then raise exception 'Cannot add to a shared file' using errcode='42501'; end if;
  if old is not null and coalesce((old->>'revision')::integer,1) is distinct from (p_args->>'expectedRevision')::integer then raise exception 'Material changed. Reload before saving' using errcode='40001'; end if;
  if old is null then select count(*) into count_items from public.nooks_artifacts where account_id=s.owner_id; if count_items>=1000 then raise exception 'Library is full' using errcode='54000'; end if; end if;
  if coalesce((select sum(octet_length(a.payload::text)) from public.nooks_artifacts a where a.account_id=s.owner_id and a.id<>item_id),0) + octet_length(payload::text) + octet_length(w.document::text)>16777216 then raise exception 'Workspace storage limit reached' using errcode='54000'; end if;
  payload := payload - array['courseId','topicId','revision','createdAt','updatedAt'] || jsonb_build_object('revision',coalesce((old->>'revision')::integer,0)+1,'createdAt',coalesce(old->>'createdAt',stamp),'updatedAt',stamp);
  if s.kind='course' then payload:=payload||jsonb_build_object('courseId',s.target_id); else payload:=payload|| (old - array['id','kind','title','subject','color','favorite','description','source','content','cards','questions','revision','createdAt','updatedAt']); end if;
  insert into public.nooks_artifacts(account_id,id,kind,payload,position) values(s.owner_id,item_id,payload->>'kind',payload,coalesce((select max(position)+1 from public.nooks_artifacts where account_id=s.owner_id),1)) on conflict(account_id,id) do update set kind=excluded.kind,payload=excluded.payload;
  update public.nooks_workspaces set revision=revision+1,updated_at=clock_timestamp() where account_id=s.owner_id;
 elsif p_action='comment' then
  if role_name not in ('owner','edit','comment') then raise exception 'Comment permission is required' using errcode='42501'; end if;
  item_id:=p_args->>'artifactId';
  if not exists(select 1 from public.nooks_artifacts a where a.account_id=s.owner_id and a.id=item_id and (case when s.kind='course' then a.payload->>'courseId'=s.target_id else a.id=s.target_id end)) then raise exception 'Material is outside this share' using errcode='42501'; end if;
  if length(trim(p_args->>'body')) not between 1 and 4000 or p_args->>'body' is null then raise exception 'Write a comment of up to 4000 characters' using errcode='22023'; end if;
  insert into public.nooks_library_comments(share_id,account_id,artifact_id,body) values(s.id,p_account,item_id,trim(p_args->>'body'));
 elsif p_action not in ('get','join') then raise exception 'Unknown sharing action' using errcode='22023'; end if;
 select coalesce(jsonb_agg(a.payload order by a.position),'[]'::jsonb) into materials from public.nooks_artifacts a where a.account_id=s.owner_id and (case when s.kind='course' then a.payload->>'courseId'=s.target_id else a.id=s.target_id end);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'artifactId',c.artifact_id,'body',c.body,'createdAt',c.created_at,'author',coalesce(p.display_name,'Student')) order by c.created_at),'[]'::jsonb) into comments from (select * from public.nooks_library_comments where share_id=s.id order by created_at desc limit 200) c left join public.nooks_profiles p on p.account_id=c.account_id;
 return jsonb_build_object('share',jsonb_build_object('id',s.id,'kind',s.kind,'targetId',s.target_id,'title',target->>'title','permission',role_name,'owned',role_name='owner'),'materials',materials,'comments',comments,'artifact',payload);
end $$;
revoke all on function public.nooks_library_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nooks_library_action(uuid,text,jsonb) to service_role;
commit;
