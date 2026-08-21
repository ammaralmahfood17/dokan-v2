-- ============================================================================
-- 0015_push_subscriptions_rls_fix.sql
-- Fix tenant-isolation on push_subscriptions: DELETE and SELECT previously
-- keyed on `auth.uid() = user_id` only, ignoring the project membership check
-- required by AGENTS.md ("any policy keying only on auth.uid() = user_id on
-- a table with project_id needs a membership EXISTS clause (staff_members)").
--
-- The push_subscriptions table carries `project_id uuid NOT NULL` (verified
-- in 0000_init.sql). The existing INSERT policy (0000_init.sql:1543) already
-- enforces the staff_members EXISTS check; DELETE and SELECT did not. This
-- migration mirrors the INSERT pattern onto both verbs.
-- ============================================================================

-- DELETE: require both ownership AND project membership.
DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    AND (EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE (sm.user_id = auth.uid())
        AND (sm.project_id = push_subscriptions.project_id)
    ))
  );

-- SELECT: same membership check. The old policy was the weakest link — any
-- authenticated user could read another tenant's push endpoints/keys on the
-- shared device-token table.
DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    AND (EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE (sm.user_id = auth.uid())
        AND (sm.project_id = push_subscriptions.project_id)
    ))
  );
