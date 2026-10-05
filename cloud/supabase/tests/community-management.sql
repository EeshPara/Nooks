-- Bounded synthetic rollback checks. No Auth users, Storage objects or external calls.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local role service_role;
do $$
declare
 namespace text := 'sites:nooks-community-management:'||gen_random_uuid()::text;
 owner_a uuid; owner_b uuid; member_id uuid; outsider uuid; created_nook uuid; old_private uuid; hidden_private uuid;
 invite_id uuid; foreign_invite uuid; active_token text; expired_token text;
 page jsonb; items jsonb := '[]'; expected jsonb; invite_ids jsonb; entry jsonb; args jsonb; archived_state jsonb;
 current_offset integer := 0; pass integer := 0;
 tied_at timestamptz := clock_timestamp()+interval '1 day';
 workspace jsonb := '{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{}}';
begin
 owner_a := (public.nooks_resolve_identity(namespace,repeat('a',64),null)->>'id')::uuid;
 owner_b := (public.nooks_resolve_identity(namespace,repeat('b',64),null)->>'id')::uuid;
 member_id := (public.nooks_resolve_identity(namespace,repeat('c',64),null)->>'id')::uuid;
 outsider := (public.nooks_resolve_identity(namespace,repeat('d',64),null)->>'id')::uuid;
 -- More than one page, while respecting the existing 50-active-nooks-per-owner cap.
 for n in 1..60 loop
   created_nook := (public.nooks_community(case when n<=30 then owner_a else owner_b end,'create_nook',
     jsonb_build_object('requestId',gen_random_uuid(),'title','Directory test '||n,'visibility','public','roomId','rainy-library'))#>>'{nook,id}')::uuid;
   update public.nooks_rooms set created_at=tied_at where id=created_nook;
 end loop;
 old_private := (public.nooks_community(owner_a,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Older joined private','visibility','private','roomId','rainy-library'))#>>'{nook,id}')::uuid;
 hidden_private := (public.nooks_community(owner_b,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Unjoined private','visibility','private','roomId','rainy-library'))#>>'{nook,id}')::uuid;
 update public.nooks_rooms set created_at=tied_at-interval '2 days' where id=old_private;
 active_token := md5(namespace||':active')||md5(':active:'||namespace);
 perform public.nooks_community(owner_a,'create_invite',jsonb_build_object('nookId',old_private,'tokenHash',active_token,'maxUses',3));
 perform public.nooks_community(member_id,'accept_invite',jsonb_build_object('tokenHash',active_token));
 select coalesce(jsonb_agg(r.id order by r.created_at desc,r.id desc),'[]'::jsonb) into expected
 from public.nooks_rooms r where r.archived_at is null and (r.visibility='public' or exists(
   select 1 from public.nooks_members m where m.nook_id=r.id and m.account_id=member_id and m.left_at is null));
 loop
   page := public.nooks_community(member_id,'list_nooks',jsonb_build_object('offset',current_offset,'limit',50));
   if page->>'offset'<>current_offset::text or page->>'limit'<>'50' or jsonb_array_length(page->'nooks')>50 then raise exception 'Invalid directory page'; end if;
   if pass=0 and (jsonb_array_length(page->'nooks')<>50 or page->>'hasMore'<>'true' or page->>'nextOffset'<>'50') then raise exception 'Directory silently truncated'; end if;
   items := items || (select coalesce(jsonb_agg(value->'id' order by ordinality),'[]'::jsonb) from jsonb_array_elements(page->'nooks') with ordinality);
   exit when (page->>'hasMore')::boolean is false;
   if (page->>'nextOffset')::integer<>current_offset+50 then raise exception 'Invalid next directory offset'; end if;
   current_offset := (page->>'nextOffset')::integer; pass := pass+1;
   if pass>10 then raise exception 'Directory paging did not terminate'; end if;
 end loop;
 if items is distinct from expected or page->'nextOffset'<>'null'::jsonb then raise exception 'Directory lost, duplicated, leaked or misordered a nook'; end if;
 page := public.nooks_community(member_id,'list_nooks','{"joinedOnly":true}');
 if jsonb_array_length(page->'nooks')<>1 or page#>>'{nooks,0,id}'<>old_private::text or page->>'hasMore'<>'false' then raise exception 'Joined directory missed older private nook'; end if;
 if jsonb_array_length(public.nooks_community(outsider,'list_nooks','{"joinedOnly":true}')->'nooks')<>0 then raise exception 'Joined directory exposed another membership'; end if;
 page := public.nooks_community(member_id,'list_nooks','{"offset":100000}');
 if page->'nooks'<>'[]'::jsonb or page->>'hasMore'<>'false' or page->'nextOffset'<>'null'::jsonb then raise exception 'Empty page has invalid continuation'; end if;
 foreach args in array array['{"joinedOnly":"true"}'::jsonb,'{"joinedOnly":null}'::jsonb,'{"offset":-1}'::jsonb,'{"limit":51}'::jsonb] loop
   begin perform public.nooks_community(member_id,'list_nooks',args); raise exception 'Invalid directory args accepted'; exception when invalid_parameter_value then null; end;
 end loop;
 -- Bound invitation history too, and assert an exact public metadata allowlist.
 for n in 1..51 loop
   perform public.nooks_community(owner_a,'create_invite',jsonb_build_object('nookId',old_private,
     'tokenHash',md5(namespace||n)||md5(n||namespace),'maxUses',1));
 end loop;
 update public.nooks_invites set created_at=tied_at where nook_id=old_private;
 select jsonb_agg(id order by created_at desc,id desc) into invite_ids from public.nooks_invites where nook_id=old_private;
 page := public.nooks_community(owner_a,'list_invites',jsonb_build_object('nookId',old_private));
 if jsonb_array_length(page->'invites')<>50 or page->>'hasMore'<>'true' or page->>'nextOffset'<>'50' then raise exception 'Invitation history silently truncated'; end if;
 items := page->'invites';
 page := public.nooks_community(owner_a,'list_invites',jsonb_build_object('nookId',old_private,'offset',50));
 if jsonb_array_length(page->'invites')<>2 or page->>'hasMore'<>'false' or page->'nextOffset'<>'null'::jsonb then raise exception 'Invitation final page invalid'; end if;
 items := items || (page->'invites');
 if (select jsonb_agg(value->'id' order by ordinality) from jsonb_array_elements(items) with ordinality) is distinct from invite_ids then raise exception 'Invitations lost or misordered'; end if;
 for entry in select value from jsonb_array_elements(items) loop
   if (select array_agg(key order by key) from jsonb_object_keys(entry) key) is distinct from array['expiresAt','id','maxUses','nookId','revokedAt','uses']::text[] then raise exception 'Invitation metadata exposed extra fields'; end if;
   if entry->>'nookId'<>old_private::text then raise exception 'Invitation crossed nook'; end if;
 end loop;
 begin perform public.nooks_community(member_id,'list_invites',jsonb_build_object('nookId',old_private)); raise exception 'Member listed owner invites'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(outsider,'list_invites',jsonb_build_object('nookId',old_private)); raise exception 'Outsider listed invites'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(owner_b,'list_invites',jsonb_build_object('nookId',old_private)); raise exception 'Other owner listed invites'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(owner_a,'list_invites',jsonb_build_object('nookId',old_private,'limit',51)); raise exception 'Unbounded invitation page accepted'; exception when invalid_parameter_value then null; end;
 invite_id := (select id from public.nooks_invites where token_hash=active_token);
 foreign_invite := (public.nooks_community(owner_b,'create_invite',jsonb_build_object('nookId',hidden_private,'tokenHash',md5(namespace||':foreign')||md5(':foreign:'||namespace)))#>>'{invite,id}')::uuid;
 if (public.nooks_community(owner_a,'revoke_invite',jsonb_build_object('nookId',old_private,'inviteId',foreign_invite))->>'revoked')::boolean is distinct from false then raise exception 'Revoke crossed nook'; end if;
 begin perform public.nooks_community(member_id,'revoke_invite',jsonb_build_object('nookId',old_private,'inviteId',invite_id)); raise exception 'Member revoked invite'; exception when insufficient_privilege then null; end;
 if (public.nooks_community(owner_a,'revoke_invite',jsonb_build_object('nookId',old_private,'inviteId',invite_id))->>'revoked')::boolean is distinct from true then raise exception 'Owner revoke failed'; end if;
 begin perform public.nooks_community(outsider,'accept_invite',jsonb_build_object('tokenHash',active_token)); raise exception 'Revoked invite accepted'; exception when insufficient_privilege then null; end;
 -- Revocation stops new use, not an already accepted membership.
 if not exists(select 1 from public.nooks_members where nook_id=old_private and account_id=member_id and left_at is null) then raise exception 'Revoking invite removed joined member'; end if;
 select token_hash into expired_token from public.nooks_invites where nook_id=old_private and id<>invite_id order by id limit 1;
 update public.nooks_invites set expires_at=clock_timestamp()-interval '1 second' where token_hash=expired_token;
 begin perform public.nooks_community(outsider,'accept_invite',jsonb_build_object('tokenHash',expired_token)); raise exception 'Expired invite accepted'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(member_id,'archive_nook',jsonb_build_object('nookId',old_private)); raise exception 'Member archived nook'; exception when insufficient_privilege then null; end;
 workspace := jsonb_set(workspace,'{focusSessions}',jsonb_build_array(jsonb_build_object('id','community-management-active','nookId',old_private,'roomId','rainy-library','targetMinutes',2)));
 perform public.nooks_workspace_commit(member_id,0,workspace);
 if (public.nooks_community(owner_a,'archive_nook',jsonb_build_object('nookId',old_private))->>'archived')::boolean is distinct from true then raise exception 'Owner archive failed'; end if;
 if exists(select 1 from public.nooks_members where nook_id=old_private and left_at is null) or not exists(select 1 from public.nooks_shared_focus where nook_id=old_private and account_id=member_id and status='cancelled' and active_started_at is null) then raise exception 'Archive failed to revoke memberships or stop focus'; end if;
 archived_state := jsonb_build_object('room',(select to_jsonb(r) from public.nooks_rooms r where id=old_private),'focus',(select to_jsonb(f) from public.nooks_shared_focus f where nook_id=old_private and account_id=member_id),'events',(select count(*) from public.nooks_outbox where nook_id=old_private));
 page := public.nooks_community(owner_a,'archive_nook',jsonb_build_object('nookId',old_private));
 if page->>'archived'<>'true' or page->>'duplicate'<>'true' or page->>'nookId'<>old_private::text then raise exception 'Lost archive response cannot be retried'; end if;
 if archived_state is distinct from jsonb_build_object('room',(select to_jsonb(r) from public.nooks_rooms r where id=old_private),'focus',(select to_jsonb(f) from public.nooks_shared_focus f where nook_id=old_private and account_id=member_id),'events',(select count(*) from public.nooks_outbox where nook_id=old_private)) then raise exception 'Archive retry changed data or emitted an event'; end if;
 begin perform public.nooks_community(member_id,'archive_nook',jsonb_build_object('nookId',old_private)); raise exception 'Former member archived nook again'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(owner_b,'archive_nook',jsonb_build_object('nookId',old_private)); raise exception 'Other owner archived nook again'; exception when insufficient_privilege then null; end;
 if jsonb_array_length(public.nooks_community(member_id,'list_nooks','{"joinedOnly":true}')->'nooks')<>0 then raise exception 'Archived nook remained joined'; end if;
 select token_hash into active_token from public.nooks_invites where nook_id=old_private and revoked_at is null and expires_at>clock_timestamp() order by id limit 1;
 begin perform public.nooks_community(outsider,'accept_invite',jsonb_build_object('tokenHash',active_token)); raise exception 'Archived nook invite accepted'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_community(owner_a,'list_invites',jsonb_build_object('nookId',old_private)); raise exception 'Archived nook owner listing accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Community pagination, invitation isolation, revoke and archive checks passed' as result;
rollback;
