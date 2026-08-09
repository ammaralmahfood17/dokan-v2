-- ============================================================================
-- 0003_lockdown_projects_insert.sql
-- Deep-code audit fix (2026-08-09)
--
-- PROBLEM: any authenticated client could bypass the onboarding flow entirely:
--   GRANT ALL ON TABLE public.projects TO authenticated (0000 line 1902) +
--   projects_insert_authenticated (WITH CHECK auth.uid() IS NOT NULL).
-- An attacker POSTs /rest/v1/projects with their anon key, then
--   /rest/v1/staff_members { role: 'owner', project_has_no_members(...) }
-- to mint unlimited live stores — free of the onboarding route's 3/hour
-- rate limit, name/currency/color validation, and slug rules — and to set
-- subscription fields directly.
--
-- FIX: project creation is server-side only (onboarding route + super-admin
-- routes use the service_role admin client). Reads and owner-scoped UPDATE
-- are kept (settings page updates via the authenticated client under the
-- projects_update_owner policy).
-- ============================================================================

DROP POLICY IF EXISTS projects_insert_authenticated ON public.projects;

GRANT SELECT, UPDATE ON TABLE public.projects TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.projects FROM authenticated;