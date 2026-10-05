-- Owner-only privacy changes serialize with joins, invitation acceptance and archive.
create or replace function public.nooks_set_visibility(p_actor uuid,p_nook_id uuid,p_visibility text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_room public.nooks_rooms%rowtype;
begin
 if p_visibility is null or p_visibility not in ('public','private') then
   raise exception 'Invalid visibility' using errcode='22023';
 end if;
 if p_actor is null or not exists(select 1 from public.nooks_accounts where id=p_actor) then
   raise exception 'Account required' using errcode='42501';
 end if;
 select * into v_room from public.nooks_rooms where id=p_nook_id for update;
 if not found or v_room.archived_at is not null or v_room.owner_id<>p_actor
   or not exists(select 1 from public.nooks_members where nook_id=p_nook_id and account_id=p_actor and role='owner' and left_at is null) then
   raise exception 'Only the active nook owner can change privacy' using errcode='42501';
 end if;
 update public.nooks_rooms set visibility=p_visibility where id=p_nook_id and visibility<>p_visibility;
 return jsonb_build_object('nook',nooks_private.nook_summary(p_nook_id,p_actor));
end $$;
revoke all on function public.nooks_set_visibility(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nooks_set_visibility(uuid,uuid,text) to service_role;
