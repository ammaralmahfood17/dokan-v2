-- ============================================================================
-- 0001_security_hardening.sql
-- Audit remediation (2026-08-03) — applies on top of 0000_baseline_consolidated.
--
-- 1.  CRITICAL: order_sequences was the ONLY table (of 16) with no RLS and
--     `GRANT ALL ... TO anon` — anonymous DML on a live counter table.
--     The table is dead (nothing in src/ references it; next_order_number uses
--     daily_order_counters) — hardening it is zero-cost either way.
-- 2.  CRITICAL-family: anon no longer needs INSERT/UPDATE/DELETE on ANY table.
--     The public menu (server-side anon) only SELECTs products/categories/
--     product_addons/tables/projects. Everything else goes through the
--     service_role admin client. Strip the blanket `GRANT ALL TO anon`.
-- 3.  project_has_no_members() granted to anon → account-takeover vector on
--     abandoned projects (anon could insert themselves as first owner).
-- 4.  tables_public_read exposes `qrcode` (the table's scan token) to anon —
--     revoke column-level SELECT on qrcode.
-- 5.  projects_update_member has USING but no WITH CHECK → a member could
--     change the project_id column (or any column) to a row they don't belong
--     to. Add a WITH CHECK that mirrors the USING.
-- 6.  is_super_admin()/sync_business_subscription_status() reference
--     super_admins/businesses which do not exist in this schema (baseline is
--     not a faithful copy of legacy prod). Create the minimal super_admins
--     table and make the trigger function a safe no-op when businesses is
--     absent (it is not used by the app).
-- 7.  GRANT hygiene: REVOKE ALL ON TABLE ... FROM anon for every table that
--     the public menu does not need; also revoke EXECUTE on internal trigger
--     helpers from anon/authenticated (they were only ever called by the
--     trigger, which runs as the table owner).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. order_sequences — enable RLS, strip anon/authenticated entirely.
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sequences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_sequences FROM anon;
REVOKE ALL ON TABLE public.order_sequences FROM authenticated;
-- service_role keeps its grants (it manages counters when needed).

-- ---------------------------------------------------------------------------
-- 2. Strip anon DML from every table; keep only the SELECTs the public menu
--    server-render path needs.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.categories FROM anon;
REVOKE ALL ON TABLE public.order_audit_logs FROM anon;
REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE ALL ON TABLE public.order_items FROM anon;
REVOKE ALL ON TABLE public.products FROM anon;
REVOKE ALL ON TABLE public.product_addons FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.staff_members FROM anon;
REVOKE ALL ON TABLE public.tables FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM anon;
REVOKE ALL ON TABLE public.daily_order_counters FROM anon;

-- Public menu reads (server component, anon role):
GRANT SELECT ON TABLE public.projects TO anon;
-- tables: column-level SELECT only — qrcode (the table's scan token) must
-- stay hidden from anon. Table-level grants would override the column revoke.
GRANT SELECT (id, number, slug, is_active, project_id) ON TABLE public.tables TO anon;
GRANT SELECT ON TABLE public.categories TO anon;
GRANT SELECT ON TABLE public.products TO anon;
GRANT SELECT ON TABLE public.product_addons TO anon;

-- ---------------------------------------------------------------------------
-- 3. project_has_no_members — anon must NOT be able to claim abandoned
--    projects (staff_insert_first_owner checks it with the caller's role;
--    anon callers would bypass the owner-role requirement).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.project_has_no_members(uuid) FROM anon;
-- keep authenticated + service_role grants (first-owner onboarding is an
-- authenticated flow).

-- ---------------------------------------------------------------------------
-- 4. tables_public_read — hide the qrcode scan token from anon.
-- ---------------------------------------------------------------------------
REVOKE SELECT (qrcode) ON TABLE public.tables FROM anon;

-- ---------------------------------------------------------------------------
-- 5. projects_update_member — WITH CHECK must match USING so a member cannot
--    reparent a project row out of their membership.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS projects_update_member ON public.projects;
CREATE POLICY projects_update_member ON public.projects
  FOR UPDATE
  USING (public.is_project_member(id))
  WITH CHECK (public.is_project_member(id));

-- ---------------------------------------------------------------------------
-- 6. Minimal super_admins + safe subscription-sync trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The legacy sync trigger referenced a `businesses` table that does not
-- exist here; make it a harmless no-op when the table is absent instead of
-- erroring on every staff INSERT.
CREATE OR REPLACE FUNCTION public.sync_business_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.businesses') IS NOT NULL THEN
    UPDATE public.businesses
       SET subscription_status = 'active'
     WHERE owner_user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Internal trigger helpers — revoke direct EXECUTE from anon/authenticated.
--    (Triggers run as the table owner; roles never call these directly.)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_user_safety() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user_safety() FROM authenticated;
REVOKE ALL ON FUNCTION public.orders_protect_amounts() FROM anon;
REVOKE ALL ON FUNCTION public.orders_protect_amounts() FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_business_subscription_status() FROM anon;
REVOKE ALL ON FUNCTION public.sync_business_subscription_status() FROM authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_basic_slug(text) FROM anon;
REVOKE ALL ON FUNCTION public.generate_basic_slug(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM anon;
-- is_super_admin stays callable by authenticated (admin UI checks it).
