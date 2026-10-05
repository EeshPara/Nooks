-- Synthetic fixtures for run-restore-drill.mjs ONLY. Never run against a hosted project.
create table nooks_test.restore_fixture (
  label text primary key,
  account_id uuid not null,
  auth_user_id uuid not null,
  revision bigint not null,
  workspace jsonb not null
);
grant select,insert on nooks_test.restore_fixture to service_role;
insert into auth.users(id) values
  ('41000000-0000-4000-8000-000000000001'),
  ('41000000-0000-4000-8000-000000000002');
set role service_role;
do $$
declare
  label text; auth_id uuid; account uuid; workspace jsonb; response jsonb; nook uuid;
begin
  foreach label in array array['alice','bob'] loop
    auth_id := case label when 'alice' then '41000000-0000-4000-8000-000000000001'::uuid else '41000000-0000-4000-8000-000000000002'::uuid end;
    account := (public.nooks_resolve_identity('local:restore-drill',case label when 'alice' then repeat('a',64) else repeat('b',64) end,auth_id)->>'id')::uuid;
    workspace := jsonb_build_object(
      'version',1,
      'artifacts',jsonb_build_array(
        jsonb_build_object('id','same-note-id','kind','note','title',label||' synthetic note','content','Synthetic private material for '||label||'. No real student data.','revision',1,'courseId','course-one','topicId','topic-one'),
        jsonb_build_object('id','same-cards-id','kind','flashcards','title',label||' cards','cards',jsonb_build_array(jsonb_build_object('front','Synthetic question','back',label||' synthetic answer'))),
        jsonb_build_object('id','same-quiz-id','kind','quiz','title',label||' quiz','questions',jsonb_build_array(jsonb_build_object('prompt','Synthetic question','options',jsonb_build_array('A','B'),'answer',0))),
        jsonb_build_object('id','same-exam-id','kind','exam','title',label||' exam','questions',jsonb_build_array(jsonb_build_object('prompt','Synthetic exam question','answer',label)))) ,
      'progress',jsonb_build_array(jsonb_build_object('sessionId','same-practice-id','artifactId','same-cards-id','score',1,'total',1)),
      'focusSessions',jsonb_build_array(jsonb_build_object('id','same-focus-id','roomId','rainy-library','targetMinutes',25,'startedAt','2026-10-01T12:00:00Z','completedAt','2026-10-01T12:25:00Z')),
      'roomProgress',jsonb_build_object('rainy-library',jsonb_build_object('xp',25,'level',1)),
      'organization',jsonb_build_object('schemaVersion',1,'courses',jsonb_build_array(jsonb_build_object('id','course-one','name',label||' course')),'topics',jsonb_build_array(jsonb_build_object('id','topic-one','courseId','course-one','name','Synthetic topic')),'noteRevisions',jsonb_build_array(jsonb_build_object('id','revision-one','artifactId','same-note-id','revision',1,'content',label||' initial note'))),
      'plan',jsonb_build_object('tasks',jsonb_build_array(jsonb_build_object('id','same-task-id','title',label||' review','done',false)),'revision',2),
      'space',jsonb_build_object('name',label||' room','_storedBackground',jsonb_build_object('path',account::text||'/'||repeat('c',64),'mime','image/png'))
    );
    response := public.nooks_workspace_commit(account,0,workspace);
    perform nooks_test.assert((response->>'committed')::boolean,'initial fixture commit');
    workspace := jsonb_set(workspace,'{artifacts,0,revision}','2');
    workspace := jsonb_set(workspace,'{artifacts,0,content}',to_jsonb('Synthetic revised private material for '||label||'. No real student data.'));
    response := public.nooks_workspace_commit(account,1,workspace);
    perform nooks_test.assert((response->>'committed')::boolean,'second fixture commit');
    perform nooks_test.assert(public.nooks_workspace_read(account)->'workspace'=workspace,'fixture round trip matches intended workspace');
    insert into nooks_test.restore_fixture values(label,account,auth_id,2,workspace);
    nook := (public.nooks_community(account,'create_nook',jsonb_build_object('requestId',gen_random_uuid(),'title',label||' private nook','roomId','rainy-library','visibility','private'))#>>'{nook,id}')::uuid;
    perform public.nooks_community(account,'create_invite',jsonb_build_object('nookId',nook,'tokenHash',case label when 'alice' then repeat('d',64) else repeat('e',64) end,'maxUses',1));
    perform public.nooks_request_limit(account,'generation',1,3600);
  end loop;
  perform public.nooks_webhook_receive('local:restore-drill','synthetic-event',repeat('f',64),'membership.updated');
end $$;
reset role;
select nooks_test.assert((select count(*) from public.nooks_accounts)=2,'exactly two synthetic owners');
select nooks_test.assert((select count(*) from public.nooks_artifacts)=8,'four private artifact formats for each owner');
select nooks_test.assert((select count(*) from storage.objects)=0,'no Storage object bytes or metadata fixture');
