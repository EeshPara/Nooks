-- Checks only the isolated restored database. Mutating checks roll back together.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
select nooks_test.assert((select count(*) from nooks_test.restore_fixture)=2,'two restored fixture owners');
select nooks_test.assert((select count(*) from auth.users)=2,'two restored auth stub users');
select nooks_test.assert((select count(*) from public.nooks_accounts)=2,'two restored Nooks accounts');
select nooks_test.assert((select count(*) from storage.objects)=0,'no real or simulated Storage object records');
select nooks_test.assert((select not public and file_size_limit=1048576 from storage.buckets where id='nooks-private'),'private bucket configuration restored');
set local role service_role;
do $$
declare fixture record; result jsonb; before_workspace jsonb; other_workspace jsonb;
begin
  for fixture in select * from nooks_test.restore_fixture order by label loop
    result := public.nooks_workspace_read(fixture.account_id);
    perform nooks_test.assert((result->>'revision')::bigint=fixture.revision,'workspace revision restored');
    perform nooks_test.assert(result->'workspace'=fixture.workspace,'complete private workspace restored');
    perform nooks_test.assert(result#>>'{workspace,space,_storedBackground,path}'=fixture.account_id::text||'/'||repeat('c',64),'owner-scoped opaque artwork reference preserved');
    perform nooks_test.assert((select auth_user_id=fixture.auth_user_id from public.nooks_accounts where id=fixture.account_id),'auth-to-account binding restored');
    perform nooks_test.assert((public.nooks_resolve_identity('local:restore-drill',case fixture.label when 'alice' then repeat('a',64) else repeat('b',64) end,fixture.auth_user_id)->>'id')::uuid=fixture.account_id,'stable identity link restored');
    before_workspace := result;
    result := public.nooks_workspace_commit(fixture.account_id,fixture.revision-1,jsonb_set(fixture.workspace,'{artifacts}','[]'));
    perform nooks_test.assert((result->>'committed')::boolean=false and (result->>'revision')::bigint=fixture.revision,'restored CAS rejects stale destructive save');
    perform nooks_test.assert(public.nooks_workspace_read(fixture.account_id)=before_workspace,'rejected save leaves private material untouched');
    select public.nooks_workspace_read(account_id) into other_workspace from nooks_test.restore_fixture where account_id<>fixture.account_id;
    result := public.nooks_workspace_commit(fixture.account_id,fixture.revision,jsonb_set(fixture.workspace,'{plan,tasks,0,done}','true'));
    perform nooks_test.assert((result->>'committed')::boolean and (result->>'revision')::bigint=fixture.revision+1,'restored current revision can save');
    perform nooks_test.assert((public.nooks_workspace_read(fixture.account_id)#>>'{workspace,plan,tasks,0,done}')::boolean,'restored plan update persisted');
    perform nooks_test.assert((select public.nooks_workspace_read(account_id)=other_workspace from nooks_test.restore_fixture where account_id<>fixture.account_id),'save does not modify other owner');
  end loop;
end $$;
reset role;
-- Bind the intended owner IDs before switching to the actual non-bypassing role.
select set_config('nooks.restore.alice',(select account_id::text from nooks_test.restore_fixture where label='alice'),true);
select set_config('nooks.restore.bob',(select account_id::text from nooks_test.restore_fixture where label='bob'),true);
set local request.jwt.claim.sub='41000000-0000-4000-8000-000000000001';
set local role authenticated;
select nooks_test.assert((select count(*) from public.nooks_accounts)=1,'authenticated owner sees only own account');
select nooks_test.assert((select count(*) from public.nooks_workspaces)=1,'authenticated owner sees only own workspace');
select nooks_test.assert((select count(*) from public.nooks_artifacts)=4,'authenticated owner sees own four artifacts');
select nooks_test.assert((select count(*) from public.nooks_artifacts where account_id=current_setting('nooks.restore.bob')::uuid)=0,'other owner private artifacts inaccessible');
select nooks_test.assert((select payload->>'title'='alice synthetic note' from public.nooks_artifacts where id='same-note-id'),'same artifact ID resolves to correct owner');
select nooks_test.assert((select count(*) from public.nooks_rooms)=1,'other owner private nook hidden');
do $$ begin
  begin perform public.nooks_workspace_read(current_setting('nooks.restore.bob')::uuid); raise exception 'client called service RPC'; exception when insufficient_privilege then null; end;
  begin update public.nooks_artifacts set payload='{}'; raise exception 'client wrote artifact'; exception when insufficient_privilege then null; end;
  begin select count(*) from public.nooks_identity_links; raise exception 'client read identity links'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='41000000-0000-4000-8000-000000000002';
set local role authenticated;
select nooks_test.assert((select count(*) from public.nooks_artifacts)=4,'second owner sees own four artifacts');
select nooks_test.assert((select payload->>'title'='bob synthetic note' from public.nooks_artifacts where id='same-note-id'),'second owner cannot resolve first owner duplicate ID');
select nooks_test.assert((select count(*) from public.nooks_workspaces where account_id=current_setting('nooks.restore.alice')::uuid)=0,'second owner cannot read first workspace');
reset role;
set local role anon;
do $$ begin
  begin select count(*) from public.nooks_artifacts; raise exception 'anon read private artifact'; exception when insufficient_privilege then null; end;
  begin perform public.nooks_workspace_read(current_setting('nooks.restore.alice')::uuid); raise exception 'anon called service RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Restored owner isolation, private artifact contents, ACLs, identity links, artwork references and CAS tests passed' as result;
rollback;
