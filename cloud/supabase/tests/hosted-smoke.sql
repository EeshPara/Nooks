-- Run this entire file in ONE SQL execution, after all four Nooks migrations.
-- Suitable for Supabase execute_sql: no psql commands, extensions, DDL, or auth.users writes.
-- Every account, invite, outbox event, and study item below is uncommitted and rolled back.
-- A failed assertion aborts the transaction; ROLLBACK must still be executed by the caller
-- if its SQL client stops on error and retains the connection. Never replace ROLLBACK with COMMIT.
-- This checks the Sites service-RPC path, not browser login or real Sites identity verification.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_run text := gen_random_uuid()::text;
  v_function record;
  v_role text;
BEGIN
  PERFORM set_config('nooks.smoke.namespace', 'sites:nooks-hosted-smoke:' || v_run, true);
  -- Synthetic 64-hex subjects, unique to this run; these are not credentials.
  PERFORM set_config('nooks.smoke.alice_subject', md5(v_run || ':alice') || md5(':alice:' || v_run), true);
  PERFORM set_config('nooks.smoke.bob_subject', md5(v_run || ':bob') || md5(':bob:' || v_run), true);
  PERFORM set_config('nooks.smoke.invite', md5(v_run || ':invite') || md5(':invite:' || v_run), true);
  PERFORM set_config('nooks.smoke.unmapped_auth', gen_random_uuid()::text, true);
  IF to_regprocedure('public.nooks_request_limit(uuid,text,integer,integer)') IS NULL
     OR to_regprocedure('public.nooks_community(uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.nooks_webhook_receive(text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'FAIL: apply all four Nooks migrations before running this smoke test';
  END IF;
  -- Explicit grants must work on new Supabase projects without implicit public grants.
  FOR v_function IN
    SELECT p.oid, p.proname, p.prosecdef FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND left(p.proname,6)='nooks_'
  LOOP
    IF v_function.prosecdef OR NOT has_function_privilege('service_role',v_function.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: service RPC % must be INVOKER and executable by service_role',v_function.proname;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(v_role,v_function.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: role % can execute service RPC %',v_role,v_function.proname;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND left(c.relname,6)='nooks_' AND c.relkind='r' AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'FAIL: a public Nooks table has RLS disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='nooks-private' AND NOT public
    AND file_size_limit=1048576 AND allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp']) THEN
    RAISE EXCEPTION 'FAIL: private artwork bucket or upload limits are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND policyname='nooks_artwork_own_read') THEN
    RAISE EXCEPTION 'FAIL: private artwork read policy is missing';
  END IF;
  IF to_regclass('realtime.messages') IS NULL OR
    (SELECT count(*) FROM pg_policies WHERE schemaname='realtime' AND tablename='messages'
      AND policyname IN ('nooks_private_receive','nooks_member_presence'))<>2 THEN
    RAISE EXCEPTION 'FAIL: managed Realtime schema or the two Nooks policies are missing';
  END IF;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_namespace text := current_setting('nooks.smoke.namespace');
  v_alice uuid;
  v_bob uuid;
  v_nook uuid;
  v_invite uuid;
  v_workspace jsonb := '{"version":1,"artifacts":[],"progress":[],"focusSessions":[],"roomProgress":{},"reviews":{},"plan":{"tasks":[]}}';
  v_alice_workspace jsonb;
  v_bob_workspace jsonb;
  v_result jsonb;
BEGIN
  v_alice := (public.nooks_resolve_identity(v_namespace,current_setting('nooks.smoke.alice_subject'),NULL)->>'id')::uuid;
  v_bob := (public.nooks_resolve_identity(v_namespace,current_setting('nooks.smoke.bob_subject'),NULL)->>'id')::uuid;
  IF v_alice IS NULL OR v_bob IS NULL OR v_alice=v_bob THEN
    RAISE EXCEPTION 'FAIL: distinct Sites subjects did not resolve to distinct accounts';
  END IF;
  PERFORM set_config('nooks.smoke.alice',v_alice::text,true);
  PERFORM set_config('nooks.smoke.bob',v_bob::text,true);
  IF (public.nooks_resolve_identity(v_namespace,current_setting('nooks.smoke.alice_subject'),NULL)->>'id')::uuid IS DISTINCT FROM v_alice THEN
    RAISE EXCEPTION 'FAIL: resolving the same Sites subject is not idempotent';
  END IF;
  IF EXISTS (SELECT 1 FROM public.nooks_accounts WHERE id IN(v_alice,v_bob) AND auth_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: test Sites identities unexpectedly linked to Auth users';
  END IF;
  v_alice_workspace := jsonb_set(v_workspace,'{artifacts}',
    '[{"id":"smoke-shared-artifact-id","kind":"note","title":"Alice smoke note","content":"Alice-only controlled smoke text"}]');
  v_bob_workspace := jsonb_set(v_workspace,'{artifacts}',
    '[{"id":"smoke-shared-artifact-id","kind":"note","title":"Bob smoke note","content":"Bob-only controlled smoke text"}]');
  v_result := public.nooks_workspace_commit(v_alice,0,v_alice_workspace);
  IF v_result IS DISTINCT FROM '{"committed":true,"revision":1}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: Alice initial commit failed: %',v_result;
  END IF;
  v_result := public.nooks_workspace_commit(v_bob,0,v_bob_workspace);
  IF v_result IS DISTINCT FROM '{"committed":true,"revision":1}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: Bob initial commit failed: %',v_result;
  END IF;
  IF (public.nooks_workspace_read(v_alice)#>'{workspace,artifacts}') IS DISTINCT FROM (v_alice_workspace->'artifacts')
    OR (public.nooks_workspace_read(v_bob)#>'{workspace,artifacts}') IS DISTINCT FROM (v_bob_workspace->'artifacts') THEN
    RAISE EXCEPTION 'FAIL: identical artifact IDs crossed account boundaries';
  END IF;
  v_result := public.nooks_workspace_commit(v_alice,0,v_bob_workspace);
  IF v_result IS DISTINCT FROM '{"committed":false,"revision":1}'::jsonb
    OR (public.nooks_workspace_read(v_alice)#>'{workspace,artifacts}') IS DISTINCT FROM (v_alice_workspace->'artifacts') THEN
    RAISE EXCEPTION 'FAIL: stale revision overwrote newer saved work';
  END IF;
  -- Updating Alice's complete workspace must not delete Bob's same-named note.
  v_result := public.nooks_workspace_commit(v_alice,1,v_workspace);
  IF v_result IS DISTINCT FROM '{"committed":true,"revision":2}'::jsonb
    OR (public.nooks_workspace_read(v_bob)#>'{workspace,artifacts}') IS DISTINCT FROM (v_bob_workspace->'artifacts') THEN
    RAISE EXCEPTION 'FAIL: deleting Alice material changed Bob material';
  END IF;
  v_nook := (public.nooks_community(v_alice,'create_nook',jsonb_build_object(
    'requestId',gen_random_uuid(),'title','Uncommitted smoke nook','description','Rolled back by smoke test',
    'roomId','rainy-library','visibility','private'))#>>'{nook,id}')::uuid;
  IF v_nook IS NULL THEN RAISE EXCEPTION 'FAIL: private nook creation failed'; END IF;
  PERFORM set_config('nooks.smoke.nook',v_nook::text,true);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.nooks_community(v_bob,'list_nooks')->'nooks') n
    WHERE n->>'id'=v_nook::text) THEN
    RAISE EXCEPTION 'FAIL: outsider discovered private nook';
  END IF;
  BEGIN
    PERFORM public.nooks_community(v_bob,'nook_snapshot',jsonb_build_object('nookId',v_nook));
    RAISE EXCEPTION 'FAIL: outsider accessed private roster';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.nooks_community(v_bob,'join_nook',jsonb_build_object('nookId',v_nook));
    RAISE EXCEPTION 'FAIL: outsider joined private nook without invite';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_invite := (public.nooks_community(v_alice,'create_invite',jsonb_build_object(
    'nookId',v_nook,'tokenHash',current_setting('nooks.smoke.invite'),'maxUses',1,'expiresInHours',1))#>>'{invite,id}')::uuid;
  v_result := public.nooks_community(v_bob,'accept_invite',jsonb_build_object('tokenHash',current_setting('nooks.smoke.invite')));
  IF (v_result->>'joined')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: invited account could not join'; END IF;
  v_result := public.nooks_community(v_bob,'accept_invite',jsonb_build_object('tokenHash',current_setting('nooks.smoke.invite')));
  IF (v_result->>'duplicate')::boolean IS DISTINCT FROM true
    OR (SELECT uses FROM public.nooks_invites WHERE id=v_invite) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL: invitation retry consumed another use';
  END IF;
  v_result := public.nooks_community(v_bob,'nook_snapshot',jsonb_build_object('nookId',v_nook));
  IF (v_result->>'memberCount')::integer IS DISTINCT FROM 2 OR jsonb_array_length(v_result->'members') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FAIL: invited member cannot read the shared roster';
  END IF;
  BEGIN
    PERFORM public.nooks_community(v_bob,'create_invite',jsonb_build_object('nookId',v_nook,
      'tokenHash',repeat('e',64),'maxUses',1,'expiresInHours',1));
    RAISE EXCEPTION 'FAIL: non-owner created a private invite';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.nooks_community(v_bob,'leave_nook',jsonb_build_object('nookId',v_nook));
  BEGIN
    PERFORM public.nooks_community(v_bob,'nook_snapshot',jsonb_build_object('nookId',v_nook));
    RAISE EXCEPTION 'FAIL: departed member retained private roster access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.nooks_community(v_bob,'accept_invite',jsonb_build_object('tokenHash',current_setting('nooks.smoke.invite')));
    RAISE EXCEPTION 'FAIL: exhausted invite admitted departed member again';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- No Auth account is created. An unmapped, syntactically valid JWT subject must
-- not inherit either Sites identity or bypass private RLS. Real mapped-user RLS
-- and login/refresh still require a separate two-real-account integration test.
SELECT set_config('request.jwt.claim.sub',current_setting('nooks.smoke.unmapped_auth'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('nooks.smoke.unmapped_auth'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_alice uuid := current_setting('nooks.smoke.alice')::uuid;
BEGIN
  IF nooks_private.current_account() IS NOT NULL THEN RAISE EXCEPTION 'FAIL: unmapped JWT acquired an account'; END IF;
  IF EXISTS (SELECT 1 FROM public.nooks_workspaces WHERE account_id IN(v_alice,current_setting('nooks.smoke.bob')::uuid))
    OR EXISTS (SELECT 1 FROM public.nooks_artifacts WHERE account_id IN(v_alice,current_setting('nooks.smoke.bob')::uuid))
    OR EXISTS (SELECT 1 FROM public.nooks_members WHERE nook_id=current_setting('nooks.smoke.nook')::uuid)
    OR EXISTS (SELECT 1 FROM public.nooks_rooms WHERE id=current_setting('nooks.smoke.nook')::uuid) THEN
    RAISE EXCEPTION 'FAIL: authenticated outsider read protected Sites-owned data';
  END IF;
  IF nooks_private.can_receive_topic('nook:'||current_setting('nooks.smoke.nook'))
    OR nooks_private.can_receive_topic('account:'||v_alice::text) THEN
    RAISE EXCEPTION 'FAIL: unmapped JWT authorized for a private Realtime topic';
  END IF;
  BEGIN
    PERFORM public.nooks_workspace_read(v_alice);
    RAISE EXCEPTION 'FAIL: authenticated can call service workspace RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.nooks_community(v_alice,'list_nooks');
    RAISE EXCEPTION 'FAIL: authenticated can impersonate a service community actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.nooks_workspace_read(current_setting('nooks.smoke.alice')::uuid);
    RAISE EXCEPTION 'FAIL: anon can call service workspace RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.nooks_resolve_identity(current_setting('nooks.smoke.namespace'),repeat('f',64),NULL);
    RAISE EXCEPTION 'FAIL: anon can create a verified identity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT 'Nooks hosted smoke tests passed; all temporary data is rolled back by the next statement' AS result;
ROLLBACK;
