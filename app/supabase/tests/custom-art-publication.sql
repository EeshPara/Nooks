-- Local-only synthetic metadata. No hosted connection or real Storage bytes.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
select nooks_test.assert((select relrowsecurity from pg_class where oid='public.nooks_room_scenes'::regclass),'scene RLS enabled');
select nooks_test.assert(not has_table_privilege('anon','public.nooks_room_scenes','select'),'anonymous scene catalog denied');
select nooks_test.assert(not has_table_privilege('authenticated','public.nooks_room_scenes','select'),'authenticated scene catalog denied');
select nooks_test.assert(not has_table_privilege('service_role','public.nooks_room_scenes','update,delete'),'scene snapshots immutable to runtime');
select nooks_test.assert(nooks_private.canonical_publication_json('{"z":null,"a":[2,"é / 🐈",{"b":true,"a":"x"}]}')='{"a":[2,"é / 🐈",{"a":"x","b":true}],"z":null}','canonical JSON ordering unicode null array vector');
do $$ declare f regprocedure; role_name text; begin
 foreach f in array array['public.nooks_nook_publish_artwork(uuid,uuid,text)'::regprocedure,'public.nooks_nook_scene_read(uuid,uuid)'::regprocedure,'nooks_private.artwork_refresh_references(uuid)'::regprocedure,'nooks_private.canonical_publication_json(jsonb)'::regprocedure] loop
   foreach role_name in array array['anon','authenticated'] loop
     if has_function_privilege(role_name,f,'execute') then raise exception 'Client can execute scene function'; end if;
   end loop;
   if not has_function_privilege('service_role',f,'execute') then raise exception 'Service scene execute grant missing'; end if;
   if (select prosecdef from pg_proc where oid=f) then raise exception 'Scene function should not bypass caller permissions'; end if;
 end loop;
end $$;
-- Helper belongs only to this rollback-only fixture transaction.
create function nooks_test.scene_fixture(actor uuid, visibility text default 'private') returns jsonb language plpgsql as $$
declare r jsonb; m jsonb; i jsonb; d jsonb; space jsonb; readback jsonb; w jsonb; id uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); h text;
begin
 r:=public.nooks_artwork_reserve(actor,encode(sha256(convert_to(id::text,'UTF8')),'hex'),'image/png',gen_random_uuid());
 perform public.nooks_artwork_complete(actor,r->>'path',(r->>'pinToken')::uuid);
 insert into storage.objects(bucket_id,name,metadata) values('nooks-private',r->>'path','{"size":123}');
 space:=jsonb_build_object('name','Bookshop 🌙','tagline','A quiet place.','theme','moonlight','room','autumn-bookshop','accent','#8bc8a7','companion','none','layout','calm','decorations','[]'::jsonb);
 d:=jsonb_build_object('id',gen_random_uuid(),'revision',1,'title',space->'name','description',space->'tagline','artworkMode','chatgpt','visibility',visibility,'space',space||jsonb_build_object('_storedBackground',jsonb_build_object('path',r->>'path','mime','image/png')));
 m:=jsonb_build_object('schemaVersion',2,'draftId',d->'id','draftRevision',1,'title',d->'title','description',d->'description','roomId','custom','visibility',visibility,'pathTemplate','none','scene',jsonb_build_object('generation',r->'generation','appearance',space));
 h:=encode(sha256(convert_to(nooks_private.canonical_publication_json(m),'UTF8')),'hex');
 i:=jsonb_build_object('id',id,'requestId',request,'draftId',d->'id','draftRevision',1,'visibility',visibility,'manifest',m,'snapshotHash',h,'status','publishing');
 readback:=public.nooks_workspace_read(actor); w:=coalesce(readback->'workspace','{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{}}'::jsonb);
 w:=jsonb_set(w,'{nookCreator}',jsonb_build_object('schemaVersion',1,'drafts',coalesce(w#>'{nookCreator,drafts}','[]')||jsonb_build_array(d),'publicationIntents',coalesce(w#>'{nookCreator,publicationIntents}','[]')||jsonb_build_array(i)));
 perform public.nooks_workspace_commit(actor,coalesce((readback->>'revision')::bigint,0),w);
 return jsonb_build_object('intentId',id,'requestId',request,'draftId',d->'id','hash',h,'asset',r,'manifest',m);
end $$;
grant execute on function nooks_test.scene_fixture(uuid,text) to service_role;
set local role service_role;
do $$
declare a uuid; b uuid; c uuid; namespace text:='sites:custom-scenes-test:'||gen_random_uuid()::text;
 f jsonb; private_f jsonb; pub jsonb; priv jsonb; result jsonb; original jsonb; r jsonb; w jsonb; readback jsonb; event_count bigint; start_time timestamptz;
 invite_one text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'); invite_two text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 private_id uuid; public_id uuid; hash_before text; revoked uuid; bad jsonb; bad_hash text; draft jsonb;
begin
 a:=(public.nooks_resolve_identity(namespace,repeat('a',64),null)->>'id')::uuid;
 b:=(public.nooks_resolve_identity(namespace,repeat('b',64),null)->>'id')::uuid;
 c:=(public.nooks_resolve_identity(namespace,repeat('c',64),null)->>'id')::uuid;
 f:=nooks_test.scene_fixture(a,'public');
 begin perform public.nooks_nook_publish_artwork(b,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Foreign intent published'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_nook_publish_artwork(a,(f->>'intentId')::uuid,repeat('f',64)); raise exception 'Mismatched hash published'; exception when serialization_failure then null; end;
 pub:=public.nooks_nook_publish_artwork(a,(f->>'intentId')::uuid,f->>'hash'); public_id:=(pub#>>'{nook,id}')::uuid;
 if pub#>>'{nook,roomId}'<>'custom' or pub->>'duplicate'<>'false' or pub#>>'{nook,role}'<>'owner' then raise exception 'Publication result incorrect'; end if;
 event_count:=(select count(*) from public.nooks_outbox where nook_id=public_id and event_type='nook.created');
 if event_count<>1 then raise exception 'Publication event not atomic'; end if;
 if public.nooks_nook_publish_artwork(a,(f->>'intentId')::uuid,f->>'hash')->>'duplicate'<>'true' or (select count(*) from public.nooks_rooms where owner_id=a)<>1 then raise exception 'Publication duplicate created new nook'; end if;
 original:=public.nooks_nook_scene_read(b,public_id);
 if original#>>'{artwork,accountId}'<>a::text or original#>>'{artwork,path}'<>f#>>'{asset,path}' then raise exception 'Public read not trusted owned asset'; end if;
 if pub::text like '%'||(f#>>'{asset,path}')||'%' or (pub->'nook')::text like '%'||a::text||'%' or pub#>'{nook,scene}' ? 'generation' then raise exception 'Directory leaks private asset'; end if;
 begin update public.nooks_room_scenes set appearance='{}' where nook_id=public_id; raise exception 'Snapshot mutated'; exception when insufficient_privilege then null; end;
 begin delete from public.nooks_room_scenes where nook_id=public_id; raise exception 'Snapshot deleted'; exception when insufficient_privilege then null; end;
 private_f:=nooks_test.scene_fixture(a,'private'); priv:=public.nooks_nook_publish_artwork(a,(private_f->>'intentId')::uuid,private_f->>'hash'); private_id:=(priv#>>'{nook,id}')::uuid;
 begin perform public.nooks_nook_scene_read(b,private_id); raise exception 'Nonmember read private artwork'; exception when insufficient_privilege then null; end;
 perform public.nooks_community(a,'create_invite',jsonb_build_object('nookId',private_id,'tokenHash',invite_one,'expiresInHours',1));
 begin perform public.nooks_nook_scene_read(b,private_id); raise exception 'Unaccepted invite granted access'; exception when insufficient_privilege then null; end;
 update public.nooks_invites set expires_at=clock_timestamp()-interval '1 second' where nook_id=private_id;
 begin perform public.nooks_community(b,'accept_invite',jsonb_build_object('tokenHash',invite_one)); raise exception 'Expired invite accepted'; exception when insufficient_privilege then null; end;
 perform public.nooks_community(a,'create_invite',jsonb_build_object('nookId',private_id,'tokenHash',invite_two,'expiresInHours',1));
 perform public.nooks_community(b,'accept_invite',jsonb_build_object('tokenHash',invite_two));
 if public.nooks_nook_scene_read(b,private_id)#>>'{artwork,path}'<>private_f#>>'{asset,path}' then raise exception 'Invited member cannot read'; end if;
 perform public.nooks_community(b,'leave_nook',jsonb_build_object('nookId',private_id));
 begin perform public.nooks_nook_scene_read(b,private_id); raise exception 'Former member retained private read'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_nook_scene_read(b,gen_random_uuid()); raise exception 'Unknown nook readable'; exception when insufficient_privilege then null; end;
 -- Delete drafts through the normal CAS transaction; the scene survives unchanged.
 readback:=public.nooks_workspace_read(a); w:=jsonb_set(readback->'workspace','{nookCreator,drafts}','[]');
 perform public.nooks_workspace_commit(a,(readback->>'revision')::bigint,w);
 if public.nooks_nook_scene_read(b,public_id) is distinct from original then raise exception 'Draft deletion changed scene'; end if;
 if public.nooks_nook_publish_artwork(a,(f->>'intentId')::uuid,f->>'hash')->>'duplicate'<>'true' then raise exception 'Retry cannot survive draft deletion'; end if;
 update public.nooks_artwork_assets set pin_until=clock_timestamp()-interval '1 day' where account_id=a;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(a,false)->'candidates')<>0 or (select count(*) from nooks_private.artwork_persisted_refs(a) where valid)<>2 then raise exception 'Community-only artwork collectible'; end if;
 if (public.nooks_artwork_inventory()#>>'{counts,communityReferences}')::integer<2 then raise exception 'Inventory omits community references'; end if;
 -- Archive releases exactly its scene; retention starts now, not upload time.
 start_time:=clock_timestamp(); perform public.nooks_community(a,'archive_nook',jsonb_build_object('nookId',public_id));
 if not (select unreferenced_since>=start_time from public.nooks_artwork_assets where path=f#>>'{asset,path}') then raise exception 'Archive retention timestamp incorrect'; end if;
 if (select unreferenced_since from public.nooks_artwork_assets where path=private_f#>>'{asset,path}') is not null then raise exception 'Archive released another nook'; end if;
 if jsonb_array_length(public.nooks_artwork_cleanup_claim(a,false)->'candidates')<>0 then raise exception 'Archive bypassed retention'; end if;
 if public.nooks_community(a,'archive_nook',jsonb_build_object('nookId',public_id))->>'duplicate'<>'true' then raise exception 'Archive retry fails'; end if;
 begin perform public.nooks_nook_scene_read(a,public_id); raise exception 'Archived scene readable'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_nook_publish_artwork(a,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Archived publication revived'; exception when insufficient_privilege then null; end;
 update public.nooks_artwork_assets set unreferenced_since=clock_timestamp()-interval '40 days' where path=f#>>'{asset,path}';
 if public.nooks_artwork_cleanup_claim(a,false)#>>'{candidates,0,path}'<>f#>>'{asset,path}' then raise exception 'Archived orphan not collectible'; end if;
 -- New fixture: stale review, wrong owned generation, and a cleanup fence fail closed.
 f:=nooks_test.scene_fixture(c,'private');
 update public.nooks_workspaces set document=jsonb_set(document,'{nookCreator,drafts,0,revision}','2') where account_id=c;
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Stale draft published'; exception when serialization_failure then null; end;
 update public.nooks_workspaces set document=jsonb_set(document,'{nookCreator,drafts,0,revision}','1') where account_id=c;
 -- All three revisions can match each other yet violate the integer JSON contract.
 bad:=jsonb_set(f->'manifest','{draftRevision}','"1"');
 bad_hash:=encode(sha256(convert_to(nooks_private.canonical_publication_json(bad),'UTF8')),'hex');
 update public.nooks_workspaces set document=jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,
   '{nookCreator,drafts,0,revision}','"1"'),'{nookCreator,publicationIntents,0,draftRevision}','"1"'),
   '{nookCreator,publicationIntents,0,manifest}',bad),'{nookCreator,publicationIntents,0,snapshotHash}',to_jsonb(bad_hash)) where account_id=c;
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,bad_hash); raise exception 'Matching string revisions published'; exception when invalid_parameter_value then null; end;
 update public.nooks_workspaces set document=jsonb_set(jsonb_set(jsonb_set(jsonb_set(document,
   '{nookCreator,drafts,0,revision}','1'),'{nookCreator,publicationIntents,0,draftRevision}','1'),
   '{nookCreator,publicationIntents,0,manifest}',f->'manifest'),'{nookCreator,publicationIntents,0,snapshotHash}',f->'hash') where account_id=c;
 update public.nooks_artwork_assets set state='deleting' where account_id=c;
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Deleting generation published'; exception when serialization_failure then null; end;
 update public.nooks_artwork_assets set state='ready' where account_id=c;
 bad:=jsonb_set(f->'manifest','{scene,generation}',private_f#>'{asset,generation}'); bad_hash:=encode(sha256(convert_to(nooks_private.canonical_publication_json(bad),'UTF8')),'hex');
 update public.nooks_workspaces set document=jsonb_set(jsonb_set(document,'{nookCreator,publicationIntents,0,manifest}',bad),'{nookCreator,publicationIntents,0,snapshotHash}',to_jsonb(bad_hash)) where account_id=c;
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,bad_hash); raise exception 'Foreign generation published'; exception when serialization_failure then null; end;
 -- Schema cannot smuggle image capabilities in unknown keys, substitute URLs
 -- for curated fallback IDs, omit required appearance fields, or skip review state.
 for bad in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_set(f->'manifest','{scene,appearance,room}','"https://private.example/image"'),
   jsonb_set(f->'manifest','{scene,appearance,token}','"secret"'),
   (f->'manifest') #- '{scene,appearance,theme}',
   (f->'manifest') || '{"scenePrompt":"private"}'::jsonb
 )) loop
   bad_hash:=encode(sha256(convert_to(nooks_private.canonical_publication_json(bad),'UTF8')),'hex');
   update public.nooks_workspaces set document=jsonb_set(jsonb_set(jsonb_set(document,'{nookCreator,publicationIntents,0,manifest}',bad),'{nookCreator,publicationIntents,0,snapshotHash}',to_jsonb(bad_hash)),
     '{nookCreator,drafts,0,space}',(bad#>'{scene,appearance}')||jsonb_build_object('_storedBackground',jsonb_build_object('path',f#>>'{asset,path}','mime','image/png'))) where account_id=c;
   begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,bad_hash); raise exception 'Invalid appearance or manifest published'; exception when invalid_parameter_value then null; end;
 end loop;
 update public.nooks_workspaces set document=jsonb_set(jsonb_set(jsonb_set(document,'{nookCreator,publicationIntents,0,manifest}',f->'manifest'),'{nookCreator,publicationIntents,0,snapshotHash}',f->'hash'),
   '{nookCreator,drafts,0,space}',(f#>'{manifest,scene,appearance}')||jsonb_build_object('_storedBackground',jsonb_build_object('path',f#>>'{asset,path}','mime','image/png'))) where account_id=c;
 update public.nooks_workspaces set document=document #- '{nookCreator,publicationIntents,0,status}' where account_id=c;
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Missing review state published'; exception when insufficient_privilege then null; end;
 update public.nooks_workspaces set document=jsonb_set(document,'{nookCreator,publicationIntents,0,status}','"publishing"') where account_id=c;
 -- Restore manifest, but collide with an existing curated request key.
 update public.nooks_workspaces set document=jsonb_set(jsonb_set(document,'{nookCreator,publicationIntents,0,manifest}',f->'manifest'),'{nookCreator,publicationIntents,0,snapshotHash}',f->'hash') where account_id=c;
 perform public.nooks_community(c,'create_nook',jsonb_build_object('requestId',f->'requestId','title','Curated','description','','roomId','rainy-library','visibility','private'));
 begin perform public.nooks_nook_publish_artwork(c,(f->>'intentId')::uuid,f->>'hash'); raise exception 'Curated idempotency collision accepted'; exception when serialization_failure then null; end;
 if (select count(*) from public.nooks_room_scenes)<>2 then raise exception 'Failed publication left scene rows'; end if;
end $$;
reset role;
select 'Custom artwork publication authorization, idempotency, retention and ACL checks passed' as result;
rollback;
