-- ============================================================================
-- 0006_projects_created_by_anon_hide.sql
-- Audit remediation round 2, second pass (2026-08-04).
--
-- 0005 just added public.projects.created_by. Because projects_public_read
-- (anon) exposes the WHOLE row of every active project, the new column
-- immediately leaked the owner's auth.users uuid to the public API.
--
-- Fix: strip the table-level anon SELECT on projects and re-grant it
-- COLUMN-scoped — exactly the pattern 0001 used to hide tables.qrcode.
-- Non-anon readers (authenticated / service_role) are unaffected.
-- ============================================================================

REVOKE SELECT ON TABLE public.projects FROM anon;

-- Menu / public surfaces only need identity + addressability; created_by
-- (internal ownership) stays private. is_active drives projects_public_read.
GRANT SELECT (id, name, slug, currency, primary_color, logo_url, is_active, created_at)
  ON TABLE public.projects TO anon;