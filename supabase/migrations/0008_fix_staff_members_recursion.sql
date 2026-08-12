-- ============================================================================
-- 0008_fix_staff_members_recursion.sql
-- Phase: Hotfix — Production RLS infinite recursion
--
-- Symptom: every authenticated SELECT/UPDATE on public.staff_members failed
-- with "infinite recursion detected in policy for relation staff_members".
-- In production this broke getCurrentProject() (dashboard → /onboarding loop),
-- the POS membership guard (cancel → 403), and notification-prefs updates.
--
-- Root cause: 0004 replaced the clean SELECT + UPDATE policies with inline
-- `EXISTS (SELECT 1 FROM public.staff_members sm ...)` clauses. An inline
-- subquery on the SAME table as the policy runs under RLS as the querying
-- role → Postgres re-enters the policy → infinite recursion. The helpers
-- is_project_member / is_project_owner are SECURITY DEFINER and BYPASS RLS,
-- so they are safe to use inside policies (as every other table here does).
-- ============================================================================

DROP POLICY IF EXISTS staff_select_own_or_owner ON public.staff_members;
CREATE POLICY staff_select_own_or_owner ON public.staff_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_owner(project_id)
    OR public.is_project_member(project_id)
  );

DROP POLICY IF EXISTS staff_update_own_prefs ON public.staff_members;
CREATE POLICY staff_update_own_prefs ON public.staff_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- Column scope stays notify_push/notify_telegram via the existing
-- GRANT UPDATE (notify_push, notify_telegram) from the squashed baseline.