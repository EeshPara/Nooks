begin;
set local role service_role;
do $$
declare namespace text := 'sites:nooks-privacy:'||gen_random_uuid(); owner_id uuid; member_id uuid; outsider uuid; room uuid; result jsonb; token text := repeat('a',64);
begin
 owner_id := (public.nooks_resolve_identity(namespace,repeat('a',64),null)->>'id')::uuid;
 member_id := (public.nooks_resolve_identity(namespace,repeat('b',64),null)->>'id')::uuid;
 outsider := (public.nooks_resolve_identity(namespace,repeat('c',64),null)->>'id')::uuid;
 room := (public.nooks_community(owner_id,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title','Privacy test','visibility','public','roomId','rainy-library'))#>>'{nook,id}')::uuid;
 perform public.nooks_community(member_id,'join_nook',jsonb_build_object('nookId',room));
 begin perform public.nooks_set_visibility(member_id,room,'private'); raise exception 'Non-owner changed privacy'; exception when insufficient_privilege then null; end;
 begin perform public.nooks_set_visibility(owner_id,room,'hidden'); raise exception 'Invalid visibility accepted'; exception when invalid_parameter_value then null; end;
 result := public.nooks_set_visibility(owner_id,room,'private');
 perform nooks_test.assert(result#>>'{nook,visibility}'='private','owner can make private');
 perform public.nooks_set_visibility(owner_id,room,'private');
 perform nooks_test.assert(public.nooks_community(member_id,'nook_snapshot',jsonb_build_object('nookId',room))#>>'{nook,joined}'='true','current member retained');
 perform nooks_test.assert(not exists(select 1 from jsonb_array_elements(public.nooks_community(outsider,'list_nooks','{}')->'nooks') n where n->>'id'=room::text),'private hidden from outsiders');
 begin perform public.nooks_community(outsider,'join_nook',jsonb_build_object('nookId',room)); raise exception 'Private joined without invite'; exception when insufficient_privilege then null; end;
 perform public.nooks_community(owner_id,'create_invite',jsonb_build_object('nookId',room,'tokenHash',token,'maxUses',1));
 perform public.nooks_community(outsider,'accept_invite',jsonb_build_object('tokenHash',token));
 perform nooks_test.assert(public.nooks_community(outsider,'nook_snapshot',jsonb_build_object('nookId',room))#>>'{nook,joined}'='true','invite grants private access');
 perform public.nooks_set_visibility(owner_id,room,'public');
 perform public.nooks_community(owner_id,'archive_nook',jsonb_build_object('nookId',room));
 begin perform public.nooks_set_visibility(owner_id,room,'private'); raise exception 'Archived nook changed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select nooks_test.assert(not has_function_privilege('anon','public.nooks_set_visibility(uuid,uuid,text)','execute'),'anon denied');
select nooks_test.assert(not has_function_privilege('authenticated','public.nooks_set_visibility(uuid,uuid,text)','execute'),'direct authenticated denied');
rollback;
