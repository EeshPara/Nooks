-- Operator-only, metadata-only observation. Never a deletion authorization.
begin;
create function public.nooks_artwork_inventory(p_limit integer default 50,p_after text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 v_result jsonb;
 v_path_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}$';
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
       and (ref->>'path') ~ ('^'||account_id::text||'/[0-9a-f]{64}$')
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
revoke all on function public.nooks_artwork_inventory(integer,text) from public,anon,authenticated;
grant execute on function public.nooks_artwork_inventory(integer,text) to service_role;
comment on function public.nooks_artwork_inventory(integer,text) is 'Service-only read-only artwork metadata inventory. No byte availability proof, in-flight pins, or deletion authorization. Run with a statement timeout; pages are point-in-time observations.';
commit;
