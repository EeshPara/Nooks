-- Synthetic metadata only. Never uploads, downloads, removes or mutates real objects.
-- All fixture changes roll back. Platform Storage writes below are LOCAL TEST STUBS ONLY.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
select nooks_test.assert(not has_function_privilege('anon','public.nooks_artwork_inventory(integer,text)','execute'),'anonymous inventory denied');
select nooks_test.assert(not has_function_privilege('authenticated','public.nooks_artwork_inventory(integer,text)','execute'),'authenticated inventory denied');
select nooks_test.assert(has_function_privilege('service_role','public.nooks_artwork_inventory(integer,text)','execute'),'operator inventory granted');
select nooks_test.assert((select not prosecdef and provolatile='s' from pg_proc where oid='public.nooks_artwork_inventory(integer,text)'::regprocedure),'inventory is read-only invoker');
set local role service_role;
do $$
declare
 namespace text := 'sites:nooks-inventory:'||gen_random_uuid()::text;
 owner_a uuid; owner_b uuid; owner_c uuid; unknown_owner uuid := gen_random_uuid();
 a_current text; a_draft text; a_share text; a_orphan text; a_missing text; a_bad_size text; b_foreign text; c_orphan text;
 before_counts jsonb; result jsonb; counts jsonb; before_rows jsonb; after_rows jsonb;
 items jsonb := '[]'; page jsonb; cursor_value text := null; iteration integer := 0; entry jsonb;
begin
 before_counts := public.nooks_artwork_inventory()->'counts';
 owner_a := (public.nooks_resolve_identity(namespace,repeat('a',64),null)->>'id')::uuid;
 owner_b := (public.nooks_resolve_identity(namespace,repeat('b',64),null)->>'id')::uuid;
 owner_c := (public.nooks_resolve_identity(namespace,repeat('c',64),null)->>'id')::uuid;
 a_current:=owner_a::text||'/'||repeat('1',64); a_draft:=owner_a::text||'/'||repeat('2',64);
 a_share:=owner_a::text||'/'||repeat('3',64); a_orphan:=owner_a::text||'/'||repeat('4',64);
 a_missing:=owner_a::text||'/'||repeat('5',64); a_bad_size:=owner_a::text||'/'||repeat('6',64);
 b_foreign:=owner_b::text||'/'||repeat('7',64); c_orphan:=owner_c::text||'/'||repeat('8',64);
 insert into public.nooks_workspaces(account_id,document) values
 (owner_a,jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',a_current,'mime','image/png')),
   'nookCreator',jsonb_build_object('drafts',jsonb_build_array(
     jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',a_draft,'mime','image/png'))),
     jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',a_current,'mime','image/png'))),
     jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',a_missing,'mime','image/png'))))),
   'note','DO_NOT_EMIT_NOTE_CONTENT','secret','DO_NOT_EMIT_CREDENTIAL_TEXT')),
 (owner_b,jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',b_foreign,'mime','image/png')))),
 (owner_c,jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',b_foreign,'mime','image/png')),
   'nookCreator',jsonb_build_object('drafts',jsonb_build_array(
     jsonb_build_object('space',jsonb_build_object('_storedBackground','DO_NOT_EMIT_MALFORMED_REF')),
     jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path','DO_NOT_EMIT_RAW_PATH','mime','image/png'))),
     jsonb_build_object('space','DO_NOT_EMIT_MALFORMED_CONTAINER')))));
 insert into public.nooks_shares(id,account_id,snapshot) values(gen_random_uuid(),owner_a,
   jsonb_build_object('space',jsonb_build_object('_storedBackground',jsonb_build_object('path',a_share,'mime','image/webp')),'description','DO_NOT_EMIT_SHARE_TEXT'));
 insert into storage.objects(bucket_id,name,metadata) values
 ('nooks-private',a_current,'{"size":100}'),('nooks-private',a_draft,'{"size":"200"}'),
 ('nooks-private',a_share,'{"size":300}'),('nooks-private',a_orphan,'{"size":400}'),
 ('nooks-private',a_bad_size,'{"size":"999999999999999999999999999999999"}'),
 ('nooks-private',b_foreign,'{"size":500}'),('nooks-private',c_orphan,'{"size":600}'),
 ('nooks-private',unknown_owner::text||'/'||repeat('9',64),'{"size":700}'),
 ('nooks-private','DO_NOT_EMIT_MALFORMED_OBJECT_NAME','{"size":800}'),
 ('unrelated-bucket','DO_NOT_EMIT_OTHER_PROJECT_OBJECT','{"size":999999}');
 select jsonb_build_object('objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
   'workspaces',(select jsonb_agg(to_jsonb(w) order by account_id) from public.nooks_workspaces w),
   'shares',(select jsonb_agg(to_jsonb(s) order by id) from public.nooks_shares s)) into before_rows;
 result := public.nooks_artwork_inventory(); counts := result->'counts';
 if result->>'mode'<>'dry_run' or result->>'bucket'<>'nooks-private' or result->>'metadataOnly'<>'true'
   or result->>'deletionSafe'<>'false' or result->>'inFlightUploadsTracked'<>'false' then raise exception 'Inventory overstates safety or reads another bucket'; end if;
 if result::text like '%DO_NOT_EMIT%' then raise exception 'Inventory exposed content or malformed paths'; end if;
 if (counts->>'objects')::integer-(before_counts->>'objects')::integer<>9
   or (counts->>'knownObjectBytes')::numeric-(before_counts->>'knownObjectBytes')::numeric<>3600
   or (counts->>'objectsWithUnknownBytes')::integer-(before_counts->>'objectsWithUnknownBytes')::integer<>1
   or (counts->>'malformedObjectNames')::integer-(before_counts->>'malformedObjectNames')::integer<>1 then raise exception 'Object or byte inventory is inaccurate'; end if;
 if counts->>'validReferenceOccurrences'<>'6' or counts->>'distinctReferencedPaths'<>'5'
   or counts->>'workspaceReferences'<>'2' or counts->>'draftReferences'<>'3' or counts->>'shareReferences'<>'1'
   or counts->>'invalidReferences'<>'3' or counts->>'malformedContainers'<>'1' or counts->>'quarantinedOwners'<>'2'
   or counts->>'referencedObjects'<>'4' or counts->>'missingReferencedPaths'<>'1'
   or counts->>'unreferencedObjectsAtSnapshot'<>'1' or counts->>'unreferencedKnownBytesAtSnapshot'<>'400'
   or counts->>'quarantinedPaths'<>'4' then raise exception 'Reference classification is inaccurate'; end if;
 if not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=a_share and x->>'status'='referenced')
   or not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=a_missing and x->>'status'='missing_metadata')
   or not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=a_orphan and x->>'status'='unreferenced_at_snapshot')
   or not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=b_foreign and x->>'status'='quarantined_reference')
   or not exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'path'=c_orphan and x->>'status'='quarantined_reference') then raise exception 'Share protection, missing reference or quarantine missing'; end if;
 loop
   page := public.nooks_artwork_inventory(2,cursor_value);
   if jsonb_array_length(page->'candidates')>2 then raise exception 'Inventory page is unbounded'; end if;
   items := items || (page->'candidates');
   exit when (page->>'hasMore')::boolean is false;
   if page->>'nextAfter' is null or (cursor_value is not null and page->>'nextAfter'<=cursor_value) then raise exception 'Inventory cursor does not advance'; end if;
   cursor_value := page->>'nextAfter'; iteration:=iteration+1;
   if iteration>10 then raise exception 'Inventory paging did not terminate'; end if;
 end loop;
 if items is distinct from result->'candidates' or page->'nextAfter'<>'null'::jsonb then raise exception 'Inventory pages lost or duplicated paths'; end if;
 for entry in select value from jsonb_array_elements(items) loop
   if (select array_agg(key order by key) from jsonb_object_keys(entry) key) is distinct from array['path','status']::text[] then raise exception 'Candidate metadata contains extra fields'; end if;
 end loop;
 begin perform public.nooks_artwork_inventory(51); raise exception 'Oversize inventory page accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.nooks_artwork_inventory(null); raise exception 'Null inventory limit accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.nooks_artwork_inventory(1,'DO_NOT_EMIT_CURSOR'); raise exception 'Malformed inventory cursor accepted'; exception when invalid_parameter_value then null; end;
 select jsonb_build_object('objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
   'workspaces',(select jsonb_agg(to_jsonb(w) order by account_id) from public.nooks_workspaces w),
   'shares',(select jsonb_agg(to_jsonb(s) order by id) from public.nooks_shares s)) into after_rows;
 if after_rows is distinct from before_rows then raise exception 'Inventory changed stored data'; end if;
 -- Malformed collection containers quarantine the owner without parsing private text.
 update public.nooks_workspaces set document=jsonb_set(document,'{nookCreator,drafts}','"DO_NOT_EMIT_BAD_ARRAY"') where account_id=owner_c;
 select jsonb_build_object('objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
   'workspaces',(select jsonb_agg(to_jsonb(w) order by account_id) from public.nooks_workspaces w),
   'shares',(select jsonb_agg(to_jsonb(s) order by id) from public.nooks_shares s)) into before_rows;
 page := public.nooks_artwork_inventory();
 if page::text like '%DO_NOT_EMIT%' or not exists(select 1 from jsonb_array_elements(page->'candidates') x where x->>'path'=c_orphan and x->>'status'='quarantined_reference') then raise exception 'Malformed creator collection was not quarantined safely'; end if;
 select jsonb_build_object('objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
   'workspaces',(select jsonb_agg(to_jsonb(w) order by account_id) from public.nooks_workspaces w),
   'shares',(select jsonb_agg(to_jsonb(s) order by id) from public.nooks_shares s)) into after_rows;
 if after_rows is distinct from before_rows then raise exception 'Inventory changed stored data'; end if;
end $$;
reset role;
select 'Artwork metadata inventory, quarantine, privacy and pagination checks passed' as result;
rollback;
