-- Perf: wrap auth.uid() in (select auth.uid()) in RLS policies so Postgres
-- evaluates it once per query instead of once per row (Supabase RLS best
-- practice — see auth_rls_initplan advisor). Pure performance change: no
-- security/logic change, verified against the exact prior qual/with_check
-- text before rewriting.

ALTER POLICY staff_select_own_or_owner ON public.staff_members
  USING ((user_id = (select auth.uid())) OR is_project_owner(project_id) OR is_project_member(project_id));

ALTER POLICY staff_update_own_prefs ON public.staff_members
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY staff_insert_first_owner ON public.staff_members
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND (role = 'owner'::text)
    AND project_has_no_members(project_id)
    AND (EXISTS (SELECT 1 FROM projects p WHERE p.id = staff_members.project_id AND p.created_by = (select auth.uid())))
  );

ALTER POLICY push_subscriptions_select ON public.push_subscriptions
  USING (
    ((select auth.uid()) = user_id)
    AND (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = (select auth.uid()) AND sm.project_id = push_subscriptions.project_id))
  );

ALTER POLICY push_subscriptions_insert ON public.push_subscriptions
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.project_id = push_subscriptions.project_id AND sm.user_id = (select auth.uid())))
  );

ALTER POLICY push_subscriptions_delete ON public.push_subscriptions
  USING (
    ((select auth.uid()) = user_id)
    AND (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = (select auth.uid()) AND sm.project_id = push_subscriptions.project_id))
  );

-- Drop exact-duplicate indexes flagged by the performance advisor.
DROP INDEX IF EXISTS public.idx_feedback_project;
DROP INDEX IF EXISTS public.idx_push_sub_project;
