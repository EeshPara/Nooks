-- LOCAL-ONLY synthetic Storage metadata. No actual object upload/delete occurs.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
select nooks_test.assert(not has_table_privilege('anon','public.nooks_artwork_assets','select'),'anonymous catalog denied');
select nooks_test.assert(not has_table_privilege('authenticated','public.nooks_artwork_assets','select'),'client catalog denied');
select nooks_test.assert(not has_table_privilege('service_role','public.nooks_artwork_assets','delete'),'service cannot purge generation tombstones');
do $$ declare f regprocedure; role_name text; begin
 foreach f in array array['public.nooks_artwork_reserve(uuid,text,text,uuid)'::regprocedure,'public.nooks_artwork_complete(uuid,text,uuid)'::regprocedure,
   'public.nooks_artwork_cleanup_claim(uuid,boolean,integer,integer,integer)'::regprocedure,'public.nooks_artwork_cleanup_ack(uuid,text,uuid,boolean)'::regprocedure,
   'nooks_private.artwork_lock(uuid)'::regprocedure,'nooks_private.artwork_document_refs(uuid,jsonb)'::regprocedure,
   'nooks_private.artwork_persisted_refs(uuid)'::regprocedure,'nooks_private.artwork_validate(uuid,jsonb)'::regprocedure] loop
   foreach role_name in array array['anon','authenticated'] loop
     if has_function_privilege(role_name,f,'execute') then raise exception 'Client can execute lifecycle function'; end if;
   end loop;
   if not has_function_privilege('service_role',f,'execute') then raise exception 'Service lifecycle execute grant missing'; end if;
 end loop;
end $$;
set local role service_role;
do $$
declare
 namespace text:='sites:nooks-artwork-lifecycle:'||gen_random_uuid()::text;
 a uuid; b uuid; reservation_request uuid:=gen_random_uuid(); share_id uuid:=gen_random_uuid();
 r jsonb; r2 jsonb; saved jsonb; candidate jsonb; result jsonb; state_before jsonb;
 revision bigint:=0; path text; token uuid; foreign_path text; unknown_path text; old_token uuid;
 workspace jsonb:='{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{}}';
begin
 a:=(public.nooks_resolve_identity(namespace,repeat('a',64),null)->>'id')::uuid;
 b:=(public.nooks_resolve_identity(namespace,repeat('b',64),null)->>'id')::uuid;
 r:=public.nooks_artwork_reserve(a,repeat('a',64),'image/png',reservation_request);
 path:=r->>'path'; token:=(r->>'pinToken')::uuid;
 if path<>a::text||'/'||repeat('a',64)||'/'||(r->>'generation') or r->>'state'<>'reserved' then raise exception 'Immutable generation reservation invalid'; end if;
 if public.nooks_artwork_reserve(a,repeat('a',64),'image/png',reservation_request) is distinct from r then raise exception 'Lost reserve response not idempotent'; end if;
 begin perform public.nooks_artwork_reserve(a,repeat('b',64),'image/png',reservation_request); raise exception 'Reservation hash changed'; exception when invalid_parameter_value then null; end;
 begin perform public.nooks_artwork_reserve(a,repeat('a',64),'image/jpeg',reservation_request); raise exception 'Reservation MIME changed'; exception when invalid_parameter_value then null; end;
 workspace:=jsonb_set(workspace,'{space}',jsonb_build_object('_storedBackground',jsonb_build_object('path',path,'mime','image/png')));
 begin perform public.nooks_workspace_commit(a,0,workspace); raise exception 'Unconfirmed upload attached'; exception when serialization_failure then null; end;
 if public.nooks_artwork_complete(b,path,token)->>'accepted'<>'false' or public.nooks_artwork_complete(a,path,gen_random_uuid())->>'accepted'<>'false' then raise exception 'Foreign or stale pin completed'; end if;
 if public.nooks_artwork_complete(a,path,token)->>'accepted'<>'true' or public.nooks_artwork_complete(a,path,token)->>'accepted'<>'true' then raise exception 'Upload confirmation not retry-safe'; end if;
 insert into storage.objects(bucket_id,name,metadata) values('nooks-private',path,'{"size":100}');
 saved:=public.nooks_workspace_commit(a,revision,workspace); revision:=revision+1;
 if saved->>'committed'<>'true' or (select unreferenced_since from public.nooks_artwork_assets where account_id=a and request_id=reservation_request) is not null then raise exception 'Live reference was not registered'; end if;
 -- First create an immutable appearance share, then remove the original workspace reference.
 perform public.nooks_workspace_commit(a,revision,workspace,jsonb_build_array(jsonb_build_object('kind','publish','id',share_id,'snapshot',jsonb_build_object('id',share_id,'space',workspace->'space')))); revision:=revision+1;
 workspace:=workspace-'space';
 perform public.nooks_workspace_commit(a,revision,workspace); revision:=revision+1;
 update public.nooks_artwork_assets set pin_until=clock_timestamp()-interval '1 hour' where account_id=a;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(a,false)->'candidates')<>0 then raise exception 'Share-only artwork was collectible'; end if;
 perform public.nooks_workspace_commit(a,revision,workspace,jsonb_build_array(jsonb_build_object('kind','revoke','id',share_id))); revision:=revision+1;
 if not coalesce((select unreferenced_since from public.nooks_artwork_assets where account_id=a and request_id=reservation_request)>=clock_timestamp()-interval '1 minute',false) then raise exception 'Last reference removal did not begin a fresh retention period'; end if;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(a,false)->'candidates')<>0 then raise exception 'Just-removed artwork bypassed retention'; end if;
 -- Fixtures time-travel only in the disposable DB; retention APIs have a one-day minimum.
 update public.nooks_artwork_assets set unreferenced_since=clock_timestamp()-interval '40 days' where account_id=a;
 select to_jsonb(x) into state_before from public.nooks_artwork_assets x where account_id=a;
 result:=public.nooks_artwork_cleanup_claim(a);
 if result->>'dryRun'<>'true' or result->>'bucket'<>'nooks-private' or jsonb_array_length(result->'candidates')<>1 or result#>'{candidates,0}' ? 'claimToken' then raise exception 'Cleanup does not default to inert dry-run'; end if;
 if state_before is distinct from (select to_jsonb(x) from public.nooks_artwork_assets x where account_id=a) then raise exception 'Dry-run mutated catalog'; end if;
 candidate:=public.nooks_artwork_cleanup_claim(a,false)#>'{candidates,0}';
 if candidate->>'path'<>path or candidate->>'state'<>'deleting' then raise exception 'Cleanup did not fence exact generation'; end if;
 old_token:=(candidate->>'claimToken')::uuid;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(a,false)->'candidates')<>0 then raise exception 'Live deletion lease claimed twice'; end if;
 -- Model a lost claim response: its fence persists, and only an expired lease can be replaced.
 update public.nooks_artwork_assets set lease_until=clock_timestamp()-interval '1 second' where account_id=a;
 candidate:=public.nooks_artwork_cleanup_claim(a,false)#>'{candidates,0}';
 if candidate->>'path'<>path or candidate->>'claimToken'=old_token::text or public.nooks_artwork_cleanup_ack(a,path,old_token,false)->>'acknowledged'<>'false' then raise exception 'Lost claim response cannot be retried safely'; end if;
 old_token:=(candidate->>'claimToken')::uuid;
 workspace:=jsonb_set(workspace,'{space}',jsonb_build_object('_storedBackground',jsonb_build_object('path',path,'mime','image/png')));
 begin perform public.nooks_workspace_commit(a,revision,workspace); raise exception 'Deleting generation reattached'; exception when serialization_failure then null; end;
 begin perform public.nooks_workspace_commit(a,revision,workspace-'space',jsonb_build_array(jsonb_build_object('kind','publish','id',gen_random_uuid(),'snapshot',jsonb_build_object('space',workspace->'space')))); raise exception 'Deleting generation shared'; exception when serialization_failure then null; end;
 if public.nooks_artwork_complete(a,path,token)->>'accepted'<>'false' then raise exception 'Late upload confirmation reopened fence'; end if;
 begin perform public.nooks_artwork_reserve(a,repeat('a',64),'image/png',reservation_request); raise exception 'Fenced request revived'; exception when serialization_failure then null; end;
 if public.nooks_artwork_cleanup_ack(a,path,old_token,true)->>'acknowledged'<>'false' then raise exception 'Object still present acknowledged deleted'; end if;
 if public.nooks_artwork_cleanup_ack(a,path,old_token,false)->>'acknowledged'<>'true' then raise exception 'Failed deletion not recorded'; end if;
 select to_jsonb(x) into state_before from public.nooks_artwork_assets x where account_id=a;
 if public.nooks_artwork_cleanup_ack(a,path,old_token,false)->>'duplicate'<>'true' or state_before is distinct from (select to_jsonb(x) from public.nooks_artwork_assets x where account_id=a) then raise exception 'Lost failure ack changed retry schedule'; end if;
 update public.nooks_artwork_assets set available_at=clock_timestamp()-interval '1 second' where account_id=a;
 candidate:=public.nooks_artwork_cleanup_claim(a,false)#>'{candidates,0}';
 if candidate->>'path'<>path or candidate->>'claimToken'=old_token::text then raise exception 'Retry lost exact generation or reused lease'; end if;
 if public.nooks_artwork_cleanup_ack(a,path,old_token,true)->>'acknowledged'<>'false' then raise exception 'Stale cleanup lease acknowledged'; end if;
 -- Simulated Storage API success: only this LOCAL test stub removes metadata.
 delete from storage.objects where bucket_id='nooks-private' and name=path;
 token:=(candidate->>'claimToken')::uuid;
 if public.nooks_artwork_cleanup_ack(a,path,token,true)->>'state'<>'deleted' then raise exception 'Confirmed deletion not tombstoned'; end if;
 select to_jsonb(x) into state_before from public.nooks_artwork_assets x where account_id=a;
 if public.nooks_artwork_cleanup_ack(a,path,token,true)->>'duplicate'<>'true' or state_before is distinct from (select to_jsonb(x) from public.nooks_artwork_assets x where account_id=a) then raise exception 'Lost success ack changed tombstone'; end if;
 r2:=public.nooks_artwork_reserve(a,repeat('a',64),'image/png',gen_random_uuid());
 if r2->>'path'=path then raise exception 'Deleted address reused for same bytes'; end if;
 perform public.nooks_artwork_complete(a,r2->>'path',(r2->>'pinToken')::uuid);
 workspace:=jsonb_set(workspace,'{space,_storedBackground,path}',r2->'path');
 perform public.nooks_workspace_commit(a,revision,workspace); revision:=revision+1;
 -- A timed-out old PUT may arrive after confirmed deletion; re-sweep its tombstone.
 insert into storage.objects(bucket_id,name,metadata) values('nooks-private',path,'{"size":100}');
 update public.nooks_artwork_assets set available_at=clock_timestamp()-interval '1 second' where account_id=a and state='deleted';
 candidate:=public.nooks_artwork_cleanup_claim(a,false)#>'{candidates,0}';
 if candidate->>'path'<>path or candidate->>'state'<>'deleted' then raise exception 'Late old upload is not retry-collectible'; end if;
 if (public.nooks_workspace_read(a)#>>'{workspace,space,_storedBackground,path}')<>r2->>'path' then raise exception 'Old-generation sweep affected new generation'; end if;
 -- Existing owned legacy objects remain noncollectible; references continue to save.
 foreign_path:=b::text||'/'||repeat('b',64);
 workspace:=jsonb_set(workspace,'{space,_storedBackground,path}',to_jsonb(a::text||'/'||repeat('c',64)));
 perform public.nooks_workspace_commit(a,revision,workspace); revision:=revision+1;
 insert into storage.objects(bucket_id,name,metadata) values('nooks-private',a::text||'/'||repeat('c',64),'{"size":42}');
 result:=public.nooks_artwork_cleanup_claim(a);
 if exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=a::text||'/'||repeat('c',64)) then raise exception 'Legacy object became collectible'; end if;
 begin perform public.nooks_workspace_commit(a,revision,jsonb_set(workspace,'{space,_storedBackground,path}',to_jsonb(foreign_path))); raise exception 'Foreign owned ref accepted'; exception when invalid_parameter_value then null; end;
 -- Quarantine both source and target of an already-corrupt foreign reference.
 insert into public.nooks_workspaces(account_id,document) values(b,jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',r2->>'path','mime','image/png'))));
 if public.nooks_artwork_cleanup_claim(a,false)->>'quarantined'<>'true' or public.nooks_artwork_cleanup_claim(b,false)->>'quarantined'<>'true' then raise exception 'Uncertain reference owner was not quarantined'; end if;
 -- Expired pending uploads cannot be confirmed or revived; live pins protect unreferenced rows.
 r:=public.nooks_artwork_reserve(b,repeat('d',64),'image/png',gen_random_uuid());
 update public.nooks_workspaces set document='{}' where account_id=b;
 update public.nooks_artwork_assets set unreferenced_since=clock_timestamp()-interval '40 days' where account_id=b;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(b,false)->'candidates')<>0 then raise exception 'Live upload pin was collected'; end if;
 update public.nooks_artwork_assets set pin_until=clock_timestamp()-interval '1 second' where account_id=b;
 if public.nooks_artwork_complete(b,r->>'path',(r->>'pinToken')::uuid)->>'accepted'<>'false' then raise exception 'Expired upload pin completed'; end if;
 begin perform public.nooks_artwork_reserve(b,repeat('d',64),'image/png',(select asset.request_id from public.nooks_artwork_assets asset where asset.account_id=b and asset.path=r->>'path')); raise exception 'Expired reservation renewed'; exception when serialization_failure then null; end;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(b,false)->'candidates')<>1 then raise exception 'Expired abandoned upload not eligible'; end if;
 begin perform public.nooks_artwork_cleanup_claim(a,false,51); raise exception 'Oversize cleanup batch accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.nooks_artwork_cleanup_claim(a,false,1,0); raise exception 'Zero retention accepted'; exception when invalid_parameter_value then null; end;
 result:=public.nooks_artwork_inventory();
 if not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=path) then raise exception 'Inventory cannot see generation paths'; end if;
end $$;
do $$
declare owner_id uuid; other_owner uuid; first_request uuid:=gen_random_uuid(); initial jsonb; retry jsonb; account_count integer;
 namespace text:='sites:nooks-artwork-quota:'||gen_random_uuid()::text;
begin
 owner_id:=(public.nooks_resolve_identity(namespace,repeat('e',64),null)->>'id')::uuid;
 other_owner:=(public.nooks_resolve_identity(namespace,repeat('f',64),null)->>'id')::uuid;
 initial:=public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',first_request);
 for n in 2..100 loop perform public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid()); end loop;
 begin perform public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid()); raise exception 'Daily new-generation quota bypassed'; exception when program_limit_exceeded then null; end;
 retry:=public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',first_request);
 if retry is distinct from initial or (select count(*) from public.nooks_artwork_assets where account_id=owner_id)<>100 then raise exception 'Reserve retry consumed another quota slot'; end if;
 perform public.nooks_artwork_reserve(other_owner,repeat('a',64),'image/png',gen_random_uuid());
 update public.nooks_artwork_assets set created_at=clock_timestamp()-interval '2 days' where account_id=owner_id;
 for n in 101..128 loop perform public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid()); end loop;
 begin perform public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid()); raise exception 'Retained-generation quota bypassed'; exception when program_limit_exceeded then null; end;
 update public.nooks_artwork_assets set state='deleting' where account_id=owner_id and request_id=first_request;
 begin perform public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid()); raise exception 'Pending deletion prematurely freed quota'; exception when program_limit_exceeded then null; end;
 update public.nooks_artwork_assets set state='deleted' where account_id=owner_id and request_id=first_request;
 retry:=public.nooks_artwork_reserve(owner_id,repeat('a',64),'image/png',gen_random_uuid());
 if retry->>'path'=initial->>'path' or (select count(*) from public.nooks_artwork_assets where account_id=owner_id and state<>'deleted')<>128 then raise exception 'Tombstone quota release reused address or counted incorrectly'; end if;
end $$;
reset role;
select 'Artwork reservation, fencing, retention, tombstone, legacy and share checks passed' as result;
rollback;
